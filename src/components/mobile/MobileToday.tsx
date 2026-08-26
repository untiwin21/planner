'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Clock3, Link2, Plus, X } from 'lucide-react'
import { addDays, parseISO, startOfWeek } from 'date-fns'
import clsx from 'clsx'
import type {
  BadgeColor,
  Category,
  DayEntry,
  DayMeta,
  LongGoal,
  Routine,
  RoutineConfig,
  RoutineLog,
  RoutineLogPatch,
  RoutinePeriod,
  RoutineStatus,
  ShortGoal,
  Task,
  TaskScheduleInput,
} from '@/types'
import { DEADLINE_CAT_ID, SCHEDULE_CAT_ID } from '@/types'
import { formatDate } from '@/lib/dates'
import { getTaskDuration, getTaskEnd, getTaskStart, isFixedTask, minutesToTime } from '@/lib/plannerTime'
import { isRoutineScheduledOn, routineColor, routineConfig, routineStartMinute } from '@/lib/routineSchedule'

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
  onToggleRoutine: (routineId: string, date: string, completion?: 'full' | 'minimum', actual?: Pick<RoutineLogPatch, 'actual_start_time' | 'actual_end_time'>) => void
  onUpdateRoutineLog: (routineId: string, date: string, patch: RoutineLogPatch) => void
  onAddRoutine: (name: string, time?: string, period?: RoutinePeriod, config?: RoutineConfig) => void
  onUpdateRoutine: (id: string, patch: Partial<Omit<Routine, 'id'>>) => void
  onSetRoutineStatus: (id: string, status: RoutineStatus) => void
  onDeleteRoutine: (id: string) => void
  onToggleLinkedTask: (goalId: string, taskId: string) => void
  onLinkGoalTask: (taskId: string) => void
  onUnlinkGoalTask: (taskId: string) => void
  onAddCategory?: (category: Omit<Category, 'id'>) => void
  onDeleteCategory?: (categoryId: string) => void
}

type StreamKind = 'task' | 'schedule' | 'deadline' | 'routine' | 'goal'

type StreamItem = {
  key: string
  id: string
  kind: StreamKind
  text: string
  done: boolean
  period: RoutinePeriod
  minute: number | null
  timeLabel: string | null
  detail: string | null
  categoryColor: BadgeColor
  task?: Task
  routine?: Routine
  goal?: ShortGoal
}

const PERIOD_ORDER: RoutinePeriod[] = ['morning', 'afternoon', 'evening', 'anytime']
const PERIOD_META: Record<RoutinePeriod, { emoji: string; label: string }> = {
  morning: { emoji: '☀️', label: 'MORNING' },
  afternoon: { emoji: '🌤️', label: 'AFTERNOON' },
  evening: { emoji: '🌙', label: 'EVENING' },
  anytime: { emoji: '◌', label: 'ANYTIME' },
}
const WEEKDAY_SHORT = ['월', '화', '수', '목', '금', '토', '일']
const WEEKDAY_LONG = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
const COLOR_DOT: Record<BadgeColor, string> = {
  purple: 'bg-[var(--purple)]',
  teal: 'bg-[var(--teal)]',
  amber: 'bg-[var(--amber)]',
  coral: 'bg-[var(--coral)]',
  blue: 'bg-[var(--blue)]',
  gray: 'bg-[var(--text-3)]',
  red: 'bg-[var(--red)]',
}

function normalizeMinute(minute: number | null) {
  if (minute === null) return null
  return minute < 5 * 60 ? minute + 24 * 60 : minute
}

function periodForMinute(minute: number | null): RoutinePeriod {
  if (minute === null) return 'anytime'
  const normalized = minute >= 24 * 60 ? minute - 24 * 60 : minute
  if (normalized >= 5 * 60 && normalized < 12 * 60) return 'morning'
  if (normalized >= 12 * 60 && normalized < 18 * 60) return 'afternoon'
  return 'evening'
}

function taskKind(task: Task): StreamKind {
  if (task.category_id === SCHEDULE_CAT_ID || isFixedTask(task)) return 'schedule'
  if (task.category_id === DEADLINE_CAT_ID) return 'deadline'
  return 'task'
}

function kindLabel(kind: StreamKind) {
  if (kind === 'routine') return 'ROUTINE'
  if (kind === 'schedule') return 'SCHEDULE'
  if (kind === 'deadline') return 'DEADLINE'
  if (kind === 'goal') return 'GOAL'
  return 'TODO'
}

function itemDetail(task: Task) {
  const duration = getTaskDuration(task)
  const end = getTaskEnd(task)
  if (end !== null) return `~ ${minutesToTime(end)}`
  if (duration > 0) return `${duration}분`
  return null
}

export function MobileToday(props: Props) {
  const {
    date,
    entry,
    categories,
    goals,
    routines,
    logs,
    onDateChange,
    onToggleTask,
    onAddTask,
    onToggleRoutine,
    onToggleLinkedTask,
    onLinkGoalTask,
    onUnlinkGoalTask,
  } = props

  const [showGoalPicker, setShowGoalPicker] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [quickText, setQuickText] = useState('')
  const [quickCategoryId, setQuickCategoryId] = useState('')

  const selectedDate = parseISO(date)
  const todayKey = formatDate(new Date())
  const isToday = date === todayKey
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 })
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const selectableCategories = useMemo(
    () => categories.filter(category => category.id !== SCHEDULE_CAT_ID && category.id !== DEADLINE_CAT_ID),
    [categories],
  )
  const effectiveQuickCategoryId = selectableCategories.some(category => category.id === quickCategoryId)
    ? quickCategoryId
    : selectableCategories[0]?.id ?? ''

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

  const activeRoutines = useMemo(
    () => routines.filter(routine => isRoutineScheduledOn(routine, date)),
    [routines, date],
  )

  const streamItems = useMemo<StreamItem[]>(() => {
    const items: StreamItem[] = []
    const directIds = new Set(entry.tasks.map(task => task.id))

    for (const task of entry.tasks) {
      if (task.discarded || task.actual_only) continue
      const rawMinute = getTaskStart(task)
      const minute = normalizeMinute(rawMinute)
      const kind = taskKind(task)
      items.push({
        key: `task:${task.id}`,
        id: task.id,
        kind,
        text: task.text,
        done: task.done,
        period: periodForMinute(minute),
        minute,
        timeLabel: rawMinute === null ? null : minutesToTime(rawMinute),
        detail: itemDetail(task),
        categoryColor: task.category_color,
        task,
      })
    }

    for (const { task, goal } of linkedTasks) {
      if (directIds.has(task.id) || task.discarded) continue
      const rawMinute = getTaskStart(task)
      const minute = normalizeMinute(rawMinute)
      items.push({
        key: `goal:${goal.id}:${task.id}`,
        id: task.id,
        kind: 'goal',
        text: task.text,
        done: task.done,
        period: periodForMinute(minute),
        minute,
        timeLabel: rawMinute === null ? null : minutesToTime(rawMinute),
        detail: goal.title,
        categoryColor: task.category_color,
        task,
        goal,
      })
    }

    for (const routine of activeRoutines) {
      const rawMinute = routineStartMinute(routine)
      const minute = normalizeMinute(rawMinute)
      const config = routineConfig(routine)
      const done = logs.some(log => log.routine_id === routine.id && log.date === date && log.done)
      items.push({
        key: `routine:${routine.id}`,
        id: routine.id,
        kind: 'routine',
        text: routine.name,
        done,
        period: routine.period ?? periodForMinute(minute),
        minute,
        timeLabel: routine.time ?? null,
        detail: config.kind === 'timed' ? `${config.duration_min}분` : config.minimum_version?.trim() || null,
        categoryColor: routineColor(routine),
        routine,
      })
    }

    const periodRank = (period: RoutinePeriod) => PERIOD_ORDER.indexOf(period)
    return items.sort((a, b) => {
      const periodDiff = periodRank(a.period) - periodRank(b.period)
      if (periodDiff !== 0) return periodDiff
      const aMinute = a.minute ?? Number.MAX_SAFE_INTEGER
      const bMinute = b.minute ?? Number.MAX_SAFE_INTEGER
      if (aMinute !== bMinute) return aMinute - bMinute
      if (a.kind === 'schedule' && b.kind !== 'schedule') return -1
      if (b.kind === 'schedule' && a.kind !== 'schedule') return 1
      return a.text.localeCompare(b.text, 'ko')
    })
  }, [entry.tasks, linkedTasks, activeRoutines, logs, date])

  const grouped = useMemo(() => {
    const groups: Record<RoutinePeriod, StreamItem[]> = { morning: [], afternoon: [], evening: [], anytime: [] }
    for (const item of streamItems) groups[item.period].push(item)
    return groups
  }, [streamItems])

  const actionableTasks = streamItems.filter(item => item.kind !== 'schedule' && item.kind !== 'deadline')
  const doneCount = actionableTasks.filter(item => item.done).length
  const completionRate = actionableTasks.length > 0 ? Math.round((doneCount / actionableTasks.length) * 100) : 0

  const normalizedNow = normalizeMinute(new Date().getHours() * 60 + new Date().getMinutes()) ?? 0
  const nextItem = isToday
    ? streamItems.find(item => !item.done && item.minute !== null && item.minute >= normalizedNow - 20)
    : undefined

  function toggleItem(item: StreamItem) {
    if (item.kind === 'schedule') return
    if (item.kind === 'routine') {
      onToggleRoutine(item.id, date)
      return
    }
    if (item.kind === 'goal' && item.goal) {
      onToggleLinkedTask(item.goal.id, item.id)
      return
    }
    onToggleTask(item.id)
  }

  function addQuickTask() {
    const text = quickText.trim()
    if (!text || !effectiveQuickCategoryId) return
    onAddTask(effectiveQuickCategoryId, text)
    setQuickText('')
    setShowQuickAdd(false)
  }

  return (
    <div className="pb-28 min-h-screen">
      <header className="bg-white border-b border-[var(--border)] px-4 pt-4 pb-3 sticky top-0 z-20">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onDateChange(formatDate(addDays(selectedDate, -1)))}
            className="h-9 w-9 rounded-full flex items-center justify-center text-[var(--text-3)] active:bg-[var(--surface-2)]"
            aria-label="이전 날짜"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="text-center min-w-0">
            <h1 className="text-base font-bold">
              {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 {WEEKDAY_LONG[selectedDate.getDay()]}
            </h1>
            <p className="text-[11px] text-[var(--text-3)] mt-0.5">
              {isToday ? `지금 ${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}` : '선택한 날짜'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onDateChange(formatDate(addDays(selectedDate, 1)))}
            className="h-9 w-9 rounded-full flex items-center justify-center text-[var(--text-3)] active:bg-[var(--surface-2)]"
            aria-label="다음 날짜"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mt-3">
          {weekDays.map((day, index) => {
            const dayKey = formatDate(day)
            const selected = dayKey === date
            return (
              <button
                type="button"
                key={dayKey}
                onClick={() => onDateChange(dayKey)}
                className="flex flex-col items-center gap-1 py-1"
              >
                <span className={clsx('text-[10px]', selected ? 'text-[var(--purple)] font-bold' : 'text-[var(--text-3)]')}>
                  {WEEKDAY_SHORT[index]}
                </span>
                <span className={clsx(
                  'h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
                  selected ? 'bg-[var(--purple)] text-white' : 'text-[var(--text-2)]',
                )}>
                  {day.getDate()}
                </span>
              </button>
            )
          })}
        </div>
      </header>

      <main className="px-4 pt-4">
        <section className="bg-white border border-[var(--border)] rounded-[18px] px-4 py-3.5 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-[var(--text-3)] font-semibold">TODAY</p>
              <p className="text-lg font-bold mt-0.5">{doneCount} / {actionableTasks.length}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-[var(--purple)]">{completionRate}%</p>
              <p className="text-[10px] text-[var(--text-3)]">할 일 + 루틴</p>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--surface-2)] mt-3 overflow-hidden">
            <div className="h-full rounded-full bg-[var(--purple)] transition-all" style={{ width: `${completionRate}%` }} />
          </div>
        </section>

        <section className="bg-white border border-[var(--border)] rounded-[20px] overflow-hidden">
          {streamItems.length === 0 ? (
            <div className="py-16 px-6 text-center">
              <p className="text-sm font-semibold">오늘의 스트림이 비어 있습니다.</p>
              <p className="text-xs text-[var(--text-3)] mt-1">할 일이나 루틴을 추가하면 시간 흐름대로 표시됩니다.</p>
            </div>
          ) : (
            PERIOD_ORDER.map(period => {
              const items = grouped[period]
              if (items.length === 0) return null
              const meta = PERIOD_META[period]
              return (
                <div key={period} className="px-3.5 py-4 border-b border-[var(--border)] last:border-b-0">
                  <div className="flex items-center gap-2 px-1 mb-2.5">
                    <span className="text-sm">{meta.emoji}</span>
                    <h2 className="text-[11px] font-bold tracking-[0.08em] text-[var(--text-2)]">{meta.label}</h2>
                    <span className="text-[10px] text-[var(--text-3)]">{items.filter(item => item.done).length}/{items.length}</span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {items.map(item => {
                      const isNow = nextItem?.key === item.key
                      const isSchedule = item.kind === 'schedule'
                      return (
                        <div
                          key={item.key}
                          className={clsx(
                            'rounded-[14px] border px-3 py-2.5 transition-colors',
                            isNow ? 'border-[var(--blue)] bg-[var(--blue-bg)]/50' : 'border-transparent bg-[var(--surface)]',
                          )}
                        >
                          {isNow && (
                            <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold text-[var(--blue-text)] tracking-wide">
                              <Clock3 size={11} /> NOW
                            </div>
                          )}
                          <div className="flex items-start gap-2.5">
                            <button
                              type="button"
                              onClick={() => toggleItem(item)}
                              disabled={isSchedule}
                              aria-label={isSchedule ? '일정' : item.done ? '완료 취소' : '완료'}
                              className={clsx(
                                'mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                                isSchedule && 'border-transparent',
                                !isSchedule && item.done && 'bg-[var(--teal)] border-[var(--teal)] text-white',
                                !isSchedule && !item.done && 'border-[var(--border-strong)]',
                              )}
                            >
                              {isSchedule ? (
                                <span className={clsx('h-2.5 w-2.5 rounded-full', COLOR_DOT[item.categoryColor])} />
                              ) : item.done ? (
                                <Check size={11} strokeWidth={3} />
                              ) : null}
                            </button>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-2">
                                <p className={clsx('text-sm font-semibold leading-5 flex-1', item.done && 'line-through text-[var(--text-3)]')}>
                                  {item.text}
                                </p>
                                <span className={clsx(
                                  'shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide',
                                  item.kind === 'routine' ? 'bg-[var(--teal-bg)] text-[var(--teal-text)]' :
                                    item.kind === 'schedule' ? 'bg-[var(--blue-bg)] text-[var(--blue-text)]' :
                                      item.kind === 'deadline' ? 'bg-[var(--coral-bg)] text-[var(--coral-text)]' :
                                        item.kind === 'goal' ? 'bg-[var(--purple-bg)] text-[var(--purple-text)]' :
                                          'bg-[var(--surface-2)] text-[var(--text-3)]',
                                )}>
                                  {kindLabel(item.kind)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-1 min-w-0">
                                {item.timeLabel && <span className="text-[11px] font-mono text-[var(--text-2)]">{item.timeLabel}</span>}
                                {item.detail && <span className="text-[11px] text-[var(--text-3)] truncate">{item.detail}</span>}
                              </div>
                            </div>

                            {item.kind === 'goal' && (
                              <button
                                type="button"
                                onClick={() => onUnlinkGoalTask(item.id)}
                                className="p-1 text-[var(--text-3)]"
                                aria-label="오늘에서 제거"
                              >
                                <X size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </section>

        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowQuickAdd(value => !value)}
            className="w-full h-11 rounded-[14px] bg-white border border-[var(--border)] text-sm font-semibold flex items-center justify-center gap-2"
          >
            <Plus size={15} className="text-[var(--purple)]" /> 할 일 추가
          </button>

          {showQuickAdd && (
            <div className="bg-white border border-[var(--border)] rounded-[16px] p-3 flex flex-col gap-2">
              <input
                value={quickText}
                onChange={event => setQuickText(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') addQuickTask() }}
                placeholder="오늘 할 일 입력..."
                autoFocus
                className="w-full px-3 py-2.5 rounded-[10px] bg-[var(--surface-2)] text-sm outline-none focus:ring-1 focus:ring-[var(--purple)]"
              />
              <div className="flex gap-2">
                <select
                  value={effectiveQuickCategoryId}
                  onChange={event => setQuickCategoryId(event.target.value)}
                  className="flex-1 min-w-0 px-2.5 py-2 rounded-[10px] bg-[var(--surface-2)] text-xs outline-none"
                >
                  {selectableCategories.map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addQuickTask}
                  disabled={!quickText.trim() || !effectiveQuickCategoryId}
                  className="px-4 rounded-[10px] bg-[var(--purple)] text-white text-xs font-bold disabled:opacity-40"
                >
                  추가
                </button>
              </div>
            </div>
          )}

          {availableGoalTasks.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowGoalPicker(value => !value)}
                className="w-full h-11 rounded-[14px] border border-dashed border-[var(--teal)] text-[var(--teal-text)] text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Link2 size={14} /> 목표에서 오늘 할 일 가져오기
              </button>
              {showGoalPicker && (
                <div className="bg-white border border-[var(--border)] rounded-[16px] p-2 flex flex-col gap-1 shadow-sm">
                  {availableGoalTasks.map(({ task, goal }) => (
                    <button
                      type="button"
                      key={task.id}
                      onClick={() => { onLinkGoalTask(task.id); setShowGoalPicker(false) }}
                      className="text-left px-3 py-2.5 rounded-[11px] active:bg-[var(--teal-bg)]"
                    >
                      <p className="text-sm font-medium">{task.text}</p>
                      <p className="text-[11px] text-[var(--teal-text)] mt-0.5">{goal.title}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
