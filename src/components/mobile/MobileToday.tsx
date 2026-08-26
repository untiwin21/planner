'use client'

import { useMemo, useState } from 'react'
import { CalendarClock, Check, ChevronLeft, ChevronRight, Flag, Layers3, Link2, Plus, RefreshCw, Settings2, X } from 'lucide-react'
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
import { isRoutineScheduledOn, isTimedRoutine, routineConfig } from '@/lib/routineSchedule'
import { RoutineManagerDialog } from '@/components/routine/RoutineManagerDialog'

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

type RoutineCategory = {
  key: string
  label: string
  color: BadgeColor
  routines: Routine[]
}

type TaskGroup = {
  key: string
  label: string
  color: BadgeColor
  tasks: Task[]
}

const WEEKDAY_SHORT = ['월', '화', '수', '목', '금', '토', '일']
const WEEKDAY_LONG = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

const DOT_CLASS: Record<BadgeColor, string> = {
  purple: 'bg-[var(--purple)]',
  teal: 'bg-[var(--teal)]',
  amber: 'bg-[var(--amber)]',
  coral: 'bg-[var(--coral)]',
  blue: 'bg-[var(--blue)]',
  gray: 'bg-[var(--text-3)]',
  red: 'bg-[var(--red)]',
}

const TINT_CLASS: Record<BadgeColor, string> = {
  purple: 'bg-[var(--purple-bg)] text-[var(--purple-text)]',
  teal: 'bg-[var(--teal-bg)] text-[var(--teal-text)]',
  amber: 'bg-[var(--amber-bg)] text-[var(--amber-text)]',
  coral: 'bg-[var(--coral-bg)] text-[var(--coral-text)]',
  blue: 'bg-[var(--blue-bg)] text-[var(--blue-text)]',
  gray: 'bg-[var(--surface-2)] text-[var(--text-2)]',
  red: 'bg-[var(--red-bg)] text-[var(--red-text)]',
}

const SCHEDULE_TYPE_META = {
  personal: { label: '개인', chip: 'bg-[#EEF5FF] text-[#315A9E]', dot: 'bg-[#4F8EDC]' },
  external: { label: '외부', chip: 'bg-[#ECF8F0] text-[#26734D]', dot: 'bg-[#4FA773]' },
  'deep-work': { label: 'Deep Work', chip: 'bg-[#FDECF4] text-[#A43A6C]', dot: 'bg-[#D96B9D]' },
} as const

function routineCategoryName(routine: Routine) {
  return routineConfig(routine).bundle?.trim() || '기타 루틴'
}

function groupRoutines(routines: Routine[]): RoutineCategory[] {
  const map = new Map<string, Routine[]>()
  for (const routine of routines) {
    const label = routineCategoryName(routine)
    map.set(label, [...(map.get(label) ?? []), routine])
  }
  return [...map.entries()].map(([label, items]) => {
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

function groupTasks(tasks: Task[], categories: Category[]): TaskGroup[] {
  const map = new Map<string, Task[]>()
  for (const task of tasks) map.set(task.category_id, [...(map.get(task.category_id) ?? []), task])
  const knownIds = new Set(categories.map(category => category.id))
  const ordered = categories
    .filter(category => map.has(category.id))
    .map(category => ({ key: category.id, label: category.name, color: category.color, tasks: map.get(category.id) ?? [] }))
  const unknown = [...map.entries()]
    .filter(([categoryId]) => !knownIds.has(categoryId))
    .map(([categoryId, items]) => ({
      key: categoryId,
      label: items[0]?.category_name || '기타',
      color: items[0]?.category_color ?? 'gray' as BadgeColor,
      tasks: items,
    }))
  return [...ordered, ...unknown]
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
    onAddRoutine,
    onUpdateRoutine,
    onSetRoutineStatus,
    onDeleteRoutine,
    onToggleLinkedTask,
    onLinkGoalTask,
    onUnlinkGoalTask,
  } = props

  const [face, setFace] = useState<'tasks' | 'routines'>('tasks')
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [quickText, setQuickText] = useState('')
  const [quickCategoryId, setQuickCategoryId] = useState('')
  const [showGoalPicker, setShowGoalPicker] = useState(false)
  const [showRoutineManager, setShowRoutineManager] = useState(false)

  const selectedDate = parseISO(date)
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
        if (linkedIds.includes(task.id) && !task.discarded) items.push({ task, goal })
      }
    }
    return items
  }, [goals, linkedIds])

  const availableGoalTasks = useMemo(() => {
    const items: Array<{ task: Task; goal: ShortGoal }> = []
    for (const goal of goals) {
      if (goal.date_from > date || goal.date_to < date) continue
      for (const task of goal.tasks) {
        if (!task.done && !task.discarded && !linkedIds.includes(task.id)) items.push({ task, goal })
      }
    }
    return items
  }, [goals, linkedIds, date])

  const schedules = useMemo(
    () => entry.tasks
      .filter(task => !task.discarded && !task.actual_only && task.category_id === SCHEDULE_CAT_ID)
      .sort((a, b) => (a.start_time ?? a.time ?? '99:99').localeCompare(b.start_time ?? b.time ?? '99:99')),
    [entry.tasks],
  )
  const deadlines = useMemo(
    () => entry.tasks.filter(task => !task.discarded && !task.actual_only && task.category_id === DEADLINE_CAT_ID),
    [entry.tasks],
  )
  const normalTasks = useMemo(
    () => entry.tasks.filter(task => !task.discarded && !task.actual_only && task.category_id !== SCHEDULE_CAT_ID && task.category_id !== DEADLINE_CAT_ID),
    [entry.tasks],
  )
  const taskGroups = useMemo(() => groupTasks(normalTasks, selectableCategories), [normalTasks, selectableCategories])
  const directTaskIds = useMemo(() => new Set(entry.tasks.map(task => task.id)), [entry.tasks])
  const linkedOnly = linkedTasks.filter(({ task }) => !directTaskIds.has(task.id))

  const activeRoutines = useMemo(
    () => routines.filter(routine => isRoutineScheduledOn(routine, date)),
    [routines, date],
  )
  const routineCategories = useMemo(() => groupRoutines(activeRoutines), [activeRoutines])

  const taskTotal = normalTasks.length + linkedOnly.length
  const taskDone = normalTasks.filter(task => task.done).length + linkedOnly.filter(({ task }) => task.done).length
  const routineDone = activeRoutines.filter(routine => logs.some(log => log.routine_id === routine.id && log.date === date && log.done)).length

  function addQuickTask() {
    const text = quickText.trim()
    if (!text || !effectiveQuickCategoryId) return
    onAddTask(effectiveQuickCategoryId, text)
    setQuickText('')
    setShowQuickAdd(false)
  }

  function routineIsDone(routineId: string) {
    return logs.some(log => log.routine_id === routineId && log.date === date && log.done)
  }

  function toggleRoutineCategory(category: RoutineCategory) {
    const allDone = category.routines.every(routine => routineIsDone(routine.id))
    for (const routine of category.routines) {
      const done = routineIsDone(routine.id)
      if ((allDone && done) || (!allDone && !done)) onToggleRoutine(routine.id, date)
    }
  }

  function taskRow(task: Task, toggle: () => void, secondary?: string) {
    return (
      <div key={task.id} className="flex items-start gap-3 px-4 py-3 border-b border-[var(--border)] last:border-b-0">
        <button
          type="button"
          onClick={toggle}
          className={clsx(
            'mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
            task.done ? 'bg-[var(--teal)] border-[var(--teal)] text-white' : 'border-[var(--border-strong)]',
          )}
          aria-label={task.done ? '완료 취소' : '완료'}
        >
          {task.done && <Check size={11} strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={clsx('text-sm font-medium leading-5', task.done && 'line-through text-[var(--text-3)]')}>{task.text}</p>
          {secondary && <p className="mt-0.5 truncate text-[10px] text-[var(--text-3)]">{secondary}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => onDateChange(formatDate(addDays(selectedDate, -1)))} className="h-9 w-9 rounded-full flex items-center justify-center text-[var(--text-3)] active:bg-[var(--surface-2)]" aria-label="이전 날짜"><ChevronLeft size={18} /></button>
          <div className="min-w-0 text-center">
            <h1 className="text-base font-bold">{selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 {WEEKDAY_LONG[selectedDate.getDay()]}</h1>
            <p className="mt-0.5 text-[11px] text-[var(--text-3)]">타임라인 없이 오늘 필요한 것만</p>
          </div>
          <button type="button" onClick={() => onDateChange(formatDate(addDays(selectedDate, 1)))} className="h-9 w-9 rounded-full flex items-center justify-center text-[var(--text-3)] active:bg-[var(--surface-2)]" aria-label="다음 날짜"><ChevronRight size={18} /></button>
        </div>

        <div className="grid grid-cols-7 gap-1 mt-3">
          {weekDays.map((day, index) => {
            const dayKey = formatDate(day)
            const selected = dayKey === date
            return (
              <button key={dayKey} type="button" onClick={() => onDateChange(dayKey)} className="flex flex-col items-center gap-1 py-1">
                <span className={clsx('text-[10px]', selected ? 'font-bold text-[var(--purple)]' : 'text-[var(--text-3)]')}>{WEEKDAY_SHORT[index]}</span>
                <span className={clsx('h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold', selected ? 'bg-[var(--purple)] text-white' : 'text-[var(--text-2)]')}>{day.getDate()}</span>
              </button>
            )
          })}
        </div>
      </header>

      <main className="px-4 pt-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-[var(--text-3)]">{face === 'tasks' ? 'TODAY TASKS' : 'MY ROUTINES'}</p>
            <p className="mt-0.5 text-lg font-bold">{face === 'tasks' ? `${taskDone}/${taskTotal}` : `${routineDone}/${activeRoutines.length}`}</p>
          </div>
          <button
            type="button"
            onClick={() => setFace(current => current === 'tasks' ? 'routines' : 'tasks')}
            className="h-9 px-3 rounded-[10px] bg-white border border-[var(--border)] text-xs font-bold text-[var(--text-2)] flex items-center gap-1.5 shadow-sm active:bg-[var(--surface-2)]"
          >
            <RefreshCw size={13} />
            {face === 'tasks' ? '루틴 보기' : '오늘 할 일 보기'}
          </button>
        </div>

        {face === 'tasks' ? (
          <div className="flex flex-col gap-3">
            {(schedules.length > 0 || deadlines.length > 0) && (
              <section className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-white">
                <div className="px-4 py-3 border-b border-[var(--border)]">
                  <h2 className="text-sm font-bold">오늘 일정</h2>
                  <p className="mt-0.5 text-[10px] text-[var(--text-3)]">시간축 없이 일정과 데드라인만 간단히 표시</p>
                </div>
                {schedules.map(task => {
                  const type = task.schedule_type ?? 'personal'
                  const meta = SCHEDULE_TYPE_META[type]
                  return (
                    <div key={task.id} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] last:border-b-0">
                      <CalendarClock size={15} className="shrink-0 text-[var(--blue)]" />
                      <span className="w-11 shrink-0 font-mono text-[11px] text-[var(--text-3)]">{task.start_time ?? task.time ?? '미정'}</span>
                      <div className="min-w-0 flex-1">
                        <p className={clsx('truncate text-sm font-semibold', task.done && 'line-through text-[var(--text-3)]')}>{task.text}</p>
                      </div>
                      <span className={clsx('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold', meta.chip)}><span className={clsx('h-1.5 w-1.5 rounded-full', meta.dot)} />{meta.label}</span>
                      <button type="button" onClick={() => onToggleTask(task.id)} className={clsx('h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0', task.done ? 'bg-[var(--teal)] border-[var(--teal)] text-white' : 'border-[var(--border-strong)]')}>{task.done && <Check size={11} strokeWidth={3} />}</button>
                    </div>
                  )
                })}
                {deadlines.map(task => (
                  <div key={task.id} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] last:border-b-0">
                    <Flag size={15} className="shrink-0 text-[var(--red)]" />
                    <span className="w-11 shrink-0 font-mono text-[11px] text-[var(--red-text)]">{task.start_time ?? task.time ?? '미정'}</span>
                    <p className={clsx('min-w-0 flex-1 truncate text-sm font-semibold', task.done && 'line-through text-[var(--text-3)]')}>{task.text}</p>
                    <span className="rounded-full bg-[var(--red-bg)] px-2 py-1 text-[9px] font-bold text-[var(--red-text)]">DEADLINE</span>
                    <button type="button" onClick={() => onToggleTask(task.id)} className={clsx('h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0', task.done ? 'bg-[var(--teal)] border-[var(--teal)] text-white' : 'border-[var(--red)]')}>{task.done && <Check size={11} strokeWidth={3} />}</button>
                  </div>
                ))}
              </section>
            )}

            {taskGroups.map(group => (
              <section key={group.key} className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-white">
                <div className={clsx('flex items-center gap-2 px-4 py-3', TINT_CLASS[group.color])}>
                  <span className={clsx('h-2.5 w-2.5 rounded-full', DOT_CLASS[group.color])} />
                  <h2 className="min-w-0 flex-1 truncate text-sm font-bold">{group.label}</h2>
                  <span className="text-[10px] font-semibold opacity-70">{group.tasks.filter(task => task.done).length}/{group.tasks.length}</span>
                </div>
                {group.tasks.map(task => taskRow(task, () => onToggleTask(task.id)))}
              </section>
            ))}

            {linkedOnly.length > 0 && (
              <section className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-white">
                <div className="flex items-center gap-2 bg-[var(--teal-bg)] px-4 py-3 text-[var(--teal-text)]">
                  <Link2 size={14} />
                  <h2 className="flex-1 text-sm font-bold">목표에서 가져온 일</h2>
                  <span className="text-[10px] font-semibold opacity-70">{linkedOnly.filter(({ task }) => task.done).length}/{linkedOnly.length}</span>
                </div>
                {linkedOnly.map(({ task, goal }) => (
                  <div key={`${goal.id}:${task.id}`} className="relative">
                    {taskRow(task, () => onToggleLinkedTask(goal.id, task.id), goal.title)}
                    <button type="button" onClick={() => onUnlinkGoalTask(task.id)} className="absolute right-3 top-3 p-1 text-[var(--text-3)]" aria-label="오늘에서 제거"><X size={13} /></button>
                  </div>
                ))}
              </section>
            )}

            {taskTotal === 0 && schedules.length === 0 && deadlines.length === 0 && (
              <div className="rounded-[18px] border border-dashed border-[var(--border-strong)] bg-white px-5 py-12 text-center">
                <p className="text-sm font-semibold">오늘 할 일이 없습니다.</p>
                <p className="mt-1 text-xs text-[var(--text-3)]">필요한 할 일을 바로 추가해보세요.</p>
              </div>
            )}

            <button type="button" onClick={() => setShowQuickAdd(value => !value)} className="h-11 w-full rounded-[14px] border border-[var(--border)] bg-white text-sm font-semibold flex items-center justify-center gap-2"><Plus size={15} className="text-[var(--purple)]" /> 할 일 추가</button>
            {showQuickAdd && (
              <div className="rounded-[16px] border border-[var(--border)] bg-white p-3 flex flex-col gap-2">
                <input value={quickText} onChange={event => setQuickText(event.target.value)} onKeyDown={event => event.key === 'Enter' && addQuickTask()} placeholder="오늘 할 일 입력..." autoFocus className="w-full px-3 py-2.5 rounded-[10px] bg-[var(--surface-2)] text-sm outline-none focus:ring-1 focus:ring-[var(--purple)]" />
                <div className="flex gap-2">
                  <select value={effectiveQuickCategoryId} onChange={event => setQuickCategoryId(event.target.value)} className="flex-1 min-w-0 px-2.5 py-2 rounded-[10px] bg-[var(--surface-2)] text-xs outline-none">
                    {selectableCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                  <button type="button" onClick={addQuickTask} disabled={!quickText.trim() || !effectiveQuickCategoryId} className="px-4 rounded-[10px] bg-[var(--purple)] text-white text-xs font-bold disabled:opacity-40">추가</button>
                </div>
              </div>
            )}

            {availableGoalTasks.length > 0 && (
              <>
                <button type="button" onClick={() => setShowGoalPicker(value => !value)} className="h-11 w-full rounded-[14px] border border-dashed border-[var(--teal)] text-[var(--teal-text)] text-xs font-semibold flex items-center justify-center gap-1.5"><Link2 size={14} /> 목표에서 오늘 할 일 가져오기</button>
                {showGoalPicker && (
                  <div className="rounded-[16px] border border-[var(--border)] bg-white p-2 flex flex-col gap-1 shadow-sm">
                    {availableGoalTasks.map(({ task, goal }) => (
                      <button key={task.id} type="button" onClick={() => { onLinkGoalTask(task.id); setShowGoalPicker(false) }} className="text-left px-3 py-2.5 rounded-[11px] active:bg-[var(--teal-bg)]">
                        <p className="text-sm font-medium">{task.text}</p>
                        <p className="mt-0.5 text-[11px] text-[var(--teal-text)]">{goal.title}</p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {routineCategories.map(category => {
              const doneCount = category.routines.filter(routine => routineIsDone(routine.id)).length
              const allDone = doneCount === category.routines.length
              return (
                <section key={category.key} className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-white">
                  <div className={clsx('flex items-center gap-3 px-4 py-3', TINT_CLASS[category.color])}>
                    <span className={clsx('h-2.5 w-2.5 rounded-full', DOT_CLASS[category.color])} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5"><Layers3 size={13} /><h2 className="truncate text-sm font-bold">{category.label}</h2></div>
                      <p className="mt-0.5 text-[10px] opacity-70">{doneCount}/{category.routines.length} 완료</p>
                    </div>
                    <button type="button" onClick={() => toggleRoutineCategory(category)} className="rounded-full bg-white/75 px-2.5 py-1 text-[10px] font-bold active:bg-white">{allDone ? '전체 해제' : '한번에 체크'}</button>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {category.routines.map(routine => {
                      const done = routineIsDone(routine.id)
                      const config = routineConfig(routine)
                      return (
                        <button key={routine.id} type="button" onClick={() => onToggleRoutine(routine.id, date)} className={clsx('w-full flex items-center gap-3 px-4 py-3 text-left', done && 'bg-[var(--surface-2)]/60')}>
                          <span className={clsx('h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0', done ? 'bg-[var(--teal)] border-[var(--teal)] text-white' : 'border-[var(--border-strong)]')}>{done && <Check size={11} strokeWidth={3} />}</span>
                          <span className="min-w-0 flex-1">
                            <span className={clsx('block truncate text-sm font-semibold', done && 'line-through text-[var(--text-3)]')}>{routine.name}</span>
                            <span className="mt-0.5 block truncate text-[10px] text-[var(--text-3)]">{routine.time ? `${routine.time} · ` : ''}{isTimedRoutine(routine) ? `${config.duration_min}분` : '체크형'}{config.cue_label ? ` · ${config.cue_label}` : ''}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}

            {routineCategories.length === 0 && (
              <div className="rounded-[18px] border border-dashed border-[var(--border-strong)] bg-white px-5 py-12 text-center">
                <p className="text-sm font-semibold">오늘 실행할 루틴이 없습니다.</p>
                <p className="mt-1 text-xs text-[var(--text-3)]">루틴 관리에서 카테고리를 만들고 행동을 묶어보세요.</p>
              </div>
            )}

            <button type="button" onClick={() => setShowRoutineManager(true)} className="h-11 w-full rounded-[14px] border border-[var(--border)] bg-white text-xs font-bold text-[var(--text-2)] flex items-center justify-center gap-1.5"><Settings2 size={14} /> 루틴 관리</button>
          </div>
        )}
      </main>

      {showRoutineManager && (
        <RoutineManagerDialog
          routines={routines}
          onClose={() => setShowRoutineManager(false)}
          onAddRoutine={onAddRoutine}
          onUpdateRoutine={onUpdateRoutine}
          onSetStatus={onSetRoutineStatus}
          onDeleteRoutine={onDeleteRoutine}
        />
      )}
    </div>
  )
}
