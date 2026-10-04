'use client'
import clsx from 'clsx'
import { isToday, DAY_NAMES, formatSleepMin, formatDate } from '@/lib/dates'
import { tasksProgress } from '@/lib/taskProgress'
import type { DayEntry, ShortGoal, Task } from '@/types'
import { SCHEDULE_CAT_ID, DEADLINE_CAT_ID } from '@/types'
import { isActualOnlyTask } from '@/lib/taskVisibility'

interface DayCardProps {
  date: Date
  entry?: DayEntry
  goals: ShortGoal[]
  isSelected: boolean
  onClick: () => void
}

const LEVEL_EMOJI: Record<number, string> = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' }

export function DayCard({ date, entry, goals, isSelected, onClick }: DayCardProps) {
  const today = isToday(date)
  const dayIdx = (date.getDay() + 6) % 7
  const tasks = entry?.tasks ?? []
  const meta = entry?.meta

  // Schedule + deadline tasks — sorted by time, then alphabetically; deadlines always visible
  const schedules = tasks
    .filter(t => !t.deleted_at && !t.discarded && (t.category_id === SCHEDULE_CAT_ID || t.category_id === DEADLINE_CAT_ID))
    .sort((a, b) => {
      if (a.category_id === DEADLINE_CAT_ID && b.category_id !== DEADLINE_CAT_ID) return -1
      if (a.category_id !== DEADLINE_CAT_ID && b.category_id === DEADLINE_CAT_ID) return 1
      const aTime = a.start_time || a.time
      const bTime = b.start_time || b.time
      if (aTime && bTime) return aTime.localeCompare(bTime)
      if (aTime) return -1
      if (bTime) return 1
      return a.text.localeCompare(b.text)
    })


  // Day-native tasks that count toward progress (everything except schedule/deadline).
  const workTasks = tasks.filter(t => !isActualOnlyTask(t) && t.category_id !== SCHEDULE_CAT_ID && t.category_id !== DEADLINE_CAT_ID)

  // Linked goal tasks/subtasks imported into this day also count — they belong to a
  // user-managed category just like native tasks. Synthesize standalone Task records
  // for linked individual subtasks so `tasksProgress` treats each as one unit.
  const dateStr = formatDate(date)
  const activeGoals = goals.filter(g => g.date_from <= dateStr && g.date_to >= dateStr)
  const linkedTaskIds = new Set(meta?.linkedGoalTaskIds ?? [])
  const linkedSubIds = new Set(meta?.linkedGoalSubtaskIds ?? [])
  const linkedTasks: Task[] = []
  for (const g of activeGoals) {
    for (const t of g.tasks) {
      const wholeTaskLinked = linkedTaskIds.has(t.id)
      if (wholeTaskLinked) linkedTasks.push(t)
      for (const s of wholeTaskLinked ? [] : (t.subtasks ?? [])) {
        if (linkedSubIds.has(s.id)) {
          linkedTasks.push({
            id: s.id, text: s.text, done: s.done, discarded: s.discarded,
            day_id: t.day_id, goal_id: t.goal_id,
            category_id: t.category_id, category_name: t.category_name, category_color: t.category_color,
          })
        }
      }
    }
  }
  const allCountedTasks = Array.from(
    new Map([...workTasks, ...linkedTasks].map(task => [task.id, task])).values(),
  )
  const progress = tasksProgress(allCountedTasks)
  const totalCnt = progress.total
  const pct = progress.pct

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={`${formatDate(date)} 일정 ${schedules.length}개`}
      onClick={onClick}
      className={clsx(
        'relative flex flex-col w-full rounded-[14px] border transition-all duration-150 text-left overflow-hidden',
        isSelected
          ? 'bg-[var(--purple-bg)] border-[var(--purple)] shadow-[0_0_0_1px_var(--purple)]'
          : today
          ? 'bg-white border-[var(--purple)] shadow-[0_2px_12px_rgba(83,74,183,0.10)]'
          : 'bg-white border-[var(--border)] hover:border-[var(--border-strong)] hover:shadow-sm'
      )}
    >
      {/* Row 1: day + date */}
      <div className="flex items-start justify-between px-3 pt-3 pb-2">
        <div>
          <span className={clsx('text-sm font-semibold tracking-widest uppercase block',
            isSelected || today ? 'text-[var(--purple)]' : 'text-[var(--text-3)]'
          )}>{DAY_NAMES[dayIdx]}</span>
          <span className={clsx('text-[clamp(16px,2vw,22px)] font-bold leading-none tracking-tight',
            today || isSelected ? 'text-[var(--purple)]' : 'text-[var(--text)]'
          )}>{date.getDate()}</span>
        </div>
        {today && <span className="w-1.5 h-1.5 rounded-full bg-[var(--purple)] mt-1 flex-shrink-0" />}
      </div>

      {/* Row 2: schedules — grows with viewport */}
      <div className="px-3 py-2 border-t border-[var(--border)] h-[5rem] overflow-y-auto scrollbar-thin">
        {schedules.length > 0
          ? schedules.map(t => {
              const isDeadline = t!.category_id === DEADLINE_CAT_ID
              return (
                <div key={t!.id} className="flex items-baseline gap-1 leading-snug">
                  {isDeadline ? (
                    <span className="text-sm font-semibold text-[var(--red)] flex-shrink-0">⚠ {t!.start_time || t!.time || ''}</span>
                  ) : (t!.start_time || t!.time) ? (
                    <span className="text-xs font-mono text-[var(--blue)] flex-shrink-0 tabular-nums">
                      {t!.start_time || t!.time}
                    </span>
                  ) : null}
                  <p className={clsx(
                    'text-sm break-words min-w-0',
                    isDeadline ? 'text-[var(--red)] font-bold' : 'text-[var(--text-2)]',
                  )}>
                    {t!.text}
                  </p>
                </div>
              )
            })
          : <p className="text-sm text-[var(--text-3)] italic">일정 없음</p>
        }
      </div>

      {/* Row 4: progress */}
      <div className="px-3 py-2 border-t border-[var(--border)]">
        <div className="flex justify-between mb-1">
          <span className="text-sm text-[var(--text-3)] font-medium">달성률</span>
          <span className="text-sm text-[var(--text-3)]">{totalCnt > 0 ? `${pct}%` : '—'}</span>
        </div>
        <div className="w-full h-[3px] rounded-full bg-[var(--border)]">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: pct === 100 ? 'var(--teal)' : 'var(--purple)' }} />
        </div>
      </div>

      {/* Row 5: sleep / condition / focus */}
      <div className="grid grid-cols-3 border-t border-[var(--border)]">
        {[
          { label: '수면', value: meta?.sleep != null ? formatSleepMin(meta.sleep) : '—' },
          { label: '컨디션', value: meta?.condition != null ? LEVEL_EMOJI[meta.condition] : '—' },
          { label: '집중력', value: meta?.focus != null ? LEVEL_EMOJI[meta.focus] : '—' },
        ].map((item, i) => (
          <div key={i} className={clsx('flex flex-col items-center py-2 gap-0.5', i > 0 && 'border-l border-[var(--border)]')}>
            <span className="text-xs text-[var(--text-3)] uppercase tracking-wide">{item.label}</span>
            <span className="text-sm font-semibold text-[var(--text-2)]">{item.value}</span>
          </div>
        ))}
      </div>
    </button>
  )
}
