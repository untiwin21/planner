'use client'

import { useMemo, useState } from 'react'
import { Layers3, Settings2, Sparkles } from 'lucide-react'
import { subDays, parseISO } from 'date-fns'
import clsx from 'clsx'
import { formatDate, getWeekDays } from '@/lib/dates'
import { CircleCheck, ProgressBar } from '@/components/ui'
import type { BadgeColor, Routine, RoutineConfig, RoutineLog, RoutinePeriod, RoutineStatus } from '@/types'
import { isRoutineScheduledOn, isTimedRoutine, routineConfig } from '@/lib/routineSchedule'
import { RoutineManagerDialog } from '@/components/routine/RoutineManagerDialog'

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

type RoutineCategory = {
  key: string
  label: string
  color: BadgeColor
  routines: Routine[]
}

const DOT_CLASS: Record<BadgeColor, string> = {
  purple: 'bg-[var(--purple)]',
  teal: 'bg-[var(--teal)]',
  amber: 'bg-[var(--amber)]',
  coral: 'bg-[var(--coral)]',
  blue: 'bg-[var(--blue)]',
  gray: 'bg-[var(--text-3)]',
  red: 'bg-[var(--red)]',
}

const CATEGORY_TINT: Record<BadgeColor, string> = {
  purple: 'bg-[var(--purple-bg)] text-[var(--purple-text)]',
  teal: 'bg-[var(--teal-bg)] text-[var(--teal-text)]',
  amber: 'bg-[var(--amber-bg)] text-[var(--amber-text)]',
  coral: 'bg-[var(--coral-bg)] text-[var(--coral-text)]',
  blue: 'bg-[var(--blue-bg)] text-[var(--blue-text)]',
  gray: 'bg-[var(--surface-2)] text-[var(--text-2)]',
  red: 'bg-[var(--red-bg)] text-[var(--red-text)]',
}

function categoryName(routine: Routine) {
  return routineConfig(routine).bundle?.trim() || '기타 루틴'
}

function groupByCategory(routines: Routine[]): RoutineCategory[] {
  const groups = new Map<string, Routine[]>()
  for (const routine of routines) {
    const label = categoryName(routine)
    groups.set(label, [...(groups.get(label) ?? []), routine])
  }
  return [...groups.entries()].map(([label, items]) => {
    const sorted = [...items].sort((a, b) => {
      const timeDiff = (a.time ?? '99:99').localeCompare(b.time ?? '99:99')
      if (timeDiff !== 0) return timeDiff
      return (a.order ?? 0) - (b.order ?? 0)
    })
    return {
      key: label,
      label,
      color: routineConfig(sorted[0]).category_color,
      routines: sorted,
    }
  })
}

function calcStreak(routineId: string, todayStr: string, logs: RoutineLog[]): number {
  let streak = 0
  let date = parseISO(todayStr)
  while (true) {
    const dateStr = formatDate(date)
    if (!logs.find(log => log.routine_id === routineId && log.date === dateStr && log.done)) break
    streak += 1
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
  routines,
  logs,
  selectedDate,
  onToggleLog,
  onAddRoutine,
  onSetStatus,
  onUpdateRoutine,
  onDeleteRoutine,
}: Props) {
  const today = formatDate(new Date())
  const viewDate = selectedDate || today
  const isToday = viewDate === today
  const [showRoutineManager, setShowRoutineManager] = useState(false)

  const activeRoutines = useMemo(
    () => routines.filter(routine => isRoutineScheduledOn(routine, viewDate)),
    [routines, viewDate],
  )
  const activeCategories = useMemo(() => groupByCategory(activeRoutines), [activeRoutines])
  const historyCategories = useMemo(
    () => groupByCategory(routines.filter(routine => routine.status !== 'archived')),
    [routines],
  )

  const doneCnt = activeRoutines.filter(routine =>
    logs.some(log => log.routine_id === routine.id && log.date === viewDate && log.done),
  ).length

  const historyDays = useMemo(
    () => Array.from({ length: 14 }, (_, index) => formatDate(subDays(new Date(), 13 - index))),
    [],
  )

  const weeklyCompletionRate = useMemo(() => {
    const thisWeek = getWeekDays(new Date())
    const occurrences = thisWeek.flatMap(day => {
      const date = formatDate(day)
      return routines
        .filter(routine => isRoutineScheduledOn(routine, date))
        .map(routine => ({ routine, date }))
    })
    if (occurrences.length === 0) return null
    const done = occurrences.filter(({ routine, date }) =>
      logs.some(log => log.routine_id === routine.id && log.date === date && log.done),
    ).length
    return Math.round((done / occurrences.length) * 100)
  }, [routines, logs])

  function isDone(routineId: string) {
    return logs.some(log => log.routine_id === routineId && log.date === viewDate && log.done)
  }

  function toggleCategory(category: RoutineCategory) {
    const allDone = category.routines.every(routine => isDone(routine.id))
    for (const routine of category.routines) {
      const done = isDone(routine.id)
      if ((allDone && done) || (!allDone && !done)) onToggleLog(routine.id, viewDate)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[18px] border border-[var(--border)] bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-[var(--teal)]" />
              <h3 className="text-sm font-bold">{isToday ? '오늘 루틴' : `${viewDate.slice(5)} 루틴`}</h3>
            </div>
            <p className="mt-1 text-xs text-[var(--text-3)]">시간대 대신 루틴 카테고리로 묶어서 한 번에 실행하세요.</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-[var(--teal-text)]">{doneCnt}/{activeRoutines.length}</p>
            <p className="text-[10px] text-[var(--text-3)]">완료</p>
          </div>
        </div>
        <div className="mt-3">
          <ProgressBar value={doneCnt} max={activeRoutines.length} color="teal" />
        </div>
      </div>

      {activeCategories.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {activeCategories.map(category => {
            const categoryDone = category.routines.filter(routine => isDone(routine.id)).length
            const allDone = categoryDone === category.routines.length
            return (
              <section key={category.key} className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <div className={clsx('flex items-center gap-3 px-4 py-3', CATEGORY_TINT[category.color])}>
                  <span className={clsx('h-2.5 w-2.5 rounded-full shrink-0', DOT_CLASS[category.color])} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Layers3 size={13} />
                      <h4 className="truncate text-sm font-bold">{category.label}</h4>
                    </div>
                    <p className="mt-0.5 text-[10px] opacity-70">{categoryDone}/{category.routines.length} 완료</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-bold hover:bg-white transition-colors"
                  >
                    {allDone ? '전체 해제' : '한번에 체크'}
                  </button>
                </div>

                <div className="divide-y divide-[var(--border)]">
                  {category.routines.map(routine => {
                    const done = isDone(routine.id)
                    const config = routineConfig(routine)
                    const streak = calcStreak(routine.id, viewDate, logs)
                    const badge = streakBadge(streak)
                    return (
                      <div key={routine.id} className={clsx('flex items-center gap-3 px-4 py-3 transition-colors', done && 'bg-[var(--surface-2)]/60')}>
                        <CircleCheck checked={done} onChange={() => onToggleLog(routine.id, viewDate)} />
                        <div className="min-w-0 flex-1">
                          <p className={clsx('truncate text-sm font-semibold', done && 'line-through text-[var(--text-3)]')}>{routine.name}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--text-3)]">
                            {routine.time && <span className="font-mono">{routine.time}</span>}
                            <span>{isTimedRoutine(routine) ? `${config.duration_min}분` : '체크형'}</span>
                            {config.cue_label && <span>· {config.cue_label}</span>}
                          </div>
                        </div>
                        {streak > 0 && (
                          badge ? (
                            <span className={clsx('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', badge.bg)}>{badge.emoji} {streak}일</span>
                          ) : (
                            <span className="shrink-0 text-[10px] font-semibold text-[var(--teal)]">{streak}일</span>
                          )
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <div className="rounded-[18px] border border-dashed border-[var(--border-strong)] bg-white px-5 py-10 text-center">
          <p className="text-sm font-semibold">오늘 실행할 루틴이 없습니다.</p>
          <p className="mt-1 text-xs text-[var(--text-3)]">루틴 관리에서 카테고리와 하위 루틴을 추가해보세요.</p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowRoutineManager(true)}
          className="flex items-center gap-1.5 rounded-[9px] border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--text-2)] hover:border-[var(--purple)] hover:text-[var(--purple)]"
        >
          <Settings2 size={13} /> 루틴 관리
        </button>
      </div>

      <div className="rounded-[18px] border border-[var(--border)] bg-white p-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold">루틴 히스토리</h3>
            <p className="mt-0.5 text-[10px] text-[var(--text-3)]">최근 14일 · 카테고리별 기록</p>
          </div>
          {weeklyCompletionRate !== null && <span className="text-[11px] font-semibold text-[var(--teal-text)]">이번 주 {weeklyCompletionRate}%</span>}
        </div>

        <div className="flex flex-col gap-4">
          {historyCategories.map(category => (
            <section key={category.key}>
              <div className="mb-2 flex items-center gap-2">
                <span className={clsx('h-2 w-2 rounded-full', DOT_CLASS[category.color])} />
                <h4 className="text-xs font-bold text-[var(--text-2)]">{category.label}</h4>
                <div className="h-px flex-1 bg-[var(--border)]" />
              </div>
              <div className="flex flex-col gap-2.5">
                {category.routines.map(routine => {
                  const count = historyDays.filter(date => logs.some(log => log.routine_id === routine.id && log.date === date && log.done)).length
                  return (
                    <div key={routine.id} className="grid grid-cols-[130px_1fr_36px] items-center gap-2">
                      <span className={clsx('truncate text-xs font-medium', routine.status === 'paused' ? 'text-[var(--text-3)]' : 'text-[var(--text-2)]')}>{routine.name}</span>
                      <div className="flex gap-0.5">
                        {historyDays.map(date => {
                          const done = logs.some(log => log.routine_id === routine.id && log.date === date && log.done)
                          return <div key={date} title={date} className={clsx('h-3 flex-1 rounded-[3px]', done ? 'bg-[var(--teal)]' : 'bg-[var(--border)]', routine.status === 'paused' && !done && 'opacity-40')} />
                        })}
                      </div>
                      <span className="text-right text-[10px] text-[var(--text-3)]">{count}일</span>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
          {historyCategories.length === 0 && <p className="text-xs text-[var(--text-3)]">아직 루틴이 없습니다.</p>}
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
