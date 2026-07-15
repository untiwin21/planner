'use client'

import { useMemo, useState } from 'react'
import { Check, Link2, Plus, X } from 'lucide-react'
import clsx from 'clsx'
import type { Category, DayEntry, DayMeta, LongGoal, Routine, RoutineLog, ShortGoal, Task, TaskScheduleInput } from '@/types'
import { TodayDashboard } from '@/components/today/TodayDashboard'

interface Props {
  date: string
  entry: DayEntry
  categories: Category[]
  goals: ShortGoal[]
  longGoals: LongGoal[]
  routines: Routine[]
  logs: RoutineLog[]
  onDateChange: (date: string) => void
  onToggleTask: (taskId: string) => void
  onAddTask: (catId: string, text: string, schedule?: TaskScheduleInput) => void
  onCarryTask: (date: string, catId: string, text: string, schedule?: TaskScheduleInput) => void
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
  onMetaChange: (patch: Partial<DayMeta>) => void
  onToggleRoutine: (routineId: string, date: string) => void
  onToggleLinkedTask: (goalId: string, taskId: string) => void
  onLinkGoalTask: (taskId: string) => void
  onUnlinkGoalTask: (taskId: string) => void
  onAddCategory?: (category: Omit<Category, 'id'>) => void
  onDeleteCategory?: (categoryId: string) => void
}

export function MobileToday({
  date,
  entry,
  categories,
  goals,
  longGoals,
  routines,
  logs,
  onDateChange,
  onToggleTask,
  onAddTask,
  onCarryTask,
  onUpdateTask,
  onDeleteTask,
  onMetaChange,
  onToggleRoutine,
  onToggleLinkedTask,
  onLinkGoalTask,
  onUnlinkGoalTask,
  onAddCategory,
  onDeleteCategory,
}: Props) {
  const [showGoalPicker, setShowGoalPicker] = useState(false)
  const linkedIds = entry.meta.linkedGoalTaskIds ?? []
  const linkedTasks = useMemo(() => {
    const items: Array<{ task: Task; goal: ShortGoal }> = []
    for (const goal of goals) {
      for (const task of goal.tasks) {
        if (linkedIds.includes(task.id)) items.push({ task, goal })
      }
    }
    return items
  }, [goals, linkedIds])
  const availableGoalTasks = useMemo(() => {
    const items: Array<{ task: Task; goal: ShortGoal }> = []
    for (const goal of goals) {
      if (goal.date_from > date || goal.date_to < date) continue
      for (const task of goal.tasks) {
        if (!task.done && !linkedIds.includes(task.id)) items.push({ task, goal })
      }
    }
    return items
  }, [goals, linkedIds, date])

  return (
    <div className="pb-28">
      <TodayDashboard
        compact
        date={date}
        entry={entry}
        categories={categories}
        goals={goals}
        longGoals={longGoals}
        routines={routines}
        routineLogs={logs}
        onDateChange={onDateChange}
        onToggleTask={onToggleTask}
        onAddTask={onAddTask}
        onCarryTask={onCarryTask}
        onUpdateTask={onUpdateTask}
        onDeleteTask={onDeleteTask}
        onMetaChange={onMetaChange}
        onAddCategory={onAddCategory}
        onDeleteCategory={onDeleteCategory}
        onToggleRoutine={onToggleRoutine}
      />

      {linkedTasks.length > 0 && (
        <section className="mx-4 mt-4 bg-white border border-[var(--border)] rounded-[18px] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <Link2 size={14} className="text-[var(--teal)]" />
              <h3 className="text-sm font-bold">목표에서 가져온 일</h3>
            </div>
          </div>
          <div className="p-3 flex flex-col gap-2">
            {linkedTasks.map(({ task, goal }) => (
              <div key={task.id} className="flex items-start gap-2.5 px-3 py-2.5 rounded-[12px] bg-[var(--teal-bg)]">
                <button
                  type="button"
                  onClick={() => onToggleLinkedTask(goal.id, task.id)}
                  className={clsx(
                    'mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0',
                    task.done ? 'bg-[var(--teal)] border-[var(--teal)] text-white' : 'border-[var(--teal)]',
                  )}
                >
                  {task.done && <Check size={11} strokeWidth={3} />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={clsx('text-sm font-medium', task.done && 'line-through opacity-60')}>{task.text}</p>
                  <p className="text-[11px] text-[var(--teal-text)] mt-0.5">{goal.title}</p>
                </div>
                <button type="button" onClick={() => onUnlinkGoalTask(task.id)} aria-label="오늘에서 제거" className="p-1 text-[var(--teal-text)]/60 hover:text-[var(--red)]"><X size={13} /></button>
              </div>
            ))}
          </div>
        </section>
      )}

      {availableGoalTasks.length > 0 && (
        <section className="mx-4 mt-3">
          <button
            type="button"
            onClick={() => setShowGoalPicker(value => !value)}
            className="w-full px-3 py-2.5 rounded-[12px] border border-dashed border-[var(--teal)] text-[var(--teal-text)] text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <Plus size={13} /> 목표에서 오늘 할 일 가져오기
          </button>
          {showGoalPicker && (
            <div className="mt-2 bg-white border border-[var(--border)] rounded-[14px] p-2 flex flex-col gap-1 shadow-sm">
              {availableGoalTasks.map(({ task, goal }) => (
                <button
                  type="button"
                  key={task.id}
                  onClick={() => { onLinkGoalTask(task.id); setShowGoalPicker(false) }}
                  className="text-left px-3 py-2 rounded-[10px] hover:bg-[var(--teal-bg)]"
                >
                  <p className="text-sm font-medium">{task.text}</p>
                  <p className="text-[11px] text-[var(--teal-text)] mt-0.5">{goal.title}</p>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
