'use client'
import { useState, useMemo } from 'react'
import { Plus, Pause, Play, Archive, Trash2, Check, X } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { CircleCheck, ProgressBar } from '@/components/ui'
import type { Routine, RoutineLog, RoutineStatus } from '@/types'
import { subDays, parseISO } from 'date-fns'
import clsx from 'clsx'

interface Props {
  routines: Routine[]
  logs: RoutineLog[]
  goalRoutines: Routine[]
  goalLabel?: string
  onToggleLog: (routineId: string, date: string) => void
  onAddRoutine: (name: string) => void
  onSetStatus: (id: string, status: RoutineStatus) => void
  onUpdateName: (id: string, name: string) => void
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

export function RoutineSidebar({
  routines, logs, goalRoutines, goalLabel,
  onToggleLog, onAddRoutine, onSetStatus, onUpdateName, onDeleteRoutine,
}: Props) {
  const today = formatDate(new Date())
  const [showManage, setShowManage] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  // Zone A: show goal routines if a goal is active today, else all active routines
  const activeRoutines = useMemo(() => {
    if (goalRoutines.length > 0) return goalRoutines.filter(r => r.status === 'active')
    return routines.filter(r => r.status === 'active')
  }, [goalRoutines, routines])

  const doneCnt = activeRoutines.filter(r =>
    logs.find(l => l.routine_id === r.id && l.date === today && l.done)
  ).length

  // Zone B grouped lists
  const activeAll = routines.filter(r => r.status === 'active')
  const pausedAll = routines.filter(r => r.status === 'paused')
  const archivedAll = routines.filter(r => r.status === 'archived')

  // Heatmap: 14-day window
  const historyDays = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => formatDate(subDays(new Date(), 13 - i))), [])

  function handleAdd() {
    if (!newName.trim()) return
    onAddRoutine(newName.trim())
    setNewName('')
    setShowAdd(false)
  }

  function submitEdit(id: string) {
    if (editName.trim()) onUpdateName(id, editName.trim())
    setEditingId(null)
  }

  function renderManageRow(r: Routine) {
    const isEditing = editingId === r.id
    return (
      <div key={r.id} className="flex items-center gap-2 py-1.5 group">
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
    )
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Zone A: 오늘 루틴 (check-only) ── */}
      <div className="bg-white border border-[var(--border)] rounded-[16px] p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold">오늘 루틴</h3>
          <span className="text-xs text-[var(--text-3)]">{doneCnt}/{activeRoutines.length}</span>
        </div>
        <div className="mb-3">
          <ProgressBar value={doneCnt} max={activeRoutines.length} color="teal" />
        </div>

        {/* Goal label */}
        {goalLabel && goalRoutines.length > 0 && (
          <div className="mb-2 px-2 py-1 rounded-[6px] bg-[var(--purple-bg)] text-[15px] font-medium text-[var(--purple-text)] truncate">
            {goalLabel}
          </div>
        )}

        {/* Active routine rows — no edit buttons */}
        {activeRoutines.length > 0 ? (
          activeRoutines.map(r => {
            const done = !!logs.find(l => l.routine_id === r.id && l.date === today && l.done)
            const streak = calcStreak(r.id, today, logs)
            return (
              <div key={r.id} className="flex items-center gap-2 py-1.5">
                <CircleCheck checked={done} onChange={() => onToggleLog(r.id, today)} />
                <span className={clsx(
                  'flex-1 text-sm truncate',
                  done && 'line-through text-[var(--text-3)]',
                )}>
                  {r.name}
                </span>
                {streak > 0 && (
                  <span className="text-[15px] text-[var(--teal)] font-semibold flex-shrink-0">
                    {streak}일
                  </span>
                )}
              </div>
            )
          })
        ) : (
          <p className="text-xs text-[var(--text-3)] py-2">루틴 관리에서 루틴을 추가하세요.</p>
        )}

        {/* "관리" toggle button at bottom of Zone A */}
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => setShowManage(v => !v)}
            className="text-[17px] text-[var(--text-3)] hover:text-[var(--text-2)] px-2 py-1 rounded-[6px] hover:bg-[var(--surface-2)] transition-all"
          >
            관리 {showManage ? '▲' : '▼'}
          </button>
        </div>

        {/* ── Zone B: 루틴 관리 (collapsible) ── */}
        {showManage && (
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <h4 className="text-xs font-semibold text-[var(--text-2)] mb-2">루틴 관리</h4>

            {activeAll.length > 0 && (
              <div className="mb-2">
                <p className="text-[15px] text-[var(--text-3)] mb-1 flex items-center gap-1">
                  <span className="text-[var(--teal)]">●</span> 활성
                </p>
                {activeAll.map(r => renderManageRow(r))}
              </div>
            )}

            {pausedAll.length > 0 && (
              <div className="mb-2">
                <p className="text-[15px] text-[var(--text-3)] mb-1">⏸ 일시정지</p>
                {pausedAll.map(r => renderManageRow(r))}
              </div>
            )}

            {archivedAll.length > 0 && (
              <div className="mb-2">
                <p className="text-[15px] text-[var(--text-3)] mb-1">▣ 보관</p>
                {archivedAll.map(r => renderManageRow(r))}
              </div>
            )}

            {routines.length === 0 && (
              <p className="text-xs text-[var(--text-3)] py-1">루틴이 없습니다.</p>
            )}

            {/* 루틴 추가 — only in Zone B */}
            {showAdd ? (
              <div className="flex gap-2 mt-2">
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
                <button
                  onClick={handleAdd}
                  className="px-2 py-1 rounded-[8px] text-sm bg-[var(--teal)] text-white"
                >
                  추가
                </button>
                <button
                  onClick={() => setShowAdd(false)}
                  className="px-2 py-1 rounded-[8px] text-sm text-[var(--text-3)] hover:bg-[var(--border)]"
                >
                  <X size={13} />
                </button>
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

      {/* ── History heatmap (unchanged) ── */}
      <div className="bg-white border border-[var(--border)] rounded-[16px] p-4">
        <h3 className="text-sm font-semibold mb-3">루틴 히스토리</h3>
        <div className="flex flex-col gap-3">
          {routines.filter(r => r.status !== 'archived').slice(0, 6).map(r => {
            const cnt = historyDays.filter(d =>
              logs.find(l => l.routine_id === r.id && l.date === d && l.done)
            ).length
            return (
              <div key={r.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className={clsx(
                    'text-xs font-medium truncate max-w-[120px]',
                    r.status === 'paused' ? 'text-[var(--text-3)]' : 'text-[var(--text-2)]',
                  )}>
                    {r.name}
                  </span>
                  <span className="text-[15px] text-[var(--text-3)]">{cnt}일</span>
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
          {routines.filter(r => r.status !== 'archived').length === 0 && (
            <p className="text-xs text-[var(--text-3)]">아직 루틴이 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  )
}
