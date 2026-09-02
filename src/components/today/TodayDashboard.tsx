'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Ban,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GripVertical,
  HeartPulse,
  History,
  Flame,
  Moon,
  Pencil,
  Percent,
  Plus,
  Repeat2,
  Settings2,
  Target,
  Tag,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { addDays, format, parseISO, subDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import clsx from 'clsx'
import type { BadgeColor, Category, DayEntry, DayMeta, FocusSessionRecord, LongGoal, Routine, RoutineConfig, RoutineLog, RoutineLogPatch, RoutinePeriod, RoutineStatus, ShortGoal, SubTask, Task, TaskScheduleInput } from '@/types'
import { DEADLINE_CAT_ID, SCHEDULE_CAT_ID } from '@/types'
import { formatDate, formatSleepMin } from '@/lib/dates'
import {
  formatDuration,
  getTaskDuration,
  getTaskEnd,
  getTaskStart,
  isFixedTask,
  minutesToTime,
  timeToMinutes,
} from '@/lib/plannerTime'
import { taskProgressPercent, tasksProgress } from '@/lib/taskProgress'
import { isActualOnlyTask } from '@/lib/taskVisibility'
import { RoutineManagerDialog } from '@/components/routine/RoutineManagerDialog'
import {
  ROUTINE_PERIOD_LABELS,
  ROUTINE_PERIOD_ORDER,
  isRoutineScheduledOn,
  isTimedRoutine,
  routineBundleLabel,
  routineColor,
  routineConfig,
  routineStartMinute,
} from '@/lib/routineSchedule'

interface Props {
  date: string
  entry: DayEntry
  categories: Category[]
  goals?: ShortGoal[]
  longGoals?: LongGoal[]
  routines?: Routine[]
  routineLogs?: RoutineLog[]
  onDateChange?: (date: string) => void
  onAddTask: (categoryId: string, text: string, schedule?: TaskScheduleInput) => void
  onCarryTask?: (date: string, categoryId: string, text: string, schedule?: TaskScheduleInput) => void
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
  onToggleTask: (taskId: string) => void
  onMetaChange: (patch: Partial<DayMeta>) => void
  onAddCategory?: (category: Omit<Category, 'id'>) => void
  onDeleteCategory?: (categoryId: string) => void
  onUpdateCategory?: (categoryId: string, patch: Partial<Omit<Category, 'id'>>) => void
  onReorderCategory?: (draggedId: string, targetId: string) => void
  onReorderTask?: (categoryId: string, draggedId: string, targetId: string) => void
  onToggleRoutine?: (routineId: string, date: string, completion?: 'full' | 'minimum', actual?: Pick<RoutineLogPatch, 'actual_start_time' | 'actual_end_time'>) => void
  onUpdateRoutineLog?: (routineId: string, date: string, patch: RoutineLogPatch) => void
  onAddRoutine?: (name: string, time?: string, period?: RoutinePeriod, config?: RoutineConfig) => void
  onUpdateRoutine?: (id: string, patch: Partial<Omit<Routine, 'id'>>) => void
  onSetRoutineStatus?: (id: string, status: RoutineStatus) => void
  onDeleteRoutine?: (id: string) => void
  compact?: boolean
}

interface ActualEditorState {
  taskId?: string
  subtaskId?: string
  text: string
  start: string
  end: string
  categoryId: string
}

interface RoutineActualEditorState {
  routineIds: string[]
  text: string
  start: string
  end: string
}

interface ProgressEditorState {
  taskId: string
  current: string
  target: string
  unit: string
  carryOver: boolean
}

interface TaskEditorState {
  taskId: string
  text: string
  categoryId: string
  duration: string
}

interface PlannedTimelineItem {
  key: string
  token: string
  task: Task
  subtask?: SubTask
  text: string
  categoryName: string
  categoryColor: BadgeColor
  start: number
  end: number
  fixed: boolean
  done: boolean
}

interface ActualTimelineItem {
  key: string
  token: string
  task: Task
  subtask?: SubTask
  session?: FocusSessionRecord
  text: string
  categoryName: string
  categoryColor: BadgeColor
  start: number
  end: number
}

type TimelineSide = 'plan' | 'actual'

const CATEGORY_COLORS: BadgeColor[] = ['purple', 'teal', 'amber', 'coral', 'blue']
const TIMELINE_CATEGORY_STYLE: Record<BadgeColor, string> = {
  purple: 'bg-[var(--purple-bg)] border-[var(--purple)] text-[var(--purple-text)]',
  teal: 'bg-[var(--teal-bg)] border-[var(--teal)] text-[var(--teal-text)]',
  amber: 'bg-[var(--amber-bg)] border-[var(--amber)] text-[var(--amber-text)]',
  coral: 'bg-[var(--coral-bg)] border-[var(--coral)] text-[var(--coral-text)]',
  blue: 'bg-[var(--blue-bg)] border-[var(--blue)] text-[var(--blue-text)]',
  gray: 'bg-[var(--surface-2)] border-[var(--border-strong)] text-[var(--text-2)]',
  red: 'bg-[var(--red-bg)] border-[var(--red)] text-[var(--red-text)]',
}
const CONDITION_LABELS: Record<number, string> = {
  1: '매우 나쁨',
  2: '나쁨',
  3: '보통',
  4: '좋음',
  5: '매우 좋음',
}
const CONDITION_EMOJI: Record<number, string> = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' }
const TIMELINE_START = 5 * 60
const TIMELINE_END = 29 * 60
const TIMELINE_DURATION = TIMELINE_END - TIMELINE_START
const TIMELINE_HOURS = Array.from({ length: TIMELINE_DURATION / 60 + 1 }, (_, index) => TIMELINE_START + index * 60)
const MIN_TIMELINE_CANVAS_HEIGHT = 760
const TIMELINE_PANEL_CHROME_HEIGHT = 102
const MIN_TODAY_PANELS_HEIGHT = 620
const VIEWPORT_BOTTOM_GAP = 24

function timelinePosition(minute: number) {
  return `${((minute - TIMELINE_START) / TIMELINE_DURATION) * 100}%`
}

function timelineBlockHeight(start: number, end: number) {
  return `max(30px, ${((end - start) / TIMELINE_DURATION) * 100}%)`
}

function normalizeTimelineMinute(minute: number) {
  return minute < TIMELINE_START ? minute + 24 * 60 : minute
}

function focusSessionTimelineRange(session: FocusSessionRecord, plannerDate: string) {
  const startedAt = new Date(session.started_at)
  if (Number.isNaN(startedAt.getTime()) || !Number.isFinite(session.duration_min) || session.duration_min <= 0) return null

  const base = parseISO(plannerDate)
  base.setHours(0, 0, 0, 0)
  const rawStart = (startedAt.getTime() - base.getTime()) / 60_000

  const endedAt = new Date(session.ended_at)
  const recordedEnd = Number.isNaN(endedAt.getTime())
    ? null
    : (endedAt.getTime() - base.getTime()) / 60_000
  const wallDuration = recordedEnd === null ? null : recordedEnd - rawStart
  // Current stopwatch sessions store each active segment separately, so ended_at
  // normally gives the exact wall-clock end. Older records could include paused
  // gaps; in that case duration_min remains the authoritative focused duration.
  const rawEnd = recordedEnd !== null && wallDuration !== null && Math.abs(wallDuration - session.duration_min) <= 1
    ? recordedEnd
    : rawStart + session.duration_min

  const start = Math.max(TIMELINE_START, rawStart)
  const end = Math.min(TIMELINE_END, rawEnd)
  if (end <= start) return null
  return { start, end }
}

function timelineRangeLabel(start: number, end: number) {
  const startClock = minutesToTime(start)
  const endClock = minutesToTime(end)
  if (start < 24 * 60 && end >= 24 * 60) return `${startClock}–다음날 ${endClock}`
  if (start >= 24 * 60) return `다음날 ${startClock}–${endClock}`
  return `${startClock}–${endClock}`
}

function nowAsMinutes() {
  const date = new Date()
  return date.getHours() * 60 + date.getMinutes()
}

function newSubtaskId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `subtask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function taskDragToken(taskId: string) {
  return `task:${taskId}`
}

function subtaskDragToken(taskId: string, subtaskId: string) {
  return `subtask:${taskId}:${subtaskId}`
}

function actualTaskDragToken(taskId: string) {
  return `actual-task:${taskId}`
}

function actualSubtaskDragToken(taskId: string, subtaskId: string) {
  return `actual-subtask:${taskId}:${subtaskId}`
}

function routineGroupDragToken(groupKey: string) {
  return `routine-group:${encodeURIComponent(groupKey)}`
}

function CategoryDot({ color }: { color: Category['color'] }) {
  const colors: Record<Category['color'], string> = {
    purple: 'bg-[var(--purple)]',
    teal: 'bg-[var(--teal)]',
    amber: 'bg-[var(--amber)]',
    coral: 'bg-[var(--coral)]',
    blue: 'bg-[var(--blue)]',
    gray: 'bg-[var(--text-3)]',
    red: 'bg-[var(--red)]',
  }
  return <span className={clsx('h-2.5 w-2.5 rounded-full shrink-0', colors[color])} />
}

export function TodayDashboard({
  date,
  entry,
  categories,
  goals = [],
  longGoals = [],
  routines = [],
  routineLogs = [],
  onDateChange,
  onAddTask,
  onCarryTask,
  onUpdateTask,
  onDeleteTask,
  onToggleTask,
  onMetaChange,
  onAddCategory,
  onDeleteCategory,
  onUpdateCategory,
  onReorderCategory,
  onReorderTask,
  onToggleRoutine,
  onUpdateRoutineLog,
  onAddRoutine,
  onUpdateRoutine,
  onSetRoutineStatus,
  onDeleteRoutine,
  compact = false,
}: Props) {
  const [nowMinute, setNowMinute] = useState(nowAsMinutes)
  const [showWellness, setShowWellness] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState<BadgeColor>('purple')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [editingCategoryColor, setEditingCategoryColor] = useState<BadgeColor>('purple')
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null)
  const [taskText, setTaskText] = useState('')
  const [durationText, setDurationText] = useState('60')
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragPreviewMinute, setDragPreviewMinute] = useState<number | null>(null)
  const [dragTargetSide, setDragTargetSide] = useState<TimelineSide>('plan')
  const [actualEditor, setActualEditor] = useState<ActualEditorState | null>(null)
  const [routineActualEditor, setRoutineActualEditor] = useState<RoutineActualEditorState | null>(null)
  const [actualError, setActualError] = useState('')
  const [progressEditor, setProgressEditor] = useState<ProgressEditorState | null>(null)
  const [progressError, setProgressError] = useState('')
  const [taskEditor, setTaskEditor] = useState<TaskEditorState | null>(null)
  const [taskEditorError, setTaskEditorError] = useState('')
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(() => new Set())
  const [subtaskInputs, setSubtaskInputs] = useState<Record<string, string>>({})
  const [subtaskDurations, setSubtaskDurations] = useState<Record<string, string>>({})
  const [showRoutineManager, setShowRoutineManager] = useState(false)
  const panelsRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const pointerTaskIdRef = useRef<string | null>(null)
  const timelineDropHandledRef = useRef(false)
  const [panelsHeight, setPanelsHeight] = useState(680)
  const selectableCategories = useMemo(() => categories.filter(category => category.id !== SCHEDULE_CAT_ID && category.id !== DEADLINE_CAT_ID), [categories])
  const taskEditorCategories = useMemo(() => categories.filter(category => category.id !== SCHEDULE_CAT_ID), [categories])
  const [categoryId, setCategoryId] = useState(selectableCategories[0]?.id ?? '')

  const dateObject = parseISO(date)
  const todayKey = formatDate(new Date())
  const isToday = date === todayKey
  const isPastDate = date < todayKey

  useEffect(() => {
    if (!isToday) return
    const timer = window.setInterval(() => setNowMinute(nowAsMinutes()), 60_000)
    return () => window.clearInterval(timer)
  }, [isToday])

  useEffect(() => {
    if (!selectableCategories.some(category => category.id === categoryId)) {
      setCategoryId(selectableCategories[0]?.id ?? '')
    }
  }, [categoryId, selectableCategories])

  const editableUntil = isPastDate
    ? TIMELINE_END
    : isToday
      ? Math.max(TIMELINE_START, Math.min(TIMELINE_END, nowMinute))
      : TIMELINE_START
  const canEditActual = editableUntil > TIMELINE_START

  // Timeline visibility is intentionally independent from remaining capacity.
  // Past fixed events must stay visible instead of disappearing as the clock advances.
  const chronological = useMemo<PlannedTimelineItem[]>(() => {
    const items: PlannedTimelineItem[] = []
    const append = ({ task, subtask }: { task: Task; subtask?: SubTask }) => {
      if (task.discarded || subtask?.discarded) return
      const rawStart = subtask ? timeToMinutes(subtask.start_time) : getTaskStart(task)
      if (rawStart === null) return
      const duration = subtask?.duration_min ?? getTaskDuration(task)
      const rawEnd = subtask ? timeToMinutes(subtask.end_time) ?? rawStart + duration : getTaskEnd(task) ?? rawStart + duration
      const start = rawStart < TIMELINE_START ? rawStart + 24 * 60 : rawStart
      const normalizedEnd = rawEnd < TIMELINE_START ? rawEnd + 24 * 60 : rawEnd
      const end = normalizedEnd > start ? normalizedEnd : start + duration
      if (end <= TIMELINE_START || start >= TIMELINE_END) return
      items.push({
        key: subtask ? `subtask-plan:${task.id}:${subtask.id}` : `task-plan:${task.id}`,
        token: subtask ? subtaskDragToken(task.id, subtask.id) : taskDragToken(task.id),
        task,
        subtask,
        text: subtask?.text ?? task.text,
        categoryName: subtask ? `${task.text} · 하위` : task.category_name,
        categoryColor: task.category_color,
        start: Math.max(TIMELINE_START, start),
        end: Math.min(TIMELINE_END, end),
        fixed: subtask ? false : isFixedTask(task),
        done: subtask?.done ?? task.done,
      })
    }
    for (const task of entry.tasks) {
      if (isFixedTask(task) || getTaskStart(task) !== null) append({ task })
      for (const subtask of task.subtasks ?? []) {
        if (subtask.start_time) append({ task, subtask })
      }
    }
    return items.sort((a, b) => a.start - b.start || Number(b.fixed) - Number(a.fixed))
  }, [entry.tasks])

  const actualBlocks = useMemo<ActualTimelineItem[]>(() => {
    const items: ActualTimelineItem[] = []
    const pushRange = ({ task, subtask, session, rawStart, rawEnd }: {
      task: Task
      subtask?: SubTask
      session?: FocusSessionRecord
      rawStart: number
      rawEnd: number
    }) => {
      const start = rawStart < TIMELINE_START ? rawStart + 24 * 60 : rawStart
      let end = rawEnd < TIMELINE_START ? rawEnd + 24 * 60 : rawEnd
      if (end <= start) end += 24 * 60
      const normalizedStart = Math.max(TIMELINE_START, start)
      const normalizedEnd = Math.min(TIMELINE_END, end)
      if (normalizedEnd <= normalizedStart) return
      items.push({
        key: session ? `actual-session:${task.id}:${session.id}` : subtask ? `actual-subtask:${task.id}:${subtask.id}` : `actual-task:${task.id}`,
        token: session ? `actual-session:${task.id}:${session.id}` : subtask ? actualSubtaskDragToken(task.id, subtask.id) : actualTaskDragToken(task.id),
        task,
        subtask,
        session,
        text: subtask?.text ?? task.text,
        categoryName: session ? '집중 세션' : subtask ? `${task.text} · 하위` : task.category_name,
        categoryColor: task.category_color,
        start: normalizedStart,
        end: normalizedEnd,
      })
    }
    const appendLegacy = ({ task, subtask }: { task: Task; subtask?: SubTask }) => {
      const actualStatus = subtask?.actual_status ?? task.actual_status
      const actualStart = subtask?.actual_start_time ?? (!subtask ? task.actual_start_time : undefined)
      const actualEnd = subtask?.actual_end_time ?? (!subtask ? task.actual_end_time : undefined)
      if (actualStatus !== 'recorded' || !actualStart || !actualEnd) return
      const rawStart = timeToMinutes(actualStart)
      const rawEnd = timeToMinutes(actualEnd)
      if (rawStart === null || rawEnd === null) return
      pushRange({ task, subtask, rawStart, rawEnd })
    }
    const appendSession = (task: Task, session: FocusSessionRecord) => {
      const range = focusSessionTimelineRange(session, date)
      if (!range) return
      pushRange({ task, session, rawStart: range.start, rawEnd: range.end })
    }
    for (const task of entry.tasks) {
      if ((task.actual_sessions ?? []).length > 0) {
        for (const session of task.actual_sessions ?? []) appendSession(task, session)
      } else {
        appendLegacy({ task })
      }
      for (const subtask of task.subtasks ?? []) appendLegacy({ task, subtask })
    }
    return items.sort((a, b) => a.start - b.start)
  }, [date, entry.tasks])

  // Preserve the explicit order stored in DayEntry. User drag ordering must not
  // be overridden by completion state or updated_at timestamps.
  const flexible = useMemo(() => entry.tasks
    .filter(task => !isActualOnlyTask(task) && !isFixedTask(task)), [entry.tasks])

  const taskGroups = useMemo(() => {
    const byCategory = new Map<string, Task[]>()
    flexible.forEach(task => byCategory.set(task.category_id, [...(byCategory.get(task.category_id) ?? []), task]))
    const knownIds = new Set(selectableCategories.map(category => category.id))
    const knownGroups = selectableCategories
      .map(category => ({ category, tasks: byCategory.get(category.id) ?? [] }))
      .filter(group => group.tasks.length > 0)
    const unknownGroups = [...byCategory.entries()]
      .filter(([id]) => !knownIds.has(id))
      .map(([id, tasks]) => ({
        category: { id, name: tasks[0]?.category_name ?? '기타', color: tasks[0]?.category_color ?? 'gray' } as Category,
        tasks,
      }))
    return [...knownGroups, ...unknownGroups]
  }, [flexible, selectableCategories])

  const currentCategory = selectableCategories.find(category => category.id === categoryId)
  const activeRoutines = useMemo(() => routines
    .filter(routine => isRoutineScheduledOn(routine, date))
    .sort((a, b) => {
      const rawAStart = routineStartMinute(a)
      const rawBStart = routineStartMinute(b)
      const aStart = rawAStart === null ? Number.MAX_SAFE_INTEGER : normalizeTimelineMinute(rawAStart)
      const bStart = rawBStart === null ? Number.MAX_SAFE_INTEGER : normalizeTimelineMinute(rawBStart)
      return aStart - bStart || (a.order ?? 0) - (b.order ?? 0)
    }), [date, routines])
  const routineTimelineGroups = useMemo(() => {
    const grouped = new Map<string, Routine[]>()
    for (const routine of activeRoutines) {
      if (!isTimedRoutine(routine)) continue
      const rawStart = routineStartMinute(routine)
      const start = rawStart === null ? null : normalizeTimelineMinute(rawStart)
      if (start === null || start >= TIMELINE_END) continue
      const bundle = routine.config?.bundle?.trim()
      const key = bundle ? `bundle:${routine.period ?? 'anytime'}:${bundle}` : `routine:${routine.id}`
      grouped.set(key, [...(grouped.get(key) ?? []), routine])
    }
    return [...grouped.entries()].map(([key, items]) => {
      const starts = items.map(item => normalizeTimelineMinute(routineStartMinute(item)!)).sort((a, b) => a - b)
      const start = starts[0]
      const sameStart = starts.every(itemStart => itemStart === start)
      const end = Math.min(
        TIMELINE_END,
        sameStart
          ? start + items.reduce((sum, item) => sum + routineConfig(item).duration_min, 0)
          : Math.max(...items.map(item => {
            const itemStart = routineStartMinute(item)
            return (itemStart === null ? start : normalizeTimelineMinute(itemStart)) + routineConfig(item).duration_min
          })),
      )
      const doneCount = items.filter(item => routineLogs.some(log => log.routine_id === item.id && log.date === date && log.done)).length
      const minimumCount = items.filter(item => routineLogs.some(log => log.routine_id === item.id && log.date === date && log.done && log.completion === 'minimum')).length
      return {
        key,
        items,
        label: routineBundleLabel(items[0]),
        start,
        end,
        doneCount,
        minimumCount,
        color: routineColor(items[0]),
      }
    }).sort((a, b) => a.start - b.start)
  }, [activeRoutines, date, routineLogs])
  const routineActualGroups = useMemo(() => {
    const grouped = new Map<string, Routine[]>()
    for (const routine of activeRoutines) {
      if (!isTimedRoutine(routine)) continue
      const log = routineLogs.find(item => item.routine_id === routine.id && item.date === date && item.done)
      if (!log) continue
      const bundle = routine.config?.bundle?.trim()
      const key = bundle ? `bundle:${routine.period ?? 'anytime'}:${bundle}` : `routine:${routine.id}`
      grouped.set(key, [...(grouped.get(key) ?? []), routine])
    }
    return [...grouped.entries()].flatMap(([key, items]) => {
      const ranges = items.map(item => {
        const log = routineLogs.find(candidate => candidate.routine_id === item.id && candidate.date === date && candidate.done)
        const rawFallbackStart = routineStartMinute(item)
        const fallbackStart = rawFallbackStart === null ? null : normalizeTimelineMinute(rawFallbackStart)
        const rawStart = timeToMinutes(log?.actual_start_time) ?? fallbackStart
        const rawEnd = timeToMinutes(log?.actual_end_time) ?? (rawStart !== null ? rawStart + routineConfig(item).duration_min : null)
        if (rawStart === null || rawEnd === null) return null
        const start = rawStart < TIMELINE_START ? rawStart + 24 * 60 : rawStart
        let end = rawEnd < TIMELINE_START ? rawEnd + 24 * 60 : rawEnd
        if (end <= start) end += 24 * 60
        return { start, end }
      }).filter((range): range is { start: number; end: number } => Boolean(range))
      if (ranges.length === 0) return []
      return [{
        key,
        items,
        label: routineBundleLabel(items[0]),
        start: Math.max(TIMELINE_START, Math.min(...ranges.map(range => range.start))),
        end: Math.min(TIMELINE_END, Math.max(...ranges.map(range => range.end))),
        doneCount: items.length,
        minimumCount: items.filter(item => routineLogs.some(log => log.routine_id === item.id && log.date === date && log.done && log.completion === 'minimum')).length,
        color: routineColor(items[0]),
      }]
    }).sort((a, b) => a.start - b.start)
  }, [activeRoutines, date, routineLogs])
  const normalizedNow = nowMinute < TIMELINE_START ? nowMinute + 24 * 60 : nowMinute
  const currentRoutineGroup = isToday
    ? routineTimelineGroups.find(group => group.start <= normalizedNow && group.end >= normalizedNow && group.doneCount < group.items.length)
    : undefined
  const focusGoals = useMemo(() => goals
    .filter(goal => goal.date_from <= date && goal.date_to >= date)
    .sort((a, b) => a.date_to.localeCompare(b.date_to)), [date, goals])

  useEffect(() => {
    const updatePanelsHeight = () => {
      const top = panelsRef.current?.getBoundingClientRect().top
      if (top === undefined) return
      const available = Math.max(
        MIN_TODAY_PANELS_HEIGHT,
        Math.floor(window.innerHeight - top - VIEWPORT_BOTTOM_GAP),
      )
      setPanelsHeight(current => current === available ? current : available)
    }

    const frame = window.requestAnimationFrame(updatePanelsHeight)
    window.addEventListener('resize', updatePanelsHeight)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updatePanelsHeight)
    }
  }, [compact, date, focusGoals.length])

  const timelineCanvasHeight = Math.max(
    MIN_TIMELINE_CANVAS_HEIGHT,
    panelsHeight - TIMELINE_PANEL_CHROME_HEIGHT,
  )
  const longGoalNames = useMemo(() => new Map(longGoals.map(goal => [goal.id, goal.title])), [longGoals])
  const todaySchedules = useMemo(() => entry.tasks
    .filter(task => !task.discarded && !isActualOnlyTask(task) && (task.category_id === SCHEDULE_CAT_ID || isFixedTask(task)))
    .sort((a, b) => {
      const rawAStart = getTaskStart(a)
      const rawBStart = getTaskStart(b)
      const aStart = rawAStart === null ? Number.MAX_SAFE_INTEGER : normalizeTimelineMinute(rawAStart)
      const bStart = rawBStart === null ? Number.MAX_SAFE_INTEGER : normalizeTimelineMinute(rawBStart)
      return aStart - bStart
    }), [entry.tasks])

  function toggleRoutineGroup(items: Routine[]) {
    if (!onToggleRoutine) return
    const allDone = items.every(item => routineLogs.some(log => log.routine_id === item.id && log.date === date && log.done))
    for (const item of items) {
      const done = routineLogs.some(log => log.routine_id === item.id && log.date === date && log.done)
      if ((allDone && done) || (!allDone && !done)) onToggleRoutine(item.id, date)
    }
  }

  function addTask() {
    const title = taskText.trim()
    const duration = Math.max(1, Number.parseInt(durationText, 10) || 0)
    if (!title || !categoryId || duration <= 0) return
    onAddTask(categoryId, title, { fixed: false, duration_min: duration })
    setTaskText('')
  }

  function addCategory() {
    const name = newCategoryName.trim()
    if (!name || !onAddCategory) return
    onAddCategory({ name, color: newCategoryColor })
    setNewCategoryName('')
    setShowCategoryForm(false)
  }

  function beginCategoryEdit(category: Category) {
    setEditingCategoryId(category.id)
    setEditingCategoryName(category.name)
    setEditingCategoryColor(category.color)
  }

  function saveCategoryEdit() {
    if (!editingCategoryId || !editingCategoryName.trim() || !onUpdateCategory) return
    onUpdateCategory(editingCategoryId, { name: editingCategoryName.trim(), color: editingCategoryColor })
    setEditingCategoryId(null)
  }

  function timelineMinuteFromPointer(clientY: number, element: HTMLDivElement) {
    const rect = element.getBoundingClientRect()
    const position = Math.max(0, Math.min(rect.height, clientY - rect.top))
    const rawMinute = TIMELINE_START + (position / rect.height) * (TIMELINE_END - TIMELINE_START)
    return Math.max(TIMELINE_START, Math.min(TIMELINE_END - 15, Math.round(rawMinute / 15) * 15))
  }

  function placePlanItem(token: string, minute: number) {
    const time = minutesToTime(minute)
    if (token.startsWith('routine-group:')) return
    if (token.startsWith('subtask:') || token.startsWith('actual-subtask:')) {
      const [, taskId, subtaskId] = token.split(':')
      const task = entry.tasks.find(item => item.id === taskId)
      if (task) {
        onUpdateTask(taskId, {
          subtasks: (task.subtasks ?? []).map(subtask => subtask.id === subtaskId
            ? { ...subtask, start_time: time, updated_at: Date.now() }
            : subtask),
        })
      }
    } else {
      const taskId = token.startsWith('actual-task:') ? token.slice(12) : token.startsWith('task:') ? token.slice(5) : token
      onUpdateTask(taskId, { start_time: time, time })
    }
    setDraggedTaskId(null)
    setDragPreviewMinute(null)
  }

  function actualRangeAtDrop(minute: number, duration: number) {
    if (!canEditActual) return null
    const available = editableUntil - TIMELINE_START
    if (available < 15) return null
    const boundedDuration = Math.min(Math.max(15, duration), available)
    const start = Math.max(TIMELINE_START, Math.min(minute, editableUntil - boundedDuration))
    return { start, end: start + boundedDuration }
  }

  function placeActualItem(token: string, minute: number) {
    if (!canEditActual) return
    if (token.startsWith('routine-group:')) {
      const key = decodeURIComponent(token.slice('routine-group:'.length))
      const group = routineTimelineGroups.find(item => item.key === key) ?? routineActualGroups.find(item => item.key === key)
      const range = group ? actualRangeAtDrop(minute, group.end - group.start) : null
      if (!group || !range) return
      const actual = { actual_start_time: minutesToTime(range.start), actual_end_time: minutesToTime(range.end) }
      for (const routine of group.items) {
        const log = routineLogs.find(item => item.routine_id === routine.id && item.date === date)
        if (log?.done) onUpdateRoutineLog?.(routine.id, date, actual)
        else onToggleRoutine?.(routine.id, date, 'full', actual)
      }
    } else if (token.startsWith('subtask:') || token.startsWith('actual-subtask:')) {
      const parts = token.split(':')
      const taskId = parts[1]
      const subtaskId = parts[2]
      const task = entry.tasks.find(item => item.id === taskId)
      const subtask = task?.subtasks?.find(item => item.id === subtaskId)
      const range = subtask ? actualRangeAtDrop(minute, subtask.duration_min ?? 30) : null
      if (!task || !subtask || !range) return
      const nextSubtasks = (task.subtasks ?? []).map(item => item.id === subtaskId ? {
        ...item,
        done: true,
        actual_start_time: minutesToTime(range.start),
        actual_end_time: minutesToTime(range.end),
        actual_status: 'recorded' as const,
        updated_at: Date.now(),
      } : item)
      const activeSubtasks = nextSubtasks.filter(item => !item.discarded)
      onUpdateTask(taskId, {
        subtasks: nextSubtasks,
        done: activeSubtasks.length > 0 && activeSubtasks.every(item => item.done),
      })
    } else {
      const taskId = token.startsWith('actual-task:') ? token.slice(12) : token.startsWith('task:') ? token.slice(5) : token
      const task = entry.tasks.find(item => item.id === taskId)
      const range = task ? actualRangeAtDrop(minute, getTaskDuration(task)) : null
      if (!task || !range) return
      onUpdateTask(taskId, {
        actual_start_time: minutesToTime(range.start),
        actual_end_time: minutesToTime(range.end),
        actual_status: 'recorded',
        actual_duration_min: undefined,
        actual_sessions: undefined,
        done: true,
      })
    }
    setDraggedTaskId(null)
    setDragPreviewMinute(null)
  }

  function timelineDropAtPoint(clientX: number, clientY: number) {
    const element = timelineRef.current
    if (!element) return null
    const rect = element.getBoundingClientRect()
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null
    return {
      minute: timelineMinuteFromPointer(clientY, element),
      side: clientX >= rect.left + rect.width / 2 ? 'actual' as const : 'plan' as const,
    }
  }

  function placeTimelineItem(token: string, minute: number, side: TimelineSide) {
    if (side === 'actual') placeActualItem(token, minute)
    else placePlanItem(token, minute)
  }

  function removePlanPlacement(token: string) {
    if (token.startsWith('subtask:')) {
      const [, taskId, subtaskId] = token.split(':')
      const task = entry.tasks.find(item => item.id === taskId)
      if (!task) return
      onUpdateTask(taskId, {
        subtasks: (task.subtasks ?? []).map(subtask => subtask.id === subtaskId
          ? { ...subtask, start_time: undefined, end_time: undefined, updated_at: Date.now() }
          : subtask),
      })
      return
    }
    if (!token.startsWith('task:')) return
    const taskId = token.slice(5)
    const task = entry.tasks.find(item => item.id === taskId)
    if (!task || isFixedTask(task)) return
    onUpdateTask(taskId, { start_time: undefined, end_time: undefined, time: undefined })
  }

  function finishPointerDrag(clientX: number, clientY: number) {
    const taskId = pointerTaskIdRef.current
    const drop = timelineDropAtPoint(clientX, clientY)
    pointerTaskIdRef.current = null
    if (taskId && drop) placeTimelineItem(taskId, drop.minute, drop.side)
    else {
      setDraggedTaskId(null)
      setDragPreviewMinute(null)
    }
  }

  function toTimelineMinute(value: string) {
    const minute = timeToMinutes(value)
    if (minute === null) return null
    return minute < TIMELINE_START ? minute + 24 * 60 : minute
  }

  function openActualEditor(task?: Task, plannedStart?: number, plannedEnd?: number, subtask?: SubTask) {
    if (!canEditActual) return
    const existingStart = subtask?.actual_start_time ?? task?.actual_start_time
    const existingEnd = subtask?.actual_end_time ?? task?.actual_end_time
    const rawEndMinute = Math.min(editableUntil, plannedEnd ?? editableUntil)
    const endMinute = Math.max(TIMELINE_START + 15, Math.floor(rawEndMinute / 15) * 15)
    const startMinute = Math.max(TIMELINE_START, Math.min(endMinute - 15, plannedStart ?? endMinute - 60))
    if (task && !existingStart && startMinute >= editableUntil) return
    setActualError('')
    setActualEditor({
      taskId: task?.id,
      subtaskId: subtask?.id,
      text: subtask?.text ?? task?.text ?? '',
      start: existingStart ?? minutesToTime(startMinute),
      end: existingEnd ?? minutesToTime(endMinute),
      categoryId: task?.category_id ?? categoryId ?? selectableCategories[0]?.id ?? '',
    })
  }

  function saveActualRecord() {
    if (!actualEditor) return
    const start = toTimelineMinute(actualEditor.start)
    let end = toTimelineMinute(actualEditor.end)
    if (start === null || end === null) {
      setActualError('시작과 종료 시간을 입력해주세요.')
      return
    }
    if (end <= start) end += 24 * 60
    if (start < TIMELINE_START || end > editableUntil || end <= start) {
      setActualError('현재 시각 이전의 구간만 기록할 수 있습니다.')
      return
    }
    if (actualEditor.taskId) {
      const task = entry.tasks.find(item => item.id === actualEditor.taskId)
      if (task && actualEditor.subtaskId) {
        const nextSubtasks = (task.subtasks ?? []).map(subtask => subtask.id === actualEditor.subtaskId ? {
          ...subtask,
          done: true,
          actual_start_time: actualEditor.start,
          actual_end_time: actualEditor.end,
          actual_status: 'recorded' as const,
          updated_at: Date.now(),
        } : subtask)
        const activeSubtasks = nextSubtasks.filter(subtask => !subtask.discarded)
        onUpdateTask(actualEditor.taskId, {
          subtasks: nextSubtasks,
          done: activeSubtasks.length > 0 && activeSubtasks.every(subtask => subtask.done),
        })
      } else {
        onUpdateTask(actualEditor.taskId, {
          actual_start_time: actualEditor.start,
          actual_end_time: actualEditor.end,
          actual_status: 'recorded',
          actual_duration_min: undefined,
          actual_sessions: undefined,
          done: true,
        })
      }
    } else {
      const title = actualEditor.text.trim()
      if (!title || !actualEditor.categoryId) {
        setActualError('실제로 한 일과 카테고리를 입력해주세요.')
        return
      }
      onAddTask(actualEditor.categoryId, title, {
        duration_min: end - start,
        fixed: false,
        actual_start_time: actualEditor.start,
        actual_end_time: actualEditor.end,
        actual_status: 'recorded',
        actual_only: true,
        done: true,
      })
    }
    setActualEditor(null)
    setActualError('')
  }

  function markActualSkipped() {
    if (!actualEditor?.taskId) return
    const task = entry.tasks.find(item => item.id === actualEditor.taskId)
    if (task && actualEditor.subtaskId) {
      onUpdateTask(actualEditor.taskId, {
        subtasks: (task.subtasks ?? []).map(subtask => subtask.id === actualEditor.subtaskId ? {
          ...subtask,
          actual_start_time: undefined,
          actual_end_time: undefined,
          actual_status: 'skipped' as const,
          done: false,
          updated_at: Date.now(),
        } : subtask),
        done: false,
      })
      setActualEditor(null)
      return
    }
    onUpdateTask(actualEditor.taskId, {
      actual_start_time: undefined,
      actual_end_time: undefined,
      actual_status: 'skipped',
      actual_duration_min: undefined,
      actual_sessions: undefined,
      done: false,
    })
    setActualEditor(null)
  }

  function clearActualRecord() {
    if (!actualEditor?.taskId) return
    const task = entry.tasks.find(item => item.id === actualEditor.taskId)
    if (task && actualEditor.subtaskId) {
      onUpdateTask(actualEditor.taskId, {
        subtasks: (task.subtasks ?? []).map(subtask => subtask.id === actualEditor.subtaskId ? {
          ...subtask,
          actual_start_time: undefined,
          actual_end_time: undefined,
          actual_status: undefined,
          updated_at: Date.now(),
        } : subtask),
      })
      setActualEditor(null)
      return
    }
    if (task && isActualOnlyTask(task)) {
      onDeleteTask(task.id)
      setActualEditor(null)
      return
    }
    onUpdateTask(actualEditor.taskId, {
      actual_start_time: undefined,
      actual_end_time: undefined,
      actual_status: undefined,
      actual_duration_min: undefined,
      actual_sessions: undefined,
    })
    setActualEditor(null)
  }

  function openRoutineActualEditor(items: Routine[]) {
    if (!canEditActual || items.length === 0) return
    const logs = items
      .map(item => routineLogs.find(log => log.routine_id === item.id && log.date === date && log.done))
      .filter((log): log is RoutineLog => Boolean(log))
    if (logs.length === 0) return
    const starts = logs.map(log => toTimelineMinute(log.actual_start_time ?? '')).filter((value): value is number => value !== null)
    const ends = logs.map(log => toTimelineMinute(log.actual_end_time ?? '')).filter((value): value is number => value !== null)
    const totalDuration = items.reduce((sum, item) => sum + routineConfig(item).duration_min, 0)
    const plannedStart = routineStartMinute(items[0]) ?? editableUntil - totalDuration
    const fallbackStart = Math.max(TIMELINE_START, Math.min(plannedStart, editableUntil - Math.min(totalDuration, editableUntil - TIMELINE_START)))
    const fallbackEnd = Math.min(editableUntil, fallbackStart + totalDuration)
    setActualError('')
    setRoutineActualEditor({
      routineIds: items.map(item => item.id),
      text: routineBundleLabel(items[0]),
      start: minutesToTime(starts.length > 0 ? Math.min(...starts) : fallbackStart),
      end: minutesToTime(ends.length > 0 ? Math.max(...ends) : fallbackEnd),
    })
  }

  function saveRoutineActualRecord() {
    if (!routineActualEditor || !onUpdateRoutineLog) return
    const start = toTimelineMinute(routineActualEditor.start)
    let end = toTimelineMinute(routineActualEditor.end)
    if (start === null || end === null) {
      setActualError('시작과 종료 시간을 입력해주세요.')
      return
    }
    if (end <= start) end += 24 * 60
    if (start < TIMELINE_START || end > editableUntil || end <= start) {
      setActualError('현재 시각 이전의 구간만 기록할 수 있습니다.')
      return
    }
    for (const routineId of routineActualEditor.routineIds) {
      onUpdateRoutineLog(routineId, date, {
        actual_start_time: routineActualEditor.start,
        actual_end_time: routineActualEditor.end,
      })
    }
    setRoutineActualEditor(null)
    setActualError('')
  }

  function toggleTaskWithActualEditor(task: Task) {
    onToggleTask(task.id)
    if (task.done || task.discarded || !canEditActual || (task.actual_sessions?.length ?? 0) > 0) return
    const start = getTaskStart(task)
    const normalizedStart = start === null ? undefined : start < TIMELINE_START ? start + 24 * 60 : start
    const plannedEnd = normalizedStart === undefined ? undefined : getTaskEnd(task) ?? normalizedStart + getTaskDuration(task)
    openActualEditor(task, normalizedStart, plannedEnd)
  }

  function toggleSubtaskWithActualEditor(task: Task, subtask: SubTask) {
    updateSubtask(task, subtask.id, { done: !subtask.done })
    if (subtask.done || subtask.discarded || !canEditActual) return
    const start = timeToMinutes(subtask.start_time)
    const normalizedStart = start === null ? undefined : start < TIMELINE_START ? start + 24 * 60 : start
    const plannedEnd = normalizedStart === undefined ? undefined : normalizedStart + (subtask.duration_min ?? 30)
    openActualEditor(task, normalizedStart, plannedEnd, subtask)
  }

  function openProgressEditor(task: Task) {
    setProgressError('')
    setProgressEditor({
      taskId: task.id,
      current: task.progress_current?.toString() ?? '',
      target: task.progress_target?.toString() ?? '100',
      unit: task.progress_unit ?? '%',
      carryOver: false,
    })
  }

  function openTaskEditor(task: Task) {
    setTaskEditorError('')
    setTaskEditor({
      taskId: task.id,
      text: task.text,
      categoryId: task.category_id,
      duration: String(getTaskDuration(task)),
    })
  }

  function saveTaskEdit() {
    if (!taskEditor) return
    const text = taskEditor.text.trim()
    const duration = Number.parseInt(taskEditor.duration, 10)
    const category = taskEditorCategories.find(item => item.id === taskEditor.categoryId)
    if (!text || !category || !Number.isFinite(duration) || duration <= 0) {
      setTaskEditorError('할 일, 카테고리, 예상시간을 확인해주세요.')
      return
    }
    onUpdateTask(taskEditor.taskId, {
      text,
      duration_min: duration,
      category_id: category.id,
      category_name: category.name,
      category_color: category.color,
    })
    setTaskEditor(null)
  }

  function toggleTaskExpanded(taskId: string) {
    setExpandedTaskIds(current => {
      const next = new Set(current)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  function addSubtask(task: Task) {
    const text = (subtaskInputs[task.id] ?? '').trim()
    const duration = Number.parseInt(subtaskDurations[task.id] ?? '30', 10)
    if (!text || !Number.isFinite(duration) || duration <= 0) return
    const subtask: SubTask = {
      id: newSubtaskId(),
      text,
      done: false,
      duration_min: duration,
      updated_at: Date.now(),
    }
    onUpdateTask(task.id, {
      subtasks: [...(task.subtasks ?? []), subtask],
      done: false,
      discarded: false,
      progress_current: undefined,
      progress_target: undefined,
      progress_unit: undefined,
    })
    setSubtaskInputs(current => ({ ...current, [task.id]: '' }))
    setSubtaskDurations(current => ({ ...current, [task.id]: '30' }))
    setExpandedTaskIds(current => new Set(current).add(task.id))
  }

  function updateSubtask(task: Task, subtaskId: string, patch: Partial<SubTask>) {
    const nextSubtasks = (task.subtasks ?? []).map(subtask => subtask.id === subtaskId
      ? { ...subtask, ...patch, updated_at: Date.now() }
      : subtask)
    const activeSubtasks = nextSubtasks.filter(subtask => !subtask.discarded)
    const allActiveDone = activeSubtasks.length > 0 && activeSubtasks.every(subtask => subtask.done)
    onUpdateTask(task.id, {
      subtasks: nextSubtasks,
      done: allActiveDone,
      discarded: false,
      progress_current: undefined,
      progress_target: undefined,
      progress_unit: undefined,
    })
  }

  function removeSubtask(task: Task, subtaskId: string) {
    const nextSubtasks = (task.subtasks ?? []).filter(subtask => subtask.id !== subtaskId)
    const activeSubtasks = nextSubtasks.filter(subtask => !subtask.discarded)
    onUpdateTask(task.id, {
      subtasks: nextSubtasks,
      done: activeSubtasks.length > 0 && activeSubtasks.every(subtask => subtask.done),
    })
  }

  function discardTask(task: Task) {
    const discarded = !task.discarded
    onUpdateTask(task.id, discarded ? {
      discarded: true,
      done: false,
      progress_current: undefined,
      progress_target: undefined,
      progress_unit: undefined,
      start_time: undefined,
      end_time: undefined,
      time: undefined,
      actual_start_time: undefined,
      actual_end_time: undefined,
      actual_status: undefined,
      actual_duration_min: undefined,
      actual_sessions: undefined,
    } : { discarded: false })
  }

  function setQuickProgress(percent: number) {
    setProgressEditor(current => current ? { ...current, current: String(percent), target: '100', unit: '%' } : current)
  }

  function savePartialProgress() {
    if (!progressEditor) return
    const task = entry.tasks.find(item => item.id === progressEditor.taskId)
    const current = Number(progressEditor.current)
    const target = Number(progressEditor.target)
    const unit = progressEditor.unit.trim() || '%'
    if (!task || !Number.isFinite(current) || !Number.isFinite(target) || target <= 0 || current <= 0) {
      setProgressError('실제량과 목표량을 0보다 크게 입력해주세요.')
      return
    }
    const clampedCurrent = Math.min(current, target)
    const completed = clampedCurrent >= target
    onUpdateTask(task.id, {
      done: completed,
      progress_current: clampedCurrent,
      progress_target: target,
      progress_unit: unit,
    })

    if (!completed && progressEditor.carryOver && onCarryTask) {
      const remaining = Math.max(0, target - clampedCurrent)
      const ratio = remaining / target
      const nextDate = formatDate(addDays(parseISO(date), 1))
      const carriedTitle = `${task.text} · 남은 ${remaining}${unit}`
      onCarryTask(nextDate, task.category_id, carriedTitle, {
        fixed: false,
        duration_min: Math.max(1, Math.round(getTaskDuration(task) * ratio)),
        progress_current: 0,
        progress_target: remaining,
        progress_unit: unit,
      })
    }
    setProgressEditor(null)
    setProgressError('')
  }

  return (
    <section className={clsx('w-full', compact ? 'px-4 pt-4' : '')}>
      <div className={clsx('flex items-center justify-between gap-3', compact ? 'mb-4' : 'mb-5')}>
        {onDateChange && (
          <button type="button" aria-label="이전 날짜" onClick={() => onDateChange(formatDate(subDays(dateObject, 1)))} className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-white">
            <ChevronLeft size={18} />
          </button>
        )}
        <div className={clsx(onDateChange ? 'text-center' : '')}>
          <p className="text-xs font-semibold text-[var(--purple)] mb-1">{isToday ? 'TODAY' : 'DAY PLAN'}</p>
          <h2 className={clsx('font-bold tracking-tight', compact ? 'text-lg' : 'text-2xl')}>{format(dateObject, 'M월 d일 EEEE', { locale: ko })}</h2>
          <p className="text-sm text-[var(--text-3)] mt-1">오늘의 일정과 단기계획을 확인하고 하루를 배치하세요.</p>
        </div>
        {onDateChange && (
          <button type="button" aria-label="다음 날짜" onClick={() => onDateChange(formatDate(addDays(dateObject, 1)))} className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-white">
            <ChevronRight size={18} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setShowWellness(true)} className="rounded-[16px] bg-white border border-[var(--border)] p-4 text-left hover:border-[var(--purple)] transition-colors">
          <div className="flex items-center gap-2 text-xs text-[var(--text-3)]"><Moon size={14} /> 수면시간</div>
          <p className="text-2xl font-bold mt-2">{entry.meta.sleep != null ? formatSleepMin(entry.meta.sleep) : '기록 전'}</p>
          <p className="text-[11px] text-[var(--purple)] mt-1">클릭하여 기록</p>
        </button>

        <button type="button" onClick={() => setShowWellness(true)} className="rounded-[16px] bg-white border border-[var(--border)] p-4 text-left hover:border-[var(--purple)] transition-colors">
          <div className="flex items-center gap-2 text-xs text-[var(--text-3)]"><HeartPulse size={14} /> 컨디션</div>
          <p className="text-2xl font-bold mt-2">{entry.meta.condition != null ? `${CONDITION_EMOJI[entry.meta.condition]} ${CONDITION_LABELS[entry.meta.condition]}` : '기록 전'}</p>
          <p className="text-[11px] text-[var(--purple)] mt-1">클릭하여 기록</p>
        </button>
      </div>

      <div className="bg-white border border-[var(--border)] rounded-[18px] p-4 mt-4">
        <div className="mb-3">
          <h3 className="text-sm font-bold">오늘 한눈에</h3>
          <p className="text-xs text-[var(--text-3)] mt-0.5">선택한 날짜의 일정과 진행 중인 단기계획이 자동으로 표시됩니다.</p>
        </div>
        <div className={clsx('grid gap-3', compact ? 'grid-cols-1' : 'md:grid-cols-2')}>
          <section className="rounded-[14px] border border-[var(--border)] bg-[var(--purple-bg)]/35 p-3">
            <div className="mb-2 flex items-center gap-2">
              <CalendarClock size={14} className="text-[var(--purple)]" />
              <h4 className="text-xs font-bold">오늘의 일정</h4>
              <span className="ml-auto text-[10px] font-semibold text-[var(--purple-text)]">{todaySchedules.length}개</span>
            </div>
            {todaySchedules.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {todaySchedules.map(task => {
                  const start = getTaskStart(task)
                  return (
                    <div key={task.id} className="flex items-center gap-2 rounded-[10px] bg-white/80 px-2.5 py-2">
                      <span className="w-11 shrink-0 text-[10px] font-bold tabular-nums text-[var(--purple-text)]">{start === null ? '미정' : minutesToTime(start)}</span>
                      <span className={clsx('min-w-0 flex-1 truncate text-xs font-semibold', task.done && 'line-through opacity-55')}>{task.text}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="rounded-[10px] border border-dashed border-[var(--border-strong)] bg-white/45 px-3 py-4 text-center text-xs text-[var(--text-3)]">등록된 일정이 없습니다.</p>
            )}
          </section>

          <section className="rounded-[14px] border border-[var(--border)] bg-[var(--teal-bg)]/35 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Target size={14} className="text-[var(--teal)]" />
              <h4 className="text-xs font-bold">오늘의 단기계획</h4>
              <span className="ml-auto text-[10px] font-semibold text-[var(--teal-text)]">{focusGoals.length}개</span>
            </div>
            {focusGoals.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {focusGoals.map(goal => {
                  const progress = tasksProgress(goal.tasks)
                  return (
                    <div key={goal.id} className="rounded-[10px] bg-white/80 px-2.5 py-2">
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 text-xs font-semibold leading-snug">{goal.title}</p>
                        <span className="shrink-0 text-[10px] font-bold text-[var(--teal-text)]">{progress.total > 0 ? `${progress.pct}%` : '준비'}</span>
                      </div>
                      {goal.long_goal_id && longGoalNames.get(goal.long_goal_id) && <p className="mt-1 truncate text-[9px] text-[var(--teal-text)]">{longGoalNames.get(goal.long_goal_id)}</p>}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="rounded-[10px] border border-dashed border-[var(--border-strong)] bg-white/45 px-3 py-4 text-center text-xs text-[var(--text-3)]">진행 중인 단기계획이 없습니다.</p>
            )}
          </section>
        </div>
      </div>

      <div ref={panelsRef} className={clsx('grid gap-4 mt-4', compact ? 'grid-cols-1' : 'xl:grid-cols-[1.15fr_1fr]')}>
        <div className="bg-white border border-[var(--border)] rounded-[18px] overflow-hidden flex flex-col" style={{ height: panelsHeight }}>
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold">계획과 실제 타임라인</h3>
              <p className="text-xs text-[var(--text-3)] mt-0.5">같은 시간축에서 왼쪽은 Plan, 오른쪽은 실제 기록입니다.</p>
            </div>
            <button type="button" disabled={!canEditActual} onClick={() => openActualEditor()} className="shrink-0 px-3 py-2 rounded-[9px] bg-[var(--purple)] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-35 disabled:cursor-not-allowed">
              <History size={13} /> 지난 시간 기록
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            <div className="sticky top-0 z-40 ml-14 mr-3 grid grid-cols-2 border-b border-[var(--border)] bg-white/95 backdrop-blur-sm">
              <div className="py-2 text-center text-[11px] font-bold text-[var(--purple-text)]">PLAN</div>
              <div className="border-l border-[var(--border-strong)] py-2 text-center text-[11px] font-bold text-[var(--teal-text)]">실제</div>
            </div>
            <div
              ref={timelineRef}
              className={clsx('relative ml-14 mr-3 transition-colors', draggedTaskId && 'bg-[var(--purple-bg)]/20')}
              style={{ height: timelineCanvasHeight }}
              onDragOver={event => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                const rect = event.currentTarget.getBoundingClientRect()
                setDragTargetSide(event.clientX >= rect.left + rect.width / 2 ? 'actual' : 'plan')
                setDragPreviewMinute(timelineMinuteFromPointer(event.clientY, event.currentTarget))
              }}
              onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragPreviewMinute(null)
              }}
              onDrop={event => {
                event.preventDefault()
                const taskId = draggedTaskId ?? event.dataTransfer.getData('text/plain')
                const rect = event.currentTarget.getBoundingClientRect()
                const side: TimelineSide = event.clientX >= rect.left + rect.width / 2 ? 'actual' : 'plan'
                timelineDropHandledRef.current = true
                if (taskId) placeTimelineItem(taskId, timelineMinuteFromPointer(event.clientY, event.currentTarget), side)
              }}
            >
              <div className="absolute bottom-0 left-1/2 top-0 z-[5] border-l border-[var(--border-strong)]" aria-hidden="true" />
              {TIMELINE_HOURS.map(minute => {
                const top = timelinePosition(minute)
                return (
                  <div key={minute} className="absolute left-0 right-0 border-t border-[var(--border)]" style={{ top }}>
                    <span className="absolute right-full -translate-y-1/2 whitespace-nowrap pr-2 text-[10px] font-medium text-[var(--text-3)] tabular-nums">{minute >= 24 * 60 ? `다음날 ${minutesToTime(minute)}` : minutesToTime(minute)}</span>
                    {minute === 24 * 60 && <span className="absolute left-1/2 top-0 z-[6] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--border)] bg-white px-2 py-0.5 text-[9px] font-bold text-[var(--text-3)] shadow-sm">다음날 · {format(addDays(dateObject, 1), 'M월 d일')}</span>}
                  </div>
                )
              })}

              {isToday && (() => {
                const normalizedNow = nowMinute < TIMELINE_START ? nowMinute + 24 * 60 : nowMinute
                if (normalizedNow < TIMELINE_START || normalizedNow > TIMELINE_END) return null
                const top = timelinePosition(normalizedNow)
                return <div className="absolute left-0 right-0 z-30 border-t border-[var(--red)]" style={{ top }}><span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-[var(--red)]" /><span className="absolute right-1 -top-4 text-[9px] font-semibold text-[var(--red)]">현재</span></div>
              })()}

              {dragPreviewMinute !== null && (
                <div className={clsx('absolute z-30 border-t-2 border-dashed pointer-events-none', dragTargetSide === 'actual' ? 'left-1/2 right-0 border-[var(--teal)]' : 'left-0 right-1/2 border-[var(--purple)]')} style={{ top: timelinePosition(dragPreviewMinute) }}>
                  <span className={clsx('absolute -translate-y-1/2 px-1.5 py-0.5 rounded text-white text-[10px] font-bold', dragTargetSide === 'actual' ? 'left-2 bg-[var(--teal)]' : 'left-2 bg-[var(--purple)]')}>{dragTargetSide === 'actual' ? '완료 ' : '계획 '}{minutesToTime(dragPreviewMinute)}</span>
                </div>
              )}

              {routineTimelineGroups.map(group => {
                const top = timelinePosition(group.start)
                const height = timelineBlockHeight(group.start, group.end)
                const complete = group.doneCount === group.items.length
                const overdue = group.end < editableUntil && !complete
                const overlapsPlan = chronological.some(item => item.start < group.end && item.end > group.start)
                return (
                  <button
                    type="button"
                    key={`routine-plan:${group.key}`}
                    draggable={!complete}
                    onDragStart={event => {
                      if (complete) return
                      const token = routineGroupDragToken(group.key)
                      setDraggedTaskId(token)
                      event.dataTransfer.setData('text/plain', token)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => { setDraggedTaskId(null); setDragPreviewMinute(null) }}
                    onClick={() => toggleRoutineGroup(group.items)}
                    className={clsx('absolute z-[15] overflow-hidden rounded-[9px] border-2 border-dashed px-2 py-1.5 text-left shadow-sm hover:ring-2 hover:ring-black/10', complete && 'opacity-60', overdue && 'ring-1 ring-[var(--amber)]', TIMELINE_CATEGORY_STYLE[group.color])}
                    style={{ top, height, left: overlapsPlan ? 'calc(25% + 2px)' : 2, width: overlapsPlan ? 'calc(25% - 4px)' : 'calc(50% - 4px)' }}
                    title={group.items.map(item => item.name).join(' · ')}
                  >
                    <div className="flex items-center gap-1.5">
                      <Repeat2 size={11} className="shrink-0" />
                      <span className={clsx('min-w-0 flex-1 truncate text-xs font-semibold', complete && 'line-through')}>{group.label}</span>
                      <span className="shrink-0 text-[9px] opacity-70">{group.doneCount}/{group.items.length}{group.minimumCount > 0 ? ` · 최소 ${group.minimumCount}` : ''}</span>
                    </div>
                    {group.end - group.start >= 45 && <p className="mt-0.5 truncate text-[10px] opacity-70">{minutesToTime(group.start)}–{minutesToTime(group.end)} · 반복 루틴</p>}
                  </button>
                )
              })}

              {chronological.map(item => {
                const { task, subtask, token, text, categoryName, categoryColor, start, end, fixed, done } = item
                const top = timelinePosition(start)
                const height = timelineBlockHeight(start, end)
                const overlapsRoutine = routineTimelineGroups.some(group => group.start < end && group.end > start)
                return (
                  <div
                    key={item.key}
                    draggable={!done}
                    onDragStart={event => {
                      if (done) return
                      timelineDropHandledRef.current = false
                      setDraggedTaskId(token)
                      event.dataTransfer.setData('text/plain', token)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => {
                      if (!timelineDropHandledRef.current && !fixed) removePlanPlacement(token)
                      timelineDropHandledRef.current = false
                      setDraggedTaskId(null)
                      setDragPreviewMinute(null)
                    }}
                    onClick={() => { if (!subtask && start < editableUntil) openActualEditor(task, start, end) }}
                    onKeyDown={event => { if (!subtask && start < editableUntil && (event.key === 'Enter' || event.key === ' ')) openActualEditor(task, start, end) }}
                    role={!subtask && start < editableUntil ? 'button' : undefined}
                    tabIndex={!subtask && start < editableUntil ? 0 : undefined}
                    aria-label={!subtask && start < editableUntil ? `${text} 실제 시간 정리` : undefined}
                    className={clsx('absolute z-10 rounded-[9px] border px-2 py-1.5 overflow-hidden shadow-sm', !subtask && start < editableUntil && 'hover:ring-2 hover:ring-black/10 cursor-pointer', !done && 'active:cursor-grabbing', TIMELINE_CATEGORY_STYLE[categoryColor])}
                    style={{ top, height, left: 2, width: overlapsRoutine ? 'calc(25% - 2px)' : 'calc(50% - 4px)' }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={clsx('text-xs font-semibold flex-1 min-w-0 truncate', done && 'line-through')}>{text}</span>
                      <span className="text-[9px] opacity-65 shrink-0">{subtask ? '하위' : fixed ? '일정' : categoryName}</span>
                    </div>
                    {end - start >= 45 && <p className="text-[10px] opacity-70 mt-0.5">{minutesToTime(start)}–{minutesToTime(end)} · {formatDuration(end - start)}{subtask ? ` · ${task.text}` : ''}</p>}
                  </div>
                )
              })}

              {actualBlocks.map(item => {
                const { task, subtask, session, token, text, categoryName, categoryColor, start, end } = item
                const top = timelinePosition(start)
                const height = timelineBlockHeight(start, end)
                const overlapsRoutine = routineActualGroups.some(group => group.start < end && group.end > start)
                return (
                  <button
                    type="button"
                    key={item.key}
                    draggable={!session}
                    onDragStart={event => {
                      if (session) return
                      setDraggedTaskId(token)
                      event.dataTransfer.setData('text/plain', token)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => { setDraggedTaskId(null); setDragPreviewMinute(null) }}
                    onClick={() => { if (!session) openActualEditor(task, start, end, subtask) }}
                    className={clsx('absolute right-0.5 z-20 rounded-[9px] border px-2 py-1.5 overflow-hidden text-left shadow-sm', !session && 'hover:ring-2 hover:ring-black/10 active:cursor-grabbing', TIMELINE_CATEGORY_STYLE[categoryColor])}
                    style={{ top, height, left: 'calc(50% + 2px)', right: overlapsRoutine ? '25%' : 2 }}
                    title={session ? `스톱워치 집중 세션 · ${timelineRangeLabel(start, end)}` : '실제 시간 수정'}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold flex-1 min-w-0 truncate">{text}</span>
                      <span className="text-[9px] opacity-65 shrink-0">{session ? (start >= 24 * 60 ? '전날에서 이어짐' : end >= 24 * 60 ? '다음날까지' : '집중') : subtask ? '하위' : categoryName}</span>
                    </div>
                    {end - start >= 20 && <p className="text-[10px] opacity-70 mt-0.5">{timelineRangeLabel(start, end)} · {formatDuration(end - start)}</p>}
                  </button>
                )
              })}

              {routineActualGroups.map(group => {
                const actualStart = group.start
                const actualEnd = group.end
                const top = timelinePosition(actualStart)
                const height = timelineBlockHeight(actualStart, actualEnd)
                const overlapsActual = actualBlocks.some(item => item.start < actualEnd && item.end > actualStart)
                return (
                  <button
                    type="button"
                    key={`routine-actual:${group.key}`}
                    draggable
                    onDragStart={event => {
                      const token = routineGroupDragToken(group.key)
                      setDraggedTaskId(token)
                      event.dataTransfer.setData('text/plain', token)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => { setDraggedTaskId(null); setDragPreviewMinute(null) }}
                    onClick={() => openRoutineActualEditor(group.items)}
                    className={clsx('absolute z-[21] overflow-hidden rounded-[9px] border px-2 py-1.5 text-left shadow-sm hover:ring-2 hover:ring-black/10', TIMELINE_CATEGORY_STYLE[group.color])}
                    style={{ top, height, left: overlapsActual ? 'calc(75% + 2px)' : 'calc(50% + 2px)', right: 2 }}
                    title="루틴 수행 기록"
                  >
                    <div className="flex items-center gap-1.5">
                      <Repeat2 size={11} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold">{group.label}</span>
                      <span className="shrink-0 text-[9px] opacity-70">{group.doneCount}/{group.items.length}{group.minimumCount > 0 ? ` · 최소 ${group.minimumCount}` : ''}</span>
                    </div>
                    {actualEnd - actualStart >= 45 && <p className="mt-0.5 truncate text-[10px] opacity-70">{minutesToTime(actualStart)}–{minutesToTime(actualEnd)} · 수행</p>}
                  </button>
                )
              })}

              {chronological.length === 0 && actualBlocks.length === 0 && routineTimelineGroups.length === 0 && routineActualGroups.length === 0 && !draggedTaskId && (
                <div className="absolute inset-x-3 top-16 rounded-[12px] border border-dashed border-[var(--border-strong)] py-5 flex flex-col items-center text-center pointer-events-none">
                  <CalendarClock size={20} className="text-[var(--text-3)] mb-1.5" />
                  <span className="text-xs font-medium">할 일을 이 시간축으로 끌어오세요.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-[var(--border)] rounded-[18px] overflow-visible self-start flex flex-col" style={{ height: panelsHeight }}>
          <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <div>
              <h3 className="text-sm font-bold">오늘 할 일</h3>
              <p className="mt-0.5 text-xs text-[var(--text-3)]">카테고리 안에서는 드래그로 순서를 바꾸고, 왼쪽 타임라인에 놓으면 시간을 배치할 수 있습니다.</p>
            </div>
            {onAddRoutine && onUpdateRoutine && onSetRoutineStatus && onDeleteRoutine && (
              <button type="button" onClick={() => setShowRoutineManager(true)} className="flex shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 py-2 text-xs font-semibold text-[var(--text-2)] hover:bg-[var(--surface-2)]"><Settings2 size={13} /> 루틴 관리</button>
            )}
          </div>
          <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-2)]/45">
            <div className={clsx('grid gap-2', compact ? 'grid-cols-[auto_1fr_76px_auto]' : 'grid-cols-[minmax(104px,auto)_1fr_92px_auto]')}>
              <div className="relative">
                <button type="button" onClick={() => setShowCategories(value => !value)} className="h-10 w-full px-3 rounded-[10px] bg-white border border-[var(--border)] text-xs font-semibold flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">{currentCategory ? <CategoryDot color={currentCategory.color} /> : <Tag size={13} />}<span className="truncate">{currentCategory?.name ?? '카테고리'}</span></span>
                  <ChevronDown size={13} />
                </button>
                {showCategories && (
                  <div className="absolute z-30 top-full left-0 mt-1 w-56 bg-white border border-[var(--border)] rounded-[12px] shadow-lg p-2">
                    <div className="max-h-48 overflow-y-auto">
                      {selectableCategories.map(category => (
                        <div
                          key={category.id}
                          draggable={Boolean(onReorderCategory) && editingCategoryId !== category.id}
                          onDragStart={() => setDraggedCategoryId(category.id)}
                          onDragOver={event => { if (draggedCategoryId && draggedCategoryId !== category.id) event.preventDefault() }}
                          onDrop={event => {
                            event.preventDefault()
                            if (draggedCategoryId && draggedCategoryId !== category.id) onReorderCategory?.(draggedCategoryId, category.id)
                            setDraggedCategoryId(null)
                          }}
                          onDragEnd={() => setDraggedCategoryId(null)}
                          className={clsx('group rounded-[8px]', draggedCategoryId === category.id && 'opacity-45')}
                        >
                          {editingCategoryId === category.id ? (
                            <div className="rounded-[9px] bg-[var(--surface-2)] p-2">
                              <input autoFocus value={editingCategoryName} onChange={event => setEditingCategoryName(event.target.value)} onKeyDown={event => event.key === 'Enter' && saveCategoryEdit()} className="w-full rounded-[7px] bg-white px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[var(--purple)]" />
                              <div className="mt-2 flex items-center gap-1">
                                {CATEGORY_COLORS.map(color => <button type="button" key={color} aria-label={color} onClick={() => setEditingCategoryColor(color)} className={clsx(`h-4 w-4 rounded-full cat-${color}`, editingCategoryColor === color && 'ring-2 ring-[var(--purple)] ring-offset-1')} />)}
                                <button type="button" onClick={saveCategoryEdit} className="ml-auto flex h-6 w-6 items-center justify-center rounded-[6px] bg-[var(--purple)] text-white"><Check size={11} /></button>
                                <button type="button" onClick={() => setEditingCategoryId(null)} className="flex h-6 w-6 items-center justify-center rounded-[6px] text-[var(--text-3)] hover:bg-white"><X size={11} /></button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              {onReorderCategory && <span className="flex h-7 w-5 cursor-grab items-center justify-center text-[var(--text-3)] opacity-50"><GripVertical size={12} /></span>}
                              <button type="button" onClick={() => { setCategoryId(category.id); setShowCategories(false) }} className="flex-1 px-1.5 py-2 rounded-[8px] hover:bg-[var(--surface-2)] text-sm text-left flex items-center gap-2">
                                <CategoryDot color={category.color} /> <span className="truncate">{category.name}</span>
                              </button>
                              {onUpdateCategory && <button type="button" aria-label={`${category.name} 수정`} onClick={() => beginCategoryEdit(category)} className="w-7 h-7 rounded-[7px] text-[var(--text-3)] opacity-0 group-hover:opacity-100 hover:text-[var(--purple)] hover:bg-[var(--purple-bg)] flex items-center justify-center"><Pencil size={12} /></button>}
                              {onDeleteCategory && selectableCategories.length > 1 && (
                                <button type="button" aria-label={`${category.name} 삭제`} onClick={() => onDeleteCategory(category.id)} className="w-7 h-7 rounded-[7px] text-[var(--text-3)] opacity-0 group-hover:opacity-100 hover:text-[var(--red)] hover:bg-[var(--red-bg)] flex items-center justify-center"><Trash2 size={12} /></button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {onAddCategory && (
                      <div className="mt-1 pt-2 border-t border-[var(--border)]">
                        {showCategoryForm ? (
                          <div className="flex flex-col gap-2">
                            <input autoFocus value={newCategoryName} onChange={event => setNewCategoryName(event.target.value)} onKeyDown={event => event.key === 'Enter' && addCategory()} placeholder="새 카테고리" className="w-full px-2.5 py-2 rounded-[8px] bg-[var(--surface-2)] text-sm outline-none" />
                            <div className="flex gap-1">
                              {CATEGORY_COLORS.map(color => <button type="button" key={color} aria-label={color} onClick={() => setNewCategoryColor(color)} className={clsx(`h-5 w-5 rounded-full cat-${color}`, newCategoryColor === color && 'ring-2 ring-[var(--purple)] ring-offset-1')} />)}
                            </div>
                            <div className="flex gap-1">
                              <button type="button" onClick={addCategory} className="flex-1 py-1.5 rounded-[7px] bg-[var(--purple)] text-white text-xs font-semibold">추가</button>
                              <button type="button" onClick={() => setShowCategoryForm(false)} className="px-2 py-1.5 rounded-[7px] text-xs text-[var(--text-3)]">취소</button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setShowCategoryForm(true)} className="w-full px-2 py-2 rounded-[8px] text-xs font-semibold text-[var(--purple)] hover:bg-[var(--purple-bg)] flex items-center gap-1"><Plus size={12} /> 카테고리 추가</button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <input value={taskText} onChange={event => setTaskText(event.target.value)} onKeyDown={event => event.key === 'Enter' && addTask()} placeholder="할 일 입력" className="h-10 min-w-0 px-3 rounded-[10px] bg-white border border-[var(--border)] text-sm outline-none focus:border-[var(--purple)]" />
              <label className="h-10 px-2 rounded-[10px] bg-white border border-[var(--border)] flex items-center gap-1">
                <input aria-label="예상 시간(분)" inputMode="numeric" value={durationText} onChange={event => setDurationText(event.target.value.replace(/\D/g, '').slice(0, 4))} onKeyDown={event => event.key === 'Enter' && addTask()} className="w-full min-w-0 text-right text-sm font-semibold outline-none" />
                <span className="text-[11px] text-[var(--text-3)]">분</span>
              </label>
              <button type="button" onClick={addTask} aria-label="할 일 추가" className="h-10 w-10 rounded-[10px] bg-[var(--purple)] text-white flex items-center justify-center"><Plus size={17} /></button>
            </div>
          </div>

          <div className="p-3 min-h-0 flex-1 flex flex-col gap-4 overflow-y-auto scrollbar-thin">
            {flexible.length === 0 && activeRoutines.length === 0 ? (
              <div className="py-10 text-center text-sm text-[var(--text-3)]">오늘 할 일을 추가해보세요.</div>
            ) : (
              <>
                {activeRoutines.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 px-1 mb-2">
                      <Flame size={13} className="text-[var(--amber)]" />
                      <h4 className="text-xs font-bold text-[var(--text-2)]">루틴</h4>
                      <span className="text-[10px] text-[var(--text-3)]">{activeRoutines.length}개</span>
                    </div>
                    {currentRoutineGroup && (
                      <button type="button" onClick={() => toggleRoutineGroup(currentRoutineGroup.items)} className="mb-2 flex w-full items-center gap-2 rounded-[11px] bg-[var(--amber-bg)] px-3 py-2 text-left text-[var(--amber-text)]">
                        <Clock3 size={13} className="shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-xs font-bold">지금 · {currentRoutineGroup.label}</span>
                        <span className="text-[10px]">{currentRoutineGroup.doneCount}/{currentRoutineGroup.items.length}</span>
                      </button>
                    )}
                    <div className="flex flex-col gap-3">
                      {ROUTINE_PERIOD_ORDER.map(period => {
                        const periodRoutines = activeRoutines.filter(routine => (routine.period ?? 'anytime') === period)
                        if (periodRoutines.length === 0) return null
                        return (
                          <div key={period}>
                            <div className="mb-1.5 flex items-center gap-2 px-1">
                              <span className="text-[10px] font-semibold text-[var(--text-3)]">{ROUTINE_PERIOD_LABELS[period]}</span>
                              <div className="h-px flex-1 bg-[var(--border)]" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              {periodRoutines.map(routine => {
                                const log = routineLogs.find(item => item.routine_id === routine.id && item.date === date)
                                const done = Boolean(log?.done)
                                const minimum = done && log?.completion === 'minimum'
                                const config = routineConfig(routine)
                                const timed = isTimedRoutine(routine)
                                return (
                                  <div key={routine.id} className={clsx('flex items-stretch overflow-hidden rounded-[12px] border', done ? 'border-transparent bg-[var(--teal-bg)] opacity-70' : 'border-[var(--border)] bg-white')}>
                                    <button type="button" onClick={() => onToggleRoutine?.(routine.id, date, 'full')} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left">
                                      <span className={clsx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', done ? 'border-[var(--teal)] bg-[var(--teal)] text-white' : `cat-${config.category_color}`)}>{done && (minimum ? <span className="text-[9px] font-black">M</span> : <Check size={11} strokeWidth={3} />)}</span>
                                      <span className="min-w-0 flex-1">
                                        <span className={clsx('block truncate text-sm font-medium', done && !minimum && 'line-through')}>{routine.name}</span>
                                        <span className="block truncate text-[10px] text-[var(--text-3)]">{timed ? '시간형' : '체크형'}{config.cue_label || config.bundle ? ` · ${config.cue_label || config.bundle}` : ''}{timed && config.minimum_version ? ` · 최소 ${config.minimum_version}` : ''}</span>
                                      </span>
                                      <span className="shrink-0 text-right text-[10px] text-[var(--text-3)]"><span className="block tabular-nums">{routine.time ?? (timed ? '유동' : '언제든')}</span><span>{timed ? `${config.duration_min}분` : '체크'}</span></span>
                                    </button>
                                    {done && timed && (
                                      <button type="button" onClick={() => openRoutineActualEditor([routine])} className="border-l border-[var(--teal)] px-2 text-[10px] font-semibold text-[var(--teal-text)] hover:bg-white/60" title="실제 수행 시간 수정">
                                        <Clock3 size={11} className="mx-auto mb-0.5" />
                                        {log?.actual_start_time ?? '시간'}
                                      </button>
                                    )}
                                    {timed && config.minimum_version && <button type="button" onClick={() => onToggleRoutine?.(routine.id, date, 'minimum')} className={clsx('border-l px-2 text-[10px] font-bold', minimum ? 'border-[var(--teal)] text-[var(--teal-text)]' : 'border-[var(--border)] text-[var(--text-3)] hover:bg-[var(--amber-bg)] hover:text-[var(--amber-text)]')} title={`최소 버전: ${config.minimum_version}`}>최소</button>}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

                {taskGroups.map(({ category, tasks }) => (
              <section key={category.id}>
                <div className="flex items-center gap-2 px-1 mb-2">
                  <CategoryDot color={category.color} />
                  <h4 className="text-xs font-bold text-[var(--text-2)]">{category.name}</h4>
                  <span className="text-[10px] text-[var(--text-3)]">{tasks.length}개</span>
                </div>
                <div className="flex flex-col gap-2">
                  {tasks.map(task => {
                    const progressPercent = taskProgressPercent(task)
                    const isPartial = !task.done && !task.discarded && progressPercent > 0
                    const token = taskDragToken(task.id)
                    const subtasks = task.subtasks ?? []
                    const activeSubtasks = subtasks.filter(subtask => !subtask.discarded)
                    const isExpanded = expandedTaskIds.has(task.id)
                    return (
                    <div
                      key={task.id}
                      onDragOver={event => {
                        if (!onReorderTask || !draggedTaskId?.startsWith('task:') || draggedTaskId === token) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={event => {
                        const source = draggedTaskId ?? event.dataTransfer.getData('text/plain')
                        if (!onReorderTask || !source.startsWith('task:') || source === token) return
                        event.preventDefault()
                        onReorderTask(category.id, source.slice(5), task.id)
                        setDraggedTaskId(null)
                      }}
                      className={clsx('rounded-[12px] border px-3 py-2.5 group', task.discarded ? 'border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] opacity-65' : task.done ? 'bg-[var(--surface-2)] border-transparent opacity-60' : isPartial ? 'bg-[var(--amber-bg)]/45 border-amber-200' : 'bg-white border-[var(--border)]', draggedTaskId === token && 'opacity-50 ring-2 ring-[var(--purple)]')}
                    >
                      <div className="flex items-start gap-2.5">
                        <button
                          type="button"
                          aria-label={`${task.text} 타임라인에 배치`}
                          draggable={!task.done && !task.discarded}
                          onDragStart={event => {
                            if (task.done || task.discarded) return
                            setDraggedTaskId(token)
                            event.dataTransfer.setData('text/plain', token)
                            event.dataTransfer.effectAllowed = 'move'
                          }}
                          onDragEnd={() => { setDraggedTaskId(null); setDragPreviewMinute(null) }}
                          className={clsx('mt-0.5 -ml-1 h-6 w-6 touch-none rounded-[6px] text-[var(--text-3)] hover:bg-[var(--surface-2)] flex items-center justify-center shrink-0', !task.done && !task.discarded ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-30')}
                          onPointerDown={event => {
                            if (task.done || task.discarded || !event.isPrimary) return
                            pointerTaskIdRef.current = token
                            setDraggedTaskId(token)
                            event.currentTarget.setPointerCapture(event.pointerId)
                          }}
                          onPointerMove={event => {
                            if (pointerTaskIdRef.current !== token) return
                            event.preventDefault()
                            const drop = timelineDropAtPoint(event.clientX, event.clientY)
                            setDragPreviewMinute(drop?.minute ?? null)
                            if (drop) setDragTargetSide(drop.side)
                          }}
                          onPointerUp={event => finishPointerDrag(event.clientX, event.clientY)}
                          onPointerCancel={() => finishPointerDrag(-1, -1)}
                        >
                          <GripVertical size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={task.discarded ? '폐기된 할 일' : task.done ? '완료 취소' : '완료'}
                          onClick={() => toggleTaskWithActualEditor(task)}
                          disabled={task.discarded}
                          className={clsx('mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0', task.discarded ? 'border-[var(--text-3)] cursor-not-allowed' : task.done ? 'bg-[var(--teal)] border-[var(--teal)] text-white' : isPartial ? 'border-[var(--amber)]' : 'border-[var(--border-strong)]')}
                          style={isPartial ? { background: `conic-gradient(var(--amber) ${progressPercent}%, white ${progressPercent}%)` } : undefined}
                        >
                          {task.discarded ? <Ban size={11} /> : task.done ? <Check size={11} strokeWidth={3} /> : isPartial ? <span className="h-2.5 w-2.5 rounded-full bg-white" /> : null}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={clsx('min-w-0 flex-1 truncate text-sm font-medium', (task.done || task.discarded) && 'line-through')}>{task.text}</p>
                            {task.discarded && <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-[var(--text-3)]">폐기됨 · 실패 아님</span>}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {!task.done && !task.discarded && (
                              <button type="button" onClick={() => openProgressEditor(task)} className={clsx('flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-[11px] font-semibold', isPartial ? 'bg-white text-[var(--amber-text)]' : 'bg-[var(--surface-2)] text-[var(--text-3)] hover:text-[var(--purple)]')}>
                                <Percent size={11} />
                                {isPartial ? `${task.progress_current}/${task.progress_target}${task.progress_unit ?? ''} · ${progressPercent}%` : '부분 완료'}
                              </button>
                            )}
                            <label className="flex items-center gap-1 text-[11px] text-[var(--text-3)]">
                              예상
                              <input key={`${task.id}:${task.duration_min ?? ''}`} inputMode="numeric" defaultValue={getTaskDuration(task)} onBlur={event => { const value = Number.parseInt(event.target.value, 10); if (value > 0 && value !== getTaskDuration(task)) onUpdateTask(task.id, { duration_min: value }) }} className="w-14 px-1.5 py-1 rounded-[6px] bg-[var(--surface-2)] text-right text-xs font-semibold outline-none focus:bg-white focus:ring-1 focus:ring-[var(--purple)]" />분
                            </label>
                            <label className="flex items-center gap-1 text-[11px] text-[var(--text-3)]">
                              타임라인
                              <input disabled={task.discarded} type="time" value={task.start_time ?? task.time ?? ''} onChange={event => onUpdateTask(task.id, { start_time: event.target.value || undefined, time: event.target.value || undefined })} className="px-1.5 py-1 rounded-[6px] bg-[var(--surface-2)] text-xs outline-none focus:bg-white focus:ring-1 focus:ring-[var(--purple)] disabled:opacity-40" />
                            </label>
                            <button type="button" onClick={() => toggleTaskExpanded(task.id)} className="flex items-center gap-1 rounded-[6px] bg-[var(--purple-bg)] px-1.5 py-1 text-[11px] font-semibold text-[var(--purple-text)]">
                              {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />} 하위 할 일 {activeSubtasks.length > 0 ? `${activeSubtasks.filter(item => item.done).length}/${activeSubtasks.length}` : '추가'}
                            </button>
                          </div>
                        </div>
                        <button type="button" onClick={() => openTaskEditor(task)} aria-label={`${task.text} 수정`} className="w-7 h-7 rounded-[7px] opacity-40 group-hover:opacity-100 text-[var(--text-3)] hover:text-[var(--purple)] hover:bg-[var(--purple-bg)] flex items-center justify-center"><Pencil size={13} /></button>
                        <button type="button" onClick={() => discardTask(task)} aria-label={task.discarded ? `${task.text} 폐기 취소` : `${task.text} 폐기`} title={task.discarded ? '폐기 취소' : '필요 없어져서 폐기'} className="w-7 h-7 rounded-[7px] opacity-40 group-hover:opacity-100 text-[var(--text-3)] hover:text-[var(--amber-text)] hover:bg-[var(--amber-bg)] flex items-center justify-center">{task.discarded ? <Undo2 size={13} /> : <Ban size={13} />}</button>
                        <button type="button" onClick={() => onDeleteTask(task.id)} aria-label={`${task.text} 삭제`} className="w-7 h-7 rounded-[7px] opacity-40 group-hover:opacity-100 text-[var(--text-3)] hover:text-[var(--red)] hover:bg-[var(--red-bg)] flex items-center justify-center"><Trash2 size={13} /></button>
                      </div>

                      {isExpanded && (
                        <div className="ml-7 mt-3 border-l-2 border-[var(--border)] pl-3">
                          <div className="flex flex-col gap-1.5">
                            {subtasks.map(subtask => {
                              const subToken = subtaskDragToken(task.id, subtask.id)
                              return (
                                <div key={subtask.id} className={clsx('group/sub flex items-center gap-2 rounded-[9px] px-2 py-1.5', subtask.discarded ? 'bg-[var(--surface-2)] opacity-60' : 'bg-white/70')}>
                                  <button type="button" aria-label={`${subtask.text} 타임라인에 배치`} draggable={!subtask.done && !subtask.discarded} onDragStart={event => { setDraggedTaskId(subToken); event.dataTransfer.setData('text/plain', subToken); event.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => { setDraggedTaskId(null); setDragPreviewMinute(null) }} onPointerDown={event => { if (subtask.done || subtask.discarded || !event.isPrimary) return; pointerTaskIdRef.current = subToken; setDraggedTaskId(subToken); event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (pointerTaskIdRef.current !== subToken) return; event.preventDefault(); const drop = timelineDropAtPoint(event.clientX, event.clientY); setDragPreviewMinute(drop?.minute ?? null); if (drop) setDragTargetSide(drop.side) }} onPointerUp={event => finishPointerDrag(event.clientX, event.clientY)} onPointerCancel={() => finishPointerDrag(-1, -1)} className={clsx('flex h-6 w-6 shrink-0 touch-none items-center justify-center rounded-[6px] text-[var(--text-3)]', !subtask.done && !subtask.discarded ? 'cursor-grab hover:bg-[var(--surface-2)]' : 'cursor-not-allowed opacity-30')}><GripVertical size={13} /></button>
                                  <button type="button" disabled={subtask.discarded} aria-label={subtask.done ? '하위 할 일 완료 취소' : '하위 할 일 완료'} onClick={() => toggleSubtaskWithActualEditor(task, subtask)} className={clsx('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', subtask.done ? 'border-[var(--teal)] bg-[var(--teal)] text-white' : 'border-[var(--border-strong)]', subtask.discarded && 'cursor-not-allowed')} >{subtask.done && <Check size={9} strokeWidth={3} />}</button>
                                  <input key={`${subtask.id}:${subtask.updated_at ?? 0}`} defaultValue={subtask.text} disabled={subtask.discarded} onBlur={event => { const text = event.target.value.trim(); if (text && text !== subtask.text) updateSubtask(task, subtask.id, { text }) }} className={clsx('min-w-0 flex-1 bg-transparent text-xs outline-none focus:border-b focus:border-[var(--purple)]', (subtask.done || subtask.discarded) && 'line-through text-[var(--text-3)]')} />
                                  <label className="flex shrink-0 items-center gap-1 text-[10px] text-[var(--text-3)]"><input inputMode="numeric" disabled={subtask.discarded} key={`${subtask.id}:duration:${subtask.duration_min ?? 30}`} defaultValue={subtask.duration_min ?? 30} onBlur={event => { const value = Number.parseInt(event.target.value, 10); if (value > 0 && value !== subtask.duration_min) updateSubtask(task, subtask.id, { duration_min: value }) }} className="w-10 rounded-[5px] bg-[var(--surface-2)] px-1 py-1 text-right text-[10px] outline-none" />분</label>
                                  {subtask.start_time && <span className="shrink-0 text-[10px] font-mono text-[var(--purple)]">{subtask.start_time}</span>}
                                  <button type="button" onClick={() => updateSubtask(task, subtask.id, subtask.discarded ? { discarded: false } : { discarded: true, done: false, start_time: undefined, end_time: undefined })} aria-label={subtask.discarded ? '하위 할 일 폐기 취소' : '하위 할 일 폐기'} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-3)] hover:bg-[var(--amber-bg)] hover:text-[var(--amber-text)]">{subtask.discarded ? <Undo2 size={11} /> : <Ban size={11} />}</button>
                                  <button type="button" onClick={() => removeSubtask(task, subtask.id)} aria-label="하위 할 일 삭제" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-3)] hover:bg-[var(--red-bg)] hover:text-[var(--red)]"><Trash2 size={11} /></button>
                                </div>
                              )
                            })}
                          </div>
                          {!task.discarded && (
                            <div className="mt-2 flex gap-1.5 pb-1">
                              <input value={subtaskInputs[task.id] ?? ''} onChange={event => setSubtaskInputs(current => ({ ...current, [task.id]: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter') addSubtask(task) }} placeholder="하위 할 일 입력" className="min-w-0 flex-1 rounded-[7px] bg-[var(--surface-2)] px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[var(--purple)]" />
                              <label className="flex w-20 items-center rounded-[7px] bg-[var(--surface-2)] px-2 text-[10px] text-[var(--text-3)]"><input inputMode="numeric" value={subtaskDurations[task.id] ?? '30'} onChange={event => setSubtaskDurations(current => ({ ...current, [task.id]: event.target.value.replace(/\D/g, '').slice(0, 3) }))} className="min-w-0 flex-1 bg-transparent text-right text-xs outline-none" />분</label>
                              <button type="button" onClick={() => addSubtask(task)} aria-label="하위 할 일 추가" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[var(--purple)] text-white"><Plus size={13} /></button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    )
                  })}
                </div>
              </section>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {taskEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setTaskEditor(null)}>
          <div role="dialog" aria-modal="true" aria-label="할 일 수정" className="w-full max-w-md rounded-[20px] bg-white p-5 shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">할 일 수정</h3>
                <p className="mt-1 text-xs text-[var(--text-3)]">내용, 카테고리와 예상시간을 함께 바꿀 수 있습니다.</p>
              </div>
              <button type="button" onClick={() => setTaskEditor(null)} aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--surface-2)]"><X size={17} /></button>
            </div>
            <div className="flex flex-col gap-3">
              <label className="text-xs font-semibold text-[var(--text-2)]">할 일
                <input autoFocus value={taskEditor.text} onChange={event => setTaskEditor(current => current ? { ...current, text: event.target.value } : current)} onKeyDown={event => { if (event.key === 'Enter') saveTaskEdit() }} className="mt-1.5 w-full rounded-[10px] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--purple)]" />
              </label>
              <div className="grid grid-cols-[1fr_110px] gap-2">
                <label className="text-xs font-semibold text-[var(--text-2)]">카테고리
                  <select value={taskEditor.categoryId} onChange={event => setTaskEditor(current => current ? { ...current, categoryId: event.target.value } : current)} className="mt-1.5 w-full rounded-[10px] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--purple)]">
                    {taskEditorCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-[var(--text-2)]">예상시간
                  <span className="mt-1.5 flex items-center rounded-[10px] bg-[var(--surface-2)] px-3"><input inputMode="numeric" value={taskEditor.duration} onChange={event => setTaskEditor(current => current ? { ...current, duration: event.target.value.replace(/\D/g, '').slice(0, 3) } : current)} className="min-w-0 flex-1 bg-transparent py-2.5 text-right text-sm outline-none" /><span className="ml-1 text-xs text-[var(--text-3)]">분</span></span>
                </label>
              </div>
              {taskEditorError && <p className="rounded-[9px] bg-[var(--red-bg)] px-3 py-2 text-xs font-medium text-[var(--red)]">{taskEditorError}</p>}
              <button type="button" onClick={saveTaskEdit} className="mt-1 rounded-[10px] bg-[var(--purple)] px-4 py-2.5 text-sm font-bold text-white">수정 저장</button>
            </div>
          </div>
        </div>
      )}

      {routineActualEditor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={() => setRoutineActualEditor(null)}>
          <div role="dialog" aria-modal="true" aria-label="루틴 실제 시간 수정" className="w-full max-w-md rounded-[20px] bg-white p-5 shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">루틴 실제 시간</h3>
                <p className="mt-1 text-xs text-[var(--text-3)]">예정 시간과 무관하게 실제 수행한 구간을 기록합니다.</p>
              </div>
              <button type="button" aria-label="닫기" onClick={() => setRoutineActualEditor(null)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--surface-2)]"><X size={17} /></button>
            </div>
            <div className="mb-4 rounded-[11px] bg-[var(--amber-bg)] px-3 py-2.5 text-sm font-semibold text-[var(--amber-text)]">{routineActualEditor.text}</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-[var(--text-2)]">시작
                <input type="time" step="900" value={routineActualEditor.start} onChange={event => setRoutineActualEditor(value => value ? { ...value, start: event.target.value } : value)} className="mt-1.5 w-full rounded-[10px] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--purple)]" />
              </label>
              <label className="text-xs font-semibold text-[var(--text-2)]">종료
                <input type="time" step="900" value={routineActualEditor.end} onChange={event => setRoutineActualEditor(value => value ? { ...value, end: event.target.value } : value)} className="mt-1.5 w-full rounded-[10px] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--purple)]" />
              </label>
            </div>
            {actualError && <p className="mt-3 text-xs text-[var(--red)]">{actualError}</p>}
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={saveRoutineActualRecord} className="rounded-[9px] bg-[var(--purple)] px-4 py-2 text-xs font-semibold text-white">실제 시간 저장</button>
            </div>
          </div>
        </div>
      )}

      {actualEditor && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setActualEditor(null)}>
          <div className="w-full max-w-md bg-white rounded-[20px] shadow-xl p-5" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-bold">{actualEditor.taskId ? '실제 시간 정리' : '지난 시간 기록'}</h3>
                <p className="text-xs text-[var(--text-3)] mt-1">{isToday ? `현재 시각 ${minutesToTime(editableUntil)} 이전만 기록할 수 있습니다.` : '지난 날은 05:00~다음 날 05:00을 정리할 수 있습니다.'}</p>
              </div>
              <button type="button" onClick={() => setActualEditor(null)} className="w-8 h-8 rounded-full hover:bg-[var(--surface-2)] flex items-center justify-center"><X size={17} /></button>
            </div>

            {actualEditor.taskId ? (
              <div className="rounded-[11px] bg-[var(--purple-bg)] px-3 py-2.5 mb-4">
                <p className="text-sm font-semibold">{actualEditor.text}</p>
                <p className="text-[10px] text-[var(--purple-text)] mt-1">계획 블록과 달라도 괜찮습니다.</p>
              </div>
            ) : (
              <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2 mb-4">
                <input autoFocus value={actualEditor.text} onChange={event => setActualEditor(value => value ? { ...value, text: event.target.value } : value)} placeholder="실제로 한 일" className="min-w-0 px-3 py-2.5 rounded-[10px] bg-[var(--surface-2)] text-sm outline-none focus:ring-1 focus:ring-[var(--purple)]" />
                <select value={actualEditor.categoryId} onChange={event => setActualEditor(value => value ? { ...value, categoryId: event.target.value } : value)} className="px-2 py-2.5 rounded-[10px] bg-[var(--surface-2)] text-xs outline-none">
                  {selectableCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-[var(--text-2)]">시작
                <input type="time" step="900" value={actualEditor.start} onChange={event => setActualEditor(value => value ? { ...value, start: event.target.value } : value)} className="w-full mt-1.5 px-3 py-2.5 rounded-[10px] bg-[var(--surface-2)] text-sm outline-none focus:ring-1 focus:ring-[var(--purple)]" />
              </label>
              <label className="text-xs font-semibold text-[var(--text-2)]">종료
                <input type="time" step="900" value={actualEditor.end} onChange={event => setActualEditor(value => value ? { ...value, end: event.target.value } : value)} className="w-full mt-1.5 px-3 py-2.5 rounded-[10px] bg-[var(--surface-2)] text-sm outline-none focus:ring-1 focus:ring-[var(--purple)]" />
              </label>
            </div>

            {actualError && <p className="text-xs text-[var(--red)] mt-3">{actualError}</p>}

            <div className="flex flex-wrap gap-2 mt-5">
              {actualEditor.taskId && !isActualOnlyTask(entry.tasks.find(task => task.id === actualEditor.taskId)) && <button type="button" onClick={markActualSkipped} className="px-3 py-2 rounded-[9px] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-2)]">미수행</button>}
              {actualEditor.taskId && (() => {
                const task = entry.tasks.find(item => item.id === actualEditor.taskId)
                const recorded = actualEditor.subtaskId
                  ? task?.subtasks?.find(item => item.id === actualEditor.subtaskId)?.actual_status === 'recorded'
                  : task?.actual_status === 'recorded'
                return recorded ? <button type="button" onClick={clearActualRecord} className="px-3 py-2 rounded-[9px] text-xs font-semibold text-[var(--red)] hover:bg-[var(--red-bg)]">실제 기록 삭제</button> : null
              })()}
              <button type="button" onClick={saveActualRecord} className="ml-auto px-4 py-2 rounded-[9px] bg-[var(--purple)] text-white text-xs font-semibold">{actualEditor.taskId ? '실제 시간 저장' : '기록 추가'}</button>
            </div>
          </div>
        </div>
      )}

      {progressEditor && (() => {
        const task = entry.tasks.find(item => item.id === progressEditor.taskId)
        const current = Number(progressEditor.current)
        const target = Number(progressEditor.target)
        const previewPercent = Number.isFinite(current) && Number.isFinite(target) && target > 0
          ? Math.max(0, Math.min(100, Math.round((current / target) * 100)))
          : 0
        return (
          <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4" onClick={() => setProgressEditor(null)}>
            <div role="dialog" aria-modal="true" aria-label="부분 완료 기록" className="w-full max-w-md bg-white rounded-[20px] shadow-xl p-5" onClick={event => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-lg font-bold">부분 완료 기록</h3>
                  <p className="text-xs text-[var(--text-3)] mt-1">완료하지 못했어도 실제로 진행한 만큼은 달성률에 반영됩니다.</p>
                </div>
                <button type="button" aria-label="닫기" onClick={() => setProgressEditor(null)} className="w-8 h-8 rounded-full hover:bg-[var(--surface-2)] flex items-center justify-center"><X size={17} /></button>
              </div>

              <div className="rounded-[11px] bg-[var(--amber-bg)] px-3 py-2.5 mb-4">
                <p className="text-sm font-semibold">{task?.text}</p>
                <p className="text-[11px] text-[var(--amber-text)] mt-1">현재 {previewPercent}% 진행</p>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                {[25, 50, 75].map(percent => (
                  <button type="button" key={percent} onClick={() => setQuickProgress(percent)} className={clsx('py-2 rounded-[9px] text-xs font-semibold border', progressEditor.unit === '%' && progressEditor.current === String(percent) && progressEditor.target === '100' ? 'bg-[var(--amber-bg)] border-[var(--amber)] text-[var(--amber-text)]' : 'border-[var(--border)] hover:bg-[var(--surface-2)]')}>
                    {percent}%
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-[1fr_1fr_88px] gap-2">
                <label className="text-xs font-semibold text-[var(--text-2)]">실제량
                  <input autoFocus type="number" min="0" step="any" value={progressEditor.current} onChange={event => setProgressEditor(value => value ? { ...value, current: event.target.value } : value)} placeholder="6" className="w-full mt-1.5 px-3 py-2.5 rounded-[10px] bg-[var(--surface-2)] text-sm outline-none focus:ring-1 focus:ring-[var(--amber)]" />
                </label>
                <label className="text-xs font-semibold text-[var(--text-2)]">목표량
                  <input type="number" min="0" step="any" value={progressEditor.target} onChange={event => setProgressEditor(value => value ? { ...value, target: event.target.value } : value)} placeholder="7" className="w-full mt-1.5 px-3 py-2.5 rounded-[10px] bg-[var(--surface-2)] text-sm outline-none focus:ring-1 focus:ring-[var(--amber)]" />
                </label>
                <label className="text-xs font-semibold text-[var(--text-2)]">단위
                  <input value={progressEditor.unit} onChange={event => setProgressEditor(value => value ? { ...value, unit: event.target.value.slice(0, 8) } : value)} placeholder="km" className="w-full mt-1.5 px-3 py-2.5 rounded-[10px] bg-[var(--surface-2)] text-sm outline-none focus:ring-1 focus:ring-[var(--amber)]" />
                </label>
              </div>

              {onCarryTask && previewPercent > 0 && previewPercent < 100 && (
                <label className="mt-4 flex items-start gap-2.5 rounded-[11px] border border-[var(--border)] p-3 cursor-pointer">
                  <input type="checkbox" checked={progressEditor.carryOver} onChange={event => setProgressEditor(value => value ? { ...value, carryOver: event.target.checked } : value)} className="mt-0.5 accent-[var(--purple)]" />
                  <span><span className="block text-sm font-semibold">남은 양을 내일로 이월</span><span className="block text-[11px] text-[var(--text-3)] mt-0.5">남은 분량과 예상 시간을 계산해 내일 할 일로 추가합니다.</span></span>
                </label>
              )}

              {progressError && <p className="text-xs text-[var(--red)] mt-3">{progressError}</p>}

              <div className="flex gap-2 mt-5">
                {task?.progress_target && (
                  <button type="button" onClick={() => { onUpdateTask(task.id, { done: false, progress_current: undefined, progress_target: undefined, progress_unit: undefined }); setProgressEditor(null) }} className="px-3 py-2.5 rounded-[9px] text-xs font-semibold text-[var(--red)] hover:bg-[var(--red-bg)]">기록 삭제</button>
                )}
                <button type="button" onClick={savePartialProgress} className="ml-auto px-4 py-2.5 rounded-[9px] bg-[var(--amber)] text-white text-xs font-semibold">{previewPercent >= 100 ? '완료로 저장' : '부분 완료 저장'}</button>
              </div>
            </div>
          </div>
        )
      })()}

      {showWellness && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowWellness(false)}>
          <div className="w-full max-w-md bg-white rounded-[20px] shadow-xl p-5" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div><h3 className="text-lg font-bold">수면·컨디션 기록</h3><p className="text-xs text-[var(--text-3)] mt-1">오늘의 계획을 세우기 전에 몸 상태를 기록하세요.</p></div>
              <button type="button" onClick={() => setShowWellness(false)} className="w-8 h-8 rounded-full hover:bg-[var(--surface-2)] flex items-center justify-center"><X size={17} /></button>
            </div>
            <div className="mb-5">
              <label className="text-xs font-semibold text-[var(--text-2)] block mb-2">수면시간</label>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="24" value={entry.meta.sleep == null ? '' : Math.floor(entry.meta.sleep / 60)} onChange={event => { const hours = Math.max(0, Number(event.target.value) || 0); const minutes = (entry.meta.sleep ?? 0) % 60; onMetaChange({ sleep: hours * 60 + minutes }) }} placeholder="7" className="w-20 px-3 py-2.5 rounded-[10px] bg-[var(--surface-2)] outline-none text-center font-semibold" /><span className="text-sm text-[var(--text-3)]">시간</span>
                <input type="number" min="0" max="59" step="5" value={entry.meta.sleep == null ? '' : entry.meta.sleep % 60} onChange={event => { const minutes = Math.min(59, Math.max(0, Number(event.target.value) || 0)); const hours = Math.floor((entry.meta.sleep ?? 0) / 60); onMetaChange({ sleep: hours * 60 + minutes }) }} placeholder="30" className="w-20 px-3 py-2.5 rounded-[10px] bg-[var(--surface-2)] outline-none text-center font-semibold" /><span className="text-sm text-[var(--text-3)]">분</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-2)] block mb-2">컨디션</label>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map(level => <button type="button" key={level} onClick={() => onMetaChange({ condition: level })} className={clsx('py-3 rounded-[11px] border flex flex-col items-center gap-1 transition-all', entry.meta.condition === level ? 'border-[var(--purple)] bg-[var(--purple-bg)] ring-1 ring-[var(--purple)]' : 'border-[var(--border)] hover:bg-[var(--surface-2)]')}><span className="text-xl">{CONDITION_EMOJI[level]}</span><span className="text-[10px] text-[var(--text-3)]">{level}</span></button>)}
              </div>
            </div>
            <button type="button" onClick={() => setShowWellness(false)} className="w-full mt-5 py-2.5 rounded-[10px] bg-[var(--purple)] text-white text-sm font-semibold">완료</button>
          </div>
        </div>
      )}

      {showRoutineManager && onAddRoutine && onUpdateRoutine && onSetRoutineStatus && onDeleteRoutine && (
        <RoutineManagerDialog
          routines={routines}
          onClose={() => setShowRoutineManager(false)}
          onAddRoutine={onAddRoutine}
          onUpdateRoutine={onUpdateRoutine}
          onSetStatus={onSetRoutineStatus}
          onDeleteRoutine={onDeleteRoutine}
        />
      )}
    </section>
  )
}
