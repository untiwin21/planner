'use client'

import { useState } from 'react'
import { Check, ChevronDown, Layers3, Settings2 } from 'lucide-react'
import clsx from 'clsx'
import { formatDate } from '@/lib/dates'
import type { Routine, RoutineConfig, RoutineLog, RoutinePeriod, RoutineStatus } from '@/types'
import { isRoutineScheduledOn, routineConfig } from '@/lib/routineSchedule'
import { RoutineManagerDialog } from './RoutineManagerDialog'

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

export function RoutineSidebar({ routines, logs, selectedDate, onToggleLog, ...actions }: Props) {
  const [showManager, setShowManager] = useState(false)
  const [openGroups, setOpenGroups] = useState<string[]>([])
  const viewDate = selectedDate || formatDate(new Date())
  const groups = new Map<string, Routine[]>()
  for (const routine of [...routines].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const name = routineConfig(routine).bundle?.trim() || '기타 루틴'
    if (routine.config?.group_only && routine.status === 'active') {
      if (!groups.has(name)) groups.set(name, [])
      continue
    }
    if (!isRoutineScheduledOn(routine, viewDate)) continue
    groups.set(name, [...(groups.get(name) ?? []), routine])
  }
  const isDone = (id: string) => logs.some(log => log.routine_id === id && log.date === viewDate && log.done)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">루틴</h3>
          <p className="mt-1 text-xs text-[var(--text-3)]">묶음을 눌러 세부 루틴을 체크하세요.</p>
        </div>
        <button type="button" onClick={() => setShowManager(true)} className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold">
          <Settings2 size={13} /> 묶음 관리
        </button>
      </div>
      {[...groups].map(([name, items]) => {
        const open = openGroups.includes(name)
        const done = items.filter(item => isDone(item.id)).length
        return (
          <section key={name} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
            <button type="button" aria-expanded={open} onClick={() => setOpenGroups(current => open ? current.filter(key => key !== name) : [...current, name])} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--surface-2)]">
              <Layers3 size={16} className="shrink-0 text-[var(--teal)]" />
              <span className="min-w-0 flex-1 break-words text-sm font-bold">{name}</span>
              <span className={clsx('shrink-0 rounded-full px-2 py-1 text-xs', done === items.length ? 'bg-[var(--teal-bg)] text-[var(--teal-text)]' : 'bg-[var(--surface-2)] text-[var(--text-3)]')}>{done}/{items.length}</span>
              <ChevronDown size={16} className={clsx('shrink-0 transition-transform', open && 'rotate-180')} />
            </button>
            {open && <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
              {items.length === 0 && <p className="px-4 py-3 text-xs text-[var(--text-3)]">오늘 실행할 세부 루틴이 없습니다.</p>}
              {items.map(routine => <div key={routine.id} className="flex items-center gap-3 px-4 py-3">
                <button type="button" aria-pressed={isDone(routine.id)} onClick={() => onToggleLog(routine.id, viewDate)} className={clsx('flex min-w-0 flex-1 items-center gap-3 text-left text-sm', isDone(routine.id) && 'text-[var(--text-3)]')}><span aria-hidden="true" className={clsx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', isDone(routine.id) ? 'border-[var(--teal)] bg-[var(--teal)] text-white' : 'border-[var(--border-strong)]')}>{isDone(routine.id) && <Check size={12} />}</span><span className={clsx('break-words', isDone(routine.id) && 'line-through')}>{routine.name}</span></button>
              </div>)}
            </div>}
          </section>
        )
      })}
      {groups.size === 0 && <button type="button" onClick={() => setShowManager(true)} className="rounded-2xl border border-dashed border-[var(--border)] bg-white px-5 py-8 text-center text-sm text-[var(--text-3)]">오늘의 루틴이 없습니다. 묶음과 세부 루틴을 추가하세요.</button>}
      {showManager && <RoutineManagerDialog routines={routines} onClose={() => setShowManager(false)} {...actions} />}
    </div>
  )
}
