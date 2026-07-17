'use client'
import { useState, useMemo } from 'react'
import { formatDate, getWeekDays } from '@/lib/dates'
import { CircleCheck, ProgressBar } from '@/components/ui'
import type { Routine, RoutineLog, RoutineStatus, RoutinePeriod } from '@/types'
import { subDays, parseISO } from 'date-fns'
import clsx from 'clsx'
import { isRoutineScheduledOn } from '@/lib/routineSchedule'
import { RoutineManagerDialog } from '@/components/routine/RoutineManagerDialog'
import type { RoutineConfig } from '@/types'

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
  selectedDate: string
  onToggleLog: (routineId: string, date: string) => void
  onAddRoutine: (name: string, time?: string, period?: RoutinePeriod, config?: RoutineConfig) => void
  onSetStatus: (id: string, status: RoutineStatus) => void
  onUpdateRoutine: (id: string, patch: Partial<Omit<Routine, 'id'>>) => void
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

function streakBadge(streak: number): { emoji: string; bg: string } | null {
  if (streak >= 100) return { emoji: '👑', bg: 'bg-[var(--amber-bg)] text-[var(--amber-text)]' }
  if (streak >= 30) return { emoji: '⚡', bg: 'bg-[var(--purple-bg)] text-[var(--purple-text)]' }
  if (streak >= 7) return { emoji: '🔥', bg: 'bg-[var(--amber-bg)] text-[var(--amber-text)]' }
  return null
}

export function RoutineSidebar({
  routines, logs, selectedDate,
  onToggleLog, onAddRoutine, onSetStatus, onUpdateRoutine, onDeleteRoutine,
}: Props) {
  const today = formatDate(new Date())
  const viewDate = selectedDate || today
  const isToday = viewDate === today
  const [showRoutineManager, setShowRoutineManager] = useState(false)

  const activeRoutines = useMemo(
    () => routines.filter(routine => isRoutineScheduledOn(routine, viewDate)),
    [routines, viewDate],
  )

  const doneCnt = activeRoutines.filter(r =>
    logs.find(l => l.routine_id === r.id && l.date === viewDate && l.done)
  ).length

  const historyDays = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => formatDate(subDays(new Date(), 13 - i))), [])

  const activeGrouped = useMemo(() => groupByPeriod(activeRoutines), [activeRoutines])
  const historyGrouped = useMemo(() => groupByPeriod(routines.filter(r => r.status !== 'archived').slice(0, 12)), [routines])

  function renderPeriodHeader(period: RoutinePeriod) {
    return (
      <div className="flex items-center gap-2 mt-2 mb-1 first:mt-0">
        <span className="text-[10px] text-[var(--text-3)] uppercase font-semibold tracking-wider">{PERIOD_LABELS[period]}</span>
        <div className="flex-1 h-px bg-[var(--border)]" />
      </div>
    )
  }

  // Weekly routine completion rate
  const weeklyCompletionRate = useMemo(() => {
    const thisWeek = getWeekDays(new Date())
    const occurrences = thisWeek.flatMap(day => {
      const date = formatDate(day)
      return routines.filter(routine => isRoutineScheduledOn(routine, date)).map(routine => ({ routine, date }))
    })
    if (occurrences.length === 0) return null
    const done = occurrences.filter(({ routine, date }) => logs.some(log => log.routine_id === routine.id && log.date === date && log.done)).length
    return Math.round((done / occurrences.length) * 100)
  }, [routines, logs])

  return (
    <div className="flex flex-col gap-4">

      {/* Zone A: 루틴 (check-only) — grouped by period */}
      <div className="bg-white border border-[var(--border)] rounded-[16px] p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold">{isToday ? '오늘 루틴' : `${viewDate.slice(5)} 루틴`}</h3>
          <span className="text-xs text-[var(--text-3)]">{doneCnt}/{activeRoutines.length}</span>
        </div>
        <div className="mb-3">
          <ProgressBar value={doneCnt} max={activeRoutines.length} color="teal" />
        </div>

        {activeRoutines.length > 0 ? (
          PERIOD_ORDER.map(period => {
            const group = activeGrouped[period]
            if (group.length === 0) return null
            return (
              <div key={period}>
                {renderPeriodHeader(period)}
                {group.map(r => {
                  const done = !!logs.find(l => l.routine_id === r.id && l.date === viewDate && l.done)
                  const streak = calcStreak(r.id, viewDate, logs)
                  return (
                    <div key={r.id} className="flex items-center gap-2 py-1.5">
                      <CircleCheck checked={done} onChange={() => onToggleLog(r.id, viewDate)} />
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
            onClick={() => setShowRoutineManager(true)}
            className="text-[13px] text-[var(--text-3)] hover:text-[var(--text-2)] px-2 py-1 rounded-[6px] hover:bg-[var(--surface-2)] transition-all"
          >
            관리
          </button>
        </div>

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

      {showRoutineManager && (
        <RoutineManagerDialog
          routines={routines}
          onClose={() => setShowRoutineManager(false)}
          onAddRoutine={onAddRoutine}
          onUpdateRoutine={onUpdateRoutine}
          onSetStatus={onSetStatus}
          onDeleteRoutine={onDeleteRoutine}
        />
      )}
    </div>
  )
}
