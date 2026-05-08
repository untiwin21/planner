'use client'
import { useState, useMemo, useEffect } from 'react'
import { Plus, Pause, Play, Archive, Trash2, Check, X, ChevronUp, ChevronDown } from 'lucide-react'
import { formatDate, getWeekDays } from '@/lib/dates'
import { CircleCheck, ProgressBar } from '@/components/ui'
import type { Routine, RoutineLog, RoutineStatus, RoutinePeriod } from '@/types'
import { subDays, parseISO, startOfMonth, endOfMonth, format } from 'date-fns'
import clsx from 'clsx'

const PERIOD_ORDER: RoutinePeriod[] = ['morning', 'afternoon', 'evening', 'anytime']
const PERIOD_LABELS: Record<RoutinePeriod, string> = { morning: '아침', afternoon: '오후', evening: '저녁', anytime: '언제든' }

function groupByPeriod(routines: Routine[]): Record<RoutinePeriod, Routine[]> {
  const groups: Record<RoutinePeriod, Routine[]> = { morning: [], afternoon: [], evening: [], anytime: [] }
  for (const r of routines) {
    groups[r.period ?? 'anytime'].push(r)
  }
  for (const p of PERIOD_ORDER) {
    groups[p].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }
  return groups
}

interface Props {
  routines: Routine[]
  logs: RoutineLog[]
  goalRoutines: Routine[]
  goalLabel?: string
  onToggleLog: (routineId: string, date: string) => void
  onAddRoutine: (name: string, time?: string, period?: RoutinePeriod) => void
  onSetStatus: (id: string, status: RoutineStatus) => void
  onUpdateName: (id: string, name: string) => void
  onUpdateRoutine: (id: string, patch: Partial<Omit<Routine, 'id'>>) => void
  onReorderRoutine: (id: string, direction: 'up' | 'down') => void
  onDeleteRoutine: (id: string) => void
}

function calcStreak(routineId: string, todayStr: string, logs: RoutineLog[]): number {
  let streak = 0
  let date = parseISO(todayStr)
  while (true) {
    const dateStr = formatDate(date)
    if (!logs.find(l => l.routine_id === routineId && l.date === dateStr && l.done)) break
    streak++
    date = subDays(date, 1)
  }
  return streak
}

function calcBestStreak(routineId: string, logs: RoutineLog[]): number {
  const doneDates = logs
    .filter(l => l.routine_id === routineId && l.done)
    .map(l => l.date)
    .sort()
  if (doneDates.length === 0) return 0
  let best = 1, current = 1
  for (let i = 1; i < doneDates.length; i++) {
    const prev = parseISO(doneDates[i - 1])
    const curr = parseISO(doneDates[i])
    const diff = (curr.getTime() - prev.getTime()) / 86400000
    if (diff === 1) { current++; if (current > best) best = current }
    else if (diff > 1) current = 1
  }
  return best
}

function streakBadge(streak: number): { emoji: string; bg: string } | null {
  if (streak >= 100) return { emoji: '👑', bg: 'bg-[var(--amber-bg)] text-[var(--amber-text)]' }
  if (streak >= 30) return { emoji: '⚡', bg: 'bg-[var(--purple-bg)] text-[var(--purple-text)]' }
  if (streak >= 7) return { emoji: '🔥', bg: 'bg-[var(--amber-bg)] text-[var(--amber-text)]' }
  return null
}

function derivePeriodFromTime(time?: string): RoutinePeriod {
  if (!time) return 'anytime'
  const h = parseInt(time.split(':')[0], 10)
  if (h >= 5 && h < 12) return 'morning'
  if (h >= 12 && h < 18) return 'afternoon'
  return 'evening'
}

export function RoutineSidebar({
  routines, logs, goalRoutines, goalLabel,
  onToggleLog, onAddRoutine, onSetStatus, onUpdateName, onUpdateRoutine, onReorderRoutine, onDeleteRoutine,
}: Props) {
  const today = formatDate(new Date())
  const [showManage, setShowManage] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTime, setNewTime] = useState('')
  const [newPeriod, setNewPeriod] = useState<RoutinePeriod | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const activeRoutines = useMemo(() => {
    if (goalRoutines.length > 0) return goalRoutines.filter(r => r.status === 'active')
    return routines.filter(r => r.status === 'active')
  }, [goalRoutines, routines])

  const doneCnt = activeRoutines.filter(r =>
    logs.find(l => l.routine_id === r.id && l.date === today && l.done)
  ).length

  const activeAll = routines.filter(r => r.status === 'active')
  const pausedAll = routines.filter(r => r.status === 'paused')
  const archivedAll = routines.filter(r => r.status === 'archived')

  const historyDays = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => formatDate(subDays(new Date(), 13 - i))), [])

  const activeGrouped = useMemo(() => groupByPeriod(activeRoutines), [activeRoutines])
  const historyGrouped = useMemo(() => groupByPeriod(routines.filter(r => r.status !== 'archived').slice(0, 12)), [routines])

  function handleAdd() {
    if (!newName.trim()) return
    const period = newPeriod ?? derivePeriodFromTime(newTime || undefined)
    onAddRoutine(newName.trim(), newTime || undefined, period)
    setNewName('')
    setNewTime('')
    setNewPeriod(null)
    setShowAdd(false)
  }

  function submitEdit(id: string) {
    if (editName.trim()) onUpdateName(id, editName.trim())
    setEditingId(null)
  }

  function renderPeriodHeader(period: RoutinePeriod) {
    return (
      <div className="flex items-center gap-2 mt-2 mb-1 first:mt-0">
        <span className="text-[10px] text-[var(--text-3)] uppercase font-semibold tracking-wider">{PERIOD_LABELS[period]}</span>
        <div className="flex-1 h-px bg-[var(--border)]" />
      </div>
    )
  }

  function renderManageRow(r: Routine) {
    const isEditing = editingId === r.id
    const currentStreak = calcStreak(r.id, today, logs)
    const bestStreak = calcBestStreak(r.id, logs)
    return (
      <div key={r.id} className="py-1.5 group">
        <div className="flex items-center gap-2">
        {r.time && (
          <span className="text-[11px] text-[var(--text-3)] font-mono flex-shrink-0">{r.time}</span>
        )}
        {isEditing ? (
          <input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submitEdit(r.id)
              if (e.key === 'Escape') setEditingId(null)
            }}
            className="flex-1 text-sm px-1 py-0.5 rounded bg-[var(--surface-2)] outline-none focus:ring-1 focus:ring-[var(--purple)]"
            autoFocus
          />
        ) : (
          <span
            onClick={() => { setEditingId(r.id); setEditName(r.name) }}
            className={clsx(
              'flex-1 text-sm truncate cursor-text',
              r.status === 'paused' && 'text-[var(--text-3)]',
              r.status === 'archived' && 'text-[var(--text-3)] line-through',
            )}
          >
            {r.name}
          </span>
        )}

        {isEditing ? (
          <div className="flex gap-0.5">
            <button
              onClick={() => submitEdit(r.id)}
              className="w-5 h-5 rounded flex items-center justify-center text-[var(--teal)] hover:bg-[var(--teal-bg)]"
            >
              <Check size={11} />
            </button>
            <button
              onClick={() => setEditingId(null)}
              className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-3)] hover:bg-[var(--surface-2)]"
            >
              <X size={11} />
            </button>
          </div>
        ) : (
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onReorderRoutine(r.id, 'up')}
              title="위로"
              className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-3)] hover:bg-[var(--surface-2)]"
            >
              <ChevronUp size={11} />
            </button>
            <button
              onClick={() => onReorderRoutine(r.id, 'down')}
              title="아래로"
              className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-3)] hover:bg-[var(--surface-2)]"
            >
              <ChevronDown size={11} />
            </button>
            {r.status === 'active' && (
              <button
                onClick={() => onSetStatus(r.id, 'paused')}
                title="일시정지"
                className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-3)] hover:bg-[var(--surface-2)]"
              >
                <Pause size={11} />
              </button>
            )}
            {r.status === 'paused' && (
              <button
                onClick={() => onSetStatus(r.id, 'active')}
                title="재개"
                className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-3)] hover:bg-[var(--surface-2)]"
              >
                <Play size={11} />
              </button>
            )}
            {r.status !== 'archived' && (
              <button
                onClick={() => onSetStatus(r.id, 'archived')}
                title="보관"
                className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-3)] hover:bg-[var(--surface-2)]"
              >
                <Archive size={11} />
              </button>
            )}
            {r.status === 'archived' && (
              <>
                <button
                  onClick={() => onSetStatus(r.id, 'active')}
                  title="복구"
                  className="w-5 h-5 rounded flex items-center justify-center text-[var(--teal)] hover:bg-[var(--teal-bg)]"
                >
                  <Play size={11} />
                </button>
                <button
                  onClick={() => onDeleteRoutine(r.id)}
                  title="삭제"
                  className="w-5 h-5 rounded flex items-center justify-center text-[var(--coral)] hover:bg-[var(--coral-bg)]"
                >
                  <Trash2 size={11} />
                </button>
              </>
            )}
          </div>
        )}
        </div>
        {r.status === 'active' && (currentStreak > 0 || bestStreak > 0) && (
          <div className="flex gap-3 mt-0.5 ml-0 pl-0">
            {currentStreak > 0 && <span className="text-[10px] text-[var(--text-3)]">현재 {currentStreak}일</span>}
            {bestStreak > 0 && <span className="text-[10px] text-[var(--text-3)]">최고 {bestStreak}일</span>}
          </div>
        )}
      </div>
    )
  }

  // Weekly routine completion rate
  const weeklyCompletionRate = useMemo(() => {
    const active = routines.filter(r => r.status === 'active')
    if (active.length === 0) return null
    const thisWeek = getWeekDays(new Date())
    let allDoneDays = 0
    for (const d of thisWeek) {
      const dateStr = formatDate(d)
      if (active.every(r => logs.find(l => l.routine_id === r.id && l.date === dateStr && l.done))) allDoneDays++
    }
    return Math.round((allDoneDays / 7) * 100)
  }, [routines, logs])

  return (
    <div className="flex flex-col gap-4">

      {/* Zone A: 오늘 루틴 (check-only) — grouped by period */}
      <div className="bg-white border border-[var(--border)] rounded-[16px] p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold">오늘 루틴</h3>
          <span className="text-xs text-[var(--text-3)]">{doneCnt}/{activeRoutines.length}</span>
        </div>
        <div className="mb-3">
          <ProgressBar value={doneCnt} max={activeRoutines.length} color="teal" />
        </div>

        {goalLabel && goalRoutines.length > 0 && (
          <div className="mb-2 px-2 py-1 rounded-[6px] bg-[var(--purple-bg)] text-[11px] font-medium text-[var(--purple-text)] truncate">
            {goalLabel}
          </div>
        )}

        {activeRoutines.length > 0 ? (
          PERIOD_ORDER.map(period => {
            const group = activeGrouped[period]
            if (group.length === 0) return null
            return (
              <div key={period}>
                {renderPeriodHeader(period)}
                {group.map(r => {
                  const done = !!logs.find(l => l.routine_id === r.id && l.date === today && l.done)
                  const streak = calcStreak(r.id, today, logs)
                  return (
                    <div key={r.id} className="flex items-center gap-2 py-1.5">
                      <CircleCheck checked={done} onChange={() => onToggleLog(r.id, today)} />
                      {r.time && (
                        <span className="text-[11px] text-[var(--text-3)] font-mono flex-shrink-0">{r.time}</span>
                      )}
                      <span className={clsx(
                        'flex-1 text-sm truncate',
                        done && 'line-through text-[var(--text-3)]',
                      )}>
                        {r.name}
                      </span>
                      {streak > 0 && (() => {
                        const badge = streakBadge(streak)
                        return badge ? (
                          <span className={clsx('text-[11px] font-semibold flex-shrink-0 px-1.5 py-0.5 rounded-full', badge.bg)}>
                            {badge.emoji} {streak}일
                          </span>
                        ) : (
                          <span className="text-[11px] text-[var(--teal)] font-semibold flex-shrink-0">
                            {streak}일
                          </span>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            )
          })
        ) : (
          <p className="text-xs text-[var(--text-3)] py-2">루틴 관리에서 루틴을 추가하세요.</p>
        )}

        <div className="mt-3 flex justify-end">
          <button
            onClick={() => setShowManage(v => !v)}
            className="text-[13px] text-[var(--text-3)] hover:text-[var(--text-2)] px-2 py-1 rounded-[6px] hover:bg-[var(--surface-2)] transition-all"
          >
            관리 {showManage ? '▲' : '▼'}
          </button>
        </div>

        {/* Zone B: 루틴 관리 (collapsible) */}
        {showManage && (
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <h4 className="text-xs font-semibold text-[var(--text-2)] mb-2">루틴 관리</h4>

            {activeAll.length > 0 && (
              <div className="mb-2">
                <p className="text-[11px] text-[var(--text-3)] mb-1 flex items-center gap-1">
                  <span className="text-[var(--teal)]">●</span> 활성
                </p>
                {activeAll.map(r => renderManageRow(r))}
              </div>
            )}

            {pausedAll.length > 0 && (
              <div className="mb-2">
                <p className="text-[11px] text-[var(--text-3)] mb-1">⏸ 일시정지</p>
                {pausedAll.map(r => renderManageRow(r))}
              </div>
            )}

            {archivedAll.length > 0 && (
              <div className="mb-2">
                <p className="text-[11px] text-[var(--text-3)] mb-1">▣ 보관</p>
                {archivedAll.map(r => renderManageRow(r))}
              </div>
            )}

            {routines.length === 0 && (
              <p className="text-xs text-[var(--text-3)] py-1">루틴이 없습니다.</p>
            )}

            {showAdd ? (
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex gap-2">
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAdd()
                      if (e.key === 'Escape') setShowAdd(false)
                    }}
                    placeholder="새 루틴..."
                    autoFocus
                    className="flex-1 px-2 py-1 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none focus:ring-1 focus:ring-[var(--teal)]"
                  />
                  <input
                    value={newTime}
                    onChange={e => {
                      setNewTime(e.target.value)
                      if (!newPeriod) {
                        // auto-derive shown but don't lock it
                      }
                    }}
                    placeholder="HH:MM"
                    className="w-16 px-2 py-1 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none focus:ring-1 focus:ring-[var(--teal)] font-mono"
                  />
                </div>
                <div className="flex gap-1">
                  {PERIOD_ORDER.map(p => (
                    <button
                      key={p}
                      onClick={() => setNewPeriod(prev => prev === p ? null : p)}
                      className={clsx(
                        'px-2 py-0.5 rounded-[6px] text-[11px] font-medium transition-all',
                        (newPeriod ?? derivePeriodFromTime(newTime || undefined)) === p
                          ? 'bg-[var(--teal)] text-white'
                          : 'bg-[var(--surface-2)] text-[var(--text-3)] hover:bg-[var(--border)]',
                      )}
                    >
                      {PERIOD_LABELS[p]}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAdd}
                    className="px-2 py-1 rounded-[8px] text-sm bg-[var(--teal)] text-white"
                  >
                    추가
                  </button>
                  <button
                    onClick={() => { setShowAdd(false); setNewTime(''); setNewPeriod(null) }}
                    className="px-2 py-1 rounded-[8px] text-sm text-[var(--text-3)] hover:bg-[var(--border)]"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1 mt-2 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
              >
                <Plus size={12} /> 루틴 추가
              </button>
            )}
          </div>
        )}
      </div>

      {/* History heatmap — grouped by period */}
      <div className="bg-white border border-[var(--border)] rounded-[16px] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">루틴 히스토리</h3>
          {weeklyCompletionRate !== null && (
            <span className="text-[11px] text-[var(--text-3)]">이번 주 완수율: {weeklyCompletionRate}%</span>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {PERIOD_ORDER.map(period => {
            const group = historyGrouped[period]
            if (group.length === 0) return null
            return (
              <div key={period}>
                {renderPeriodHeader(period)}
                {group.map(r => {
                  const cnt = historyDays.filter(d =>
                    logs.find(l => l.routine_id === r.id && l.date === d && l.done)
                  ).length
                  return (
                    <div key={r.id} className="mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className={clsx(
                          'text-xs font-medium truncate max-w-[120px]',
                          r.status === 'paused' ? 'text-[var(--text-3)]' : 'text-[var(--text-2)]',
                        )}>
                          {r.time && <span className="font-mono text-[var(--text-3)] mr-1">{r.time}</span>}
                          {r.name}
                        </span>
                        <span className="text-[11px] text-[var(--text-3)]">{cnt}일</span>
                      </div>
                      <div className="flex gap-0.5">
                        {historyDays.map(d => {
                          const done = !!logs.find(l => l.routine_id === r.id && l.date === d && l.done)
                          return (
                            <div key={d} title={d}
                              className={clsx(
                                'flex-1 h-3 rounded-[3px] transition-all',
                                done
                                  ? 'bg-[var(--teal)]'
                                  : r.status === 'paused'
                                    ? 'bg-[var(--border)] opacity-40'
                                    : 'bg-[var(--border)]',
                              )}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
          {routines.filter(r => r.status !== 'archived').length === 0 && (
            <p className="text-xs text-[var(--text-3)]">아직 루틴이 없습니다.</p>
          )}
        </div>
      </div>

      {/* Running tracker */}
      <RunningTracker />
    </div>
  )
}

function RunningTracker() {
  const [enabled, setEnabled] = useState(false)
  const [runLog, setRunLog] = useState<Array<{ date: string; km: number }>>([])
  const [kmInput, setKmInput] = useState('')
  const [showTracker, setShowTracker] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setEnabled(localStorage.getItem('planr_run_tracker_enabled') === 'true')
    try { setRunLog(JSON.parse(localStorage.getItem('planr_run_log') ?? '[]')) } catch { setRunLog([]) }
  }, [])

  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)
  const monthLabel = format(now, 'M월')

  const monthTotal = useMemo(() => {
    return runLog
      .filter(e => {
        const d = parseISO(e.date)
        return d >= monthStart && d <= monthEnd
      })
      .reduce((sum, e) => sum + e.km, 0)
  }, [runLog, monthStart, monthEnd])

  function toggleEnabled() {
    const next = !enabled
    setEnabled(next)
    localStorage.setItem('planr_run_tracker_enabled', String(next))
  }

  function addRun() {
    const km = parseFloat(kmInput)
    if (isNaN(km) || km <= 0) return
    const entry = { date: formatDate(new Date()), km }
    const next = [...runLog, entry]
    setRunLog(next)
    localStorage.setItem('planr_run_log', JSON.stringify(next))
    setKmInput('')
  }

  if (!enabled) {
    return (
      <div className="bg-white border border-[var(--border)] rounded-[16px] p-3 flex items-center justify-between">
        <span className="text-xs text-[var(--text-3)]">달리기 트래커</span>
        <button onClick={toggleEnabled} className="text-[11px] text-[var(--teal)] hover:underline">켜기</button>
      </div>
    )
  }

  const target = 50
  const pct = Math.min(Math.round((monthTotal / target) * 100), 100)

  return (
    <div className="bg-white border border-[var(--border)] rounded-[16px] p-4">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setShowTracker(v => !v)} className="text-sm font-semibold">
          {monthLabel} 달리기 {showTracker ? '▲' : '▼'}
        </button>
        <button onClick={toggleEnabled} className="text-[10px] text-[var(--text-3)] hover:text-[var(--coral)]">끄기</button>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-[var(--text-2)]">{monthTotal.toFixed(1)} / {target} km ({pct}%)</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--border)] mb-2">
        <div className="h-full rounded-full bg-[var(--teal)] transition-all" style={{ width: `${pct}%` }} />
      </div>
      {showTracker && (
        <div className="flex gap-2 mt-2">
          <input value={kmInput} onChange={e => setKmInput(e.target.value)}
            placeholder="km" type="number" step="0.1"
            className="flex-1 px-2 py-1 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none focus:ring-1 focus:ring-[var(--teal)]" />
          <button onClick={addRun} className="px-2 py-1 rounded-[8px] text-sm bg-[var(--teal)] text-white">+</button>
        </div>
      )}
    </div>
  )
}
