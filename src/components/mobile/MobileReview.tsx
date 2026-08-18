'use client'
import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addWeeks, subWeeks } from 'date-fns'
import clsx from 'clsx'
import { getWeekDays, formatDate, DAY_NAMES } from '@/lib/dates'
import { taskProgressPercent, tasksProgress } from '@/lib/taskProgress'
import { isActualOnlyTask } from '@/lib/taskVisibility'
import { isRoutineScheduledOn } from '@/lib/routineSchedule'
import type { DayEntry, ShortGoal, Routine, RoutineLog } from '@/types'

interface Props {
  days: DayEntry[]
  goals: ShortGoal[]
  routines: Routine[]
  logs: RoutineLog[]
  getWeeklyReview: (weekKey: string) => string
  updateWeeklyReview: (weekKey: string, content: string) => void
}

export function MobileReview({ days, goals, routines, logs, getWeeklyReview, updateWeeklyReview }: Props) {
  const [weekBase, setWeekBase] = useState(new Date())
  const weekDays = useMemo(() => getWeekDays(weekBase), [weekBase])
  const weekKey = formatDate(weekDays[0])
  const content = getWeeklyReview(weekKey)

  const weekStart = formatDate(weekDays[0])
  const weekEnd = formatDate(weekDays[6])

  // Stats
  const weekDayEntries = days.filter(d => d.date >= weekStart && d.date <= weekEnd)

  const sleepValues = weekDayEntries.map(d => d.meta.sleep).filter((v): v is number => v !== null)
  const conditionValues = weekDayEntries.map(d => d.meta.condition).filter((v): v is number => v !== null)
  const focusValues = weekDayEntries.map(d => d.meta.focus).filter((v): v is number => v !== null)

  const avgSleep = sleepValues.length > 0 ? sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length : null
  const avgCondition = conditionValues.length > 0 ? (conditionValues.reduce((a, b) => a + b, 0) / conditionValues.length).toFixed(1) : null
  const avgFocus = focusValues.length > 0 ? (focusValues.reduce((a, b) => a + b, 0) / focusValues.length).toFixed(1) : null

  const weekTasks = weekDayEntries.flatMap(entry => entry.tasks).filter(task => !isActualOnlyTask(task))
  const taskStats = tasksProgress(weekTasks)
  const totalTasks = taskStats.total
  const doneTasks = weekTasks.filter(task => !task.discarded && task.done).length
  const partialTasks = weekTasks.filter(task => !task.discarded && !task.done && taskProgressPercent(task) > 0).length

  // Routine stats for the week
  const activeRoutines = routines.filter(r => r.status === 'active' && r.config?.stage !== 'backlog')
  const routineOccurrences = weekDays.flatMap(day => {
    const date = formatDate(day)
    return activeRoutines.filter(routine => isRoutineScheduledOn(routine, date)).map(routine => ({ routine, date }))
  })
  const routineDone = routineOccurrences.filter(({ routine, date }) => logs.some(log => log.routine_id === routine.id && log.date === date && log.done)).length
  const routineRate = routineOccurrences.length > 0 ? Math.round((routineDone / routineOccurrences.length) * 100) : null

  // Goals active this week
  const weekGoals = goals.filter(g => g.date_from <= weekEnd && g.date_to >= weekStart)

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-28">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => setWeekBase(prev => subWeeks(prev, 1))}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--surface-2)]">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold">
          {weekDays[0].getMonth() + 1}월 {weekDays[0].getDate()}일 ~ {weekDays[6].getMonth() + 1}월 {weekDays[6].getDate()}일
        </span>
        <button onClick={() => setWeekBase(prev => addWeeks(prev, 1))}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--surface-2)]">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white border border-[var(--border)] rounded-[12px] p-3">
          <p className="text-[11px] text-[var(--text-3)] mb-1">평균 수면</p>
          <p className="text-lg font-bold text-[var(--blue-text)]">
            {avgSleep !== null ? `${(avgSleep / 60).toFixed(1)}h` : '-'}
          </p>
        </div>
        <div className="bg-white border border-[var(--border)] rounded-[12px] p-3">
          <p className="text-[11px] text-[var(--text-3)] mb-1">평균 컨디션</p>
          <p className="text-lg font-bold text-[var(--amber-text)]">
            {avgCondition !== null ? `${avgCondition} / 5` : '-'}
          </p>
        </div>
        <div className="bg-white border border-[var(--border)] rounded-[12px] p-3">
          <p className="text-[11px] text-[var(--text-3)] mb-1">평균 집중도</p>
          <p className="text-lg font-bold text-[var(--teal-text)]">
            {avgFocus !== null ? `${avgFocus} / 5` : '-'}
          </p>
        </div>
        <div className="bg-white border border-[var(--border)] rounded-[12px] p-3">
          <p className="text-[11px] text-[var(--text-3)] mb-1">할 일 완료율</p>
          <p className="text-lg font-bold text-[var(--purple-text)]">
            {totalTasks > 0 ? `${taskStats.pct}%` : '-'}
          </p>
          {totalTasks > 0 && <p className="text-[10px] text-[var(--text-3)]">완료 {doneTasks} · 부분 {partialTasks} / 전체 {totalTasks}</p>}
        </div>
      </div>

      {/* Routine heatmap */}
      {activeRoutines.length > 0 && (
        <div className="bg-white border border-[var(--border)] rounded-[12px] p-3">
          <p className="text-xs font-semibold mb-2">루틴 달성율 {routineRate !== null && <span className="text-[var(--teal-text)]">{routineRate}%</span>}</p>
          <div className="overflow-x-auto scrollbar-none">
            <table className="w-full text-[10px] text-center">
              <thead>
                <tr>
                  <th className="text-left text-[var(--text-3)] font-normal pr-2 py-1 min-w-[80px]">루틴</th>
                  {weekDays.map((d, i) => (
                    <th key={i} className="px-1 py-1 font-normal text-[var(--text-3)]">{DAY_NAMES[i]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeRoutines.map(r => (
                  <tr key={r.id}>
                    <td className="text-left pr-2 py-1 truncate max-w-[80px] text-[var(--text-2)]">{r.name}</td>
                    {weekDays.map((d, i) => {
                      const ds = formatDate(d)
                      const scheduled = isRoutineScheduledOn(r, ds)
                      const done = !!logs.find(l => l.routine_id === r.id && l.date === ds && l.done)
                      return (
                        <td key={i} className="px-1 py-1">
                          <div className={clsx('w-5 h-5 rounded-full mx-auto',
                            !scheduled ? 'border border-dashed border-[var(--border)] opacity-45' : done ? 'bg-[var(--teal)]' : 'bg-[var(--surface-2)]')} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Goals progress */}
      {weekGoals.length > 0 && (
        <div className="bg-white border border-[var(--border)] rounded-[12px] p-3">
          <p className="text-xs font-semibold mb-2">이번 주 목표</p>
          <div className="flex flex-col gap-2">
            {weekGoals.map(g => {
              const prog = tasksProgress(g.tasks)
              const total = prog.total
              const pct = prog.pct
              return (
                <div key={g.id}>
                  <div className="flex justify-between items-center mb-0.5">
                    <p className="text-xs truncate flex-1">{g.title}</p>
                    {total > 0 && <span className="text-[10px] text-[var(--text-3)] ml-2 tabular-nums">{pct}%</span>}
                  </div>
                  {total > 0 && (
                    <div className="h-1.5 rounded-full bg-[var(--border)]">
                      <div className="h-full rounded-full bg-[var(--teal)] transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Review textarea */}
      <div className="bg-white border border-[var(--border)] rounded-[12px] p-3">
        <p className="text-xs font-semibold mb-2">주간 회고</p>
        <textarea
          value={content}
          onChange={e => updateWeeklyReview(weekKey, e.target.value)}
          placeholder="이번 주를 돌아보며 자유롭게 작성해보세요..."
          rows={6}
          className="w-full text-sm bg-[var(--surface-2)] rounded-[8px] px-3 py-2 outline-none resize-none leading-relaxed"
        />
      </div>
    </div>
  )
}
