'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
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
  Plus,
  Target,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { addDays, format, parseISO, subDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import clsx from 'clsx'
import type { BadgeColor, Category, DayEntry, DayMeta, LongGoal, Routine, RoutineLog, ShortGoal, Task, TaskScheduleInput } from '@/types'
import { DEADLINE_CAT_ID, SCHEDULE_CAT_ID } from '@/types'
import { formatDate, formatSleepMin } from '@/lib/dates'
import {
  DEFAULT_DAY_END,
  DEFAULT_DAY_START,
  formatDuration,
  getTaskDuration,
  getTaskEnd,
  getTaskStart,
  isFixedTask,
  minutesToTime,
  remainingCapacity,
  timeToMinutes,
} from '@/lib/plannerTime'

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
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
  onToggleTask: (taskId: string) => void
  onMetaChange: (patch: Partial<DayMeta>) => void
  onAddCategory?: (category: Omit<Category, 'id'>) => void
  onDeleteCategory?: (categoryId: string) => void
  onToggleRoutine?: (routineId: string, date: string) => void
  compact?: boolean
}

interface ActualEditorState {
  taskId?: string
  text: string
  start: string
  end: string
  categoryId: string
}

const CATEGORY_COLORS: BadgeColor[] = ['purple', 'teal', 'amber', 'coral', 'blue']
const CONDITION_LABELS: Record<number, string> = {
  1: '매우 나쁨',
  2: '나쁨',
  3: '보통',
  4: '좋음',
  5: '매우 좋음',
}
const CONDITION_EMOJI: Record<number, string> = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' }
const TIMELINE_START = 5 * 60
const TIMELINE_END = 25 * 60
const TIMELINE_HOUR_HEIGHT = 48
const TIMELINE_HEIGHT = ((TIMELINE_END - TIMELINE_START) / 60) * TIMELINE_HOUR_HEIGHT
const TIMELINE_HOURS = Array.from({ length: 21 }, (_, index) => TIMELINE_START + index * 60)

function nowAsMinutes() {
  const date = new Date()
  return date.getHours() * 60 + date.getMinutes()
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
  onUpdateTask,
  onDeleteTask,
  onToggleTask,
  onMetaChange,
  onAddCategory,
  onDeleteCategory,
  onToggleRoutine,
  compact = false,
}: Props) {
  const [nowMinute, setNowMinute] = useState(nowAsMinutes)
  const [editingTop3, setEditingTop3] = useState(false)
  const [showWellness, setShowWellness] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState<BadgeColor>('purple')
  const [taskText, setTaskText] = useState('')
  const [durationText, setDurationText] = useState('60')
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragPreviewMinute, setDragPreviewMinute] = useState<number | null>(null)
  const [actualEditor, setActualEditor] = useState<ActualEditorState | null>(null)
  const [actualError, setActualError] = useState('')
  const timelineRef = useRef<HTMLDivElement>(null)
  const pointerTaskIdRef = useRef<string | null>(null)
  const selectableCategories = useMemo(() => categories.filter(category => category.id !== SCHEDULE_CAT_ID && category.id !== DEADLINE_CAT_ID), [categories])
  const [categoryId, setCategoryId] = useState(selectableCategories[0]?.id ?? '')

  const dateObject = parseISO(date)
  const todayKey = formatDate(new Date())
  const isToday = date === todayKey
  const isPastDate = date < todayKey
  const dayStart = DEFAULT_DAY_START
  const dayEnd = DEFAULT_DAY_END

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

  const capacity = useMemo(
    () => remainingCapacity(entry.tasks, dayStart, dayEnd, isToday ? nowMinute : undefined),
    [entry.tasks, dayStart, dayEnd, isToday, nowMinute],
  )

  const editableUntil = isPastDate
    ? TIMELINE_END
    : isToday
      ? Math.max(TIMELINE_START, Math.min(TIMELINE_END, nowMinute))
      : TIMELINE_START
  const canEditActual = editableUntil > TIMELINE_START

  // Timeline visibility is intentionally independent from remaining capacity.
  // Past fixed events must stay visible instead of disappearing as the clock advances.
  const chronological = useMemo(() => entry.tasks
    .filter(task => isFixedTask(task) || getTaskStart(task) !== null)
    .map(task => {
      const rawStart = getTaskStart(task)
      if (rawStart === null) return null
      const start = rawStart < TIMELINE_START ? rawStart + 24 * 60 : rawStart
      const rawEnd = getTaskEnd(task) ?? rawStart + getTaskDuration(task)
      const normalizedEnd = rawEnd < TIMELINE_START ? rawEnd + 24 * 60 : rawEnd
      const end = normalizedEnd > start ? normalizedEnd : start + getTaskDuration(task)
      return { task, start, end, fixed: isFixedTask(task) }
    })
    .filter((item): item is { task: Task; start: number; end: number; fixed: boolean } => item !== null && item.end > TIMELINE_START && item.start < TIMELINE_END)
    .map(item => ({ ...item, start: Math.max(TIMELINE_START, item.start), end: Math.min(TIMELINE_END, item.end) }))
    .sort((a, b) => a.start - b.start || Number(b.fixed) - Number(a.fixed)), [entry.tasks])

  const actualBlocks = useMemo(() => entry.tasks
    .filter(task => task.actual_status === 'recorded' && task.actual_start_time && task.actual_end_time)
    .map(task => {
      const rawStart = timeToMinutes(task.actual_start_time)
      const rawEnd = timeToMinutes(task.actual_end_time)
      if (rawStart === null || rawEnd === null) return null
      const start = rawStart < TIMELINE_START ? rawStart + 24 * 60 : rawStart
      let end = rawEnd < TIMELINE_START ? rawEnd + 24 * 60 : rawEnd
      if (end <= start) end += 24 * 60
      return { task, start: Math.max(TIMELINE_START, start), end: Math.min(TIMELINE_END, end) }
    })
    .filter((item): item is { task: Task; start: number; end: number } => item !== null && item.end > item.start)
    .sort((a, b) => a.start - b.start), [entry.tasks])

  const flexible = useMemo(() => entry.tasks
    .filter(task => !isFixedTask(task) && task.category_id !== DEADLINE_CAT_ID)
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.updated_at ?? 0) - (b.updated_at ?? 0)), [entry.tasks])

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
  const filledTop3 = (entry.meta.top3 ?? []).filter(item => item.trim())
  const activeRoutines = useMemo(() => routines
    .filter(routine => routine.status === 'active')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [routines])
  const focusGoals = useMemo(() => goals
    .filter(goal => goal.date_from <= date && goal.date_to >= date)
    .sort((a, b) => a.date_to.localeCompare(b.date_to))
    .slice(0, 3), [date, goals])
  const longGoalNames = useMemo(() => new Map(longGoals.map(goal => [goal.id, goal.title])), [longGoals])

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

  function setTop3(index: number, value: string) {
    const next = [...(entry.meta.top3 ?? [])]
    while (next.length <= index) next.push('')
    next[index] = value
    onMetaChange({ top3: next })
  }

  function timelineMinuteFromPointer(clientY: number, element: HTMLDivElement) {
    const rect = element.getBoundingClientRect()
    const position = Math.max(0, Math.min(rect.height, clientY - rect.top))
    const rawMinute = TIMELINE_START + (position / rect.height) * (TIMELINE_END - TIMELINE_START)
    return Math.max(TIMELINE_START, Math.min(TIMELINE_END - 15, Math.round(rawMinute / 15) * 15))
  }

  function placeTask(taskId: string, minute: number) {
    const time = minutesToTime(minute)
    onUpdateTask(taskId, { start_time: time, time })
    setDraggedTaskId(null)
    setDragPreviewMinute(null)
  }

  function timelineMinuteAtPoint(clientX: number, clientY: number) {
    const element = timelineRef.current
    if (!element) return null
    const rect = element.getBoundingClientRect()
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null
    return timelineMinuteFromPointer(clientY, element)
  }

  function finishPointerDrag(clientX: number, clientY: number) {
    const taskId = pointerTaskIdRef.current
    const minute = timelineMinuteAtPoint(clientX, clientY)
    pointerTaskIdRef.current = null
    if (taskId && minute !== null) placeTask(taskId, minute)
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

  function openActualEditor(task?: Task, plannedStart?: number, plannedEnd?: number) {
    if (!canEditActual) return
    const existingStart = task?.actual_start_time
    const existingEnd = task?.actual_end_time
    const rawEndMinute = Math.min(editableUntil, plannedEnd ?? editableUntil)
    const endMinute = Math.max(TIMELINE_START + 15, Math.floor(rawEndMinute / 15) * 15)
    const startMinute = Math.max(TIMELINE_START, Math.min(endMinute - 15, plannedStart ?? endMinute - 60))
    if (task && !existingStart && startMinute >= editableUntil) return
    setActualError('')
    setActualEditor({
      taskId: task?.id,
      text: task?.text ?? '',
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
      onUpdateTask(actualEditor.taskId, {
        actual_start_time: actualEditor.start,
        actual_end_time: actualEditor.end,
        actual_status: 'recorded',
        done: true,
      })
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
        done: true,
      })
    }
    setActualEditor(null)
    setActualError('')
  }

  function markActualSkipped() {
    if (!actualEditor?.taskId) return
    onUpdateTask(actualEditor.taskId, {
      actual_start_time: undefined,
      actual_end_time: undefined,
      actual_status: 'skipped',
      done: false,
    })
    setActualEditor(null)
  }

  function clearActualRecord() {
    if (!actualEditor?.taskId) return
    onUpdateTask(actualEditor.taskId, {
      actual_start_time: undefined,
      actual_end_time: undefined,
      actual_status: undefined,
    })
    setActualEditor(null)
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
          <p className="text-sm text-[var(--text-3)] mt-1">남은 시간을 먼저 보고, 할 수 있는 만큼만 계획하세요.</p>
        </div>
        {onDateChange && (
          <button type="button" aria-label="다음 날짜" onClick={() => onDateChange(formatDate(addDays(dateObject, 1)))} className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-white">
            <ChevronRight size={18} />
          </button>
        )}
      </div>

      <div className={clsx('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-4')}>
        <div className="rounded-[16px] bg-[var(--purple)] text-white p-4">
          <div className="flex items-center gap-2 text-xs text-white/70"><Clock3 size={14} /> 남은 가용시간</div>
          <p className="text-2xl font-bold mt-2">{formatDuration(capacity.availableMinutes)}</p>
          <p className="text-[11px] text-white/65 mt-1">현재부터 활동 종료까지</p>
        </div>

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

        <div className={clsx('rounded-[16px] border p-4', capacity.overloadMinutes > 0 ? 'bg-[var(--red-bg)] border-[var(--red)]' : 'bg-[var(--teal-bg)] border-[var(--teal)]')}>
          <div className={clsx('flex items-center gap-2 text-xs', capacity.overloadMinutes > 0 ? 'text-[var(--red-text)]' : 'text-[var(--teal-text)]')}>
            {capacity.overloadMinutes > 0 ? <AlertTriangle size={14} /> : <Check size={14} />}
            {capacity.overloadMinutes > 0 ? '과부하' : '현실적인 계획'}
          </div>
          <p className="text-2xl font-bold mt-2">{capacity.overloadMinutes > 0 ? `+${formatDuration(capacity.overloadMinutes)}` : '여유 있음'}</p>
          <p className="text-[11px] opacity-70 mt-1">가용시간 대비 예상 작업량</p>
        </div>
      </div>

      {focusGoals.length > 0 && (
        <div className="bg-white border border-[var(--border)] rounded-[18px] p-4 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <Target size={15} className="text-[var(--teal)]" />
            <div>
              <h3 className="text-sm font-bold">집중 단기목표</h3>
              <p className="text-xs text-[var(--text-3)] mt-0.5">현재 진행 중인 단기목표를 최대 3개만 계속 보여줍니다.</p>
            </div>
          </div>
          <div className={clsx('grid gap-2', compact ? 'grid-cols-1' : 'md:grid-cols-3')}>
            {focusGoals.map(goal => {
              const total = goal.tasks.length
              const done = goal.tasks.filter(task => task.done).length
              const pct = total > 0 ? Math.round((done / total) * 100) : 0
              return (
                <div key={goal.id} className="rounded-[12px] border border-[var(--border)] bg-[var(--teal-bg)]/45 px-3 py-2.5">
                  <p className="text-sm font-semibold leading-snug">{goal.title}</p>
                  {goal.long_goal_id && longGoalNames.get(goal.long_goal_id) && <p className="text-[10px] text-[var(--teal-text)] mt-1">{longGoalNames.get(goal.long_goal_id)}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="h-1.5 flex-1 rounded-full bg-white overflow-hidden"><div className="h-full bg-[var(--teal)] rounded-full" style={{ width: `${pct}%` }} /></div>
                    <span className="text-[10px] font-semibold text-[var(--teal-text)]">{total > 0 ? `${done}/${total}` : '다음 행동 필요'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="bg-white border border-[var(--border)] rounded-[18px] p-4 mt-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold">오늘의 핵심 3가지</h3>
            <p className="text-xs text-[var(--text-3)] mt-0.5">이 세 가지가 끝나면 오늘은 성공입니다.</p>
          </div>
          <button type="button" onClick={() => setEditingTop3(value => !value)} className="px-2.5 py-1.5 rounded-[8px] text-xs font-semibold text-[var(--purple)] hover:bg-[var(--purple-bg)] flex items-center gap-1">
            {editingTop3 ? <><Check size={13} /> 완료</> : <><Pencil size={13} /> 편집</>}
          </button>
        </div>
        {editingTop3 ? (
          <div className={clsx('grid gap-2', compact ? 'grid-cols-1' : 'md:grid-cols-3')}>
            {[0, 1, 2].map(index => (
              <label key={index} className="flex items-center gap-2 rounded-[12px] bg-[var(--surface-2)] px-3 py-2.5 border border-transparent focus-within:border-[var(--purple)] focus-within:bg-white">
                <span className="h-6 w-6 rounded-full bg-[var(--purple)] text-white text-xs font-bold flex items-center justify-center shrink-0">{index + 1}</span>
                <input value={(entry.meta.top3 ?? [])[index] ?? ''} onChange={event => setTop3(index, event.target.value)} placeholder="핵심 작업 입력" className="w-full min-w-0 bg-transparent outline-none text-sm" />
              </label>
            ))}
          </div>
        ) : filledTop3.length > 0 ? (
          <div className={clsx('grid gap-2', compact ? 'grid-cols-1' : 'md:grid-cols-3')}>
            {[0, 1, 2].map(index => {
              const value = (entry.meta.top3 ?? [])[index]?.trim()
              return (
                <div key={index} className={clsx('rounded-[13px] px-3.5 py-3 min-h-16 flex items-center gap-3', value ? 'bg-gradient-to-br from-[var(--purple-bg)] to-white border border-purple-100' : 'bg-[var(--surface-2)] border border-dashed border-[var(--border)]')}>
                  <span className={clsx('h-7 w-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0', value ? 'bg-[var(--purple)] text-white' : 'bg-white text-[var(--text-3)]')}>{index + 1}</span>
                  <p className={clsx('text-sm font-semibold leading-snug', !value && 'text-[var(--text-3)] font-normal')}>{value || '비어 있음'}</p>
                </div>
              )
            })}
          </div>
        ) : (
          <button type="button" onClick={() => setEditingTop3(true)} className="w-full py-6 rounded-[13px] border border-dashed border-[var(--border-strong)] text-sm text-[var(--text-3)] hover:bg-[var(--surface-2)]">오늘 반드시 끝낼 세 가지를 정해보세요.</button>
        )}
      </div>

      <div className={clsx('grid gap-4 mt-4', compact ? 'grid-cols-1' : 'xl:grid-cols-[1.15fr_1fr]')}>
        <div className="bg-white border border-[var(--border)] rounded-[18px] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold">계획과 실제 타임라인</h3>
              <p className="text-xs text-[var(--text-3)] mt-0.5">였은 블록은 계획, 진한 블록은 실제입니다. 현재선 이전은 언제든 정리할 수 있어요.</p>
              <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--text-3)]">
                <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-[var(--purple)] opacity-50" /> 계획</span>
                <span className="flex items-center gap-1"><span className="w-4 border-t-[3px] border-[var(--purple)]" /> 실제</span>
              </div>
            </div>
            <button type="button" disabled={!canEditActual} onClick={() => openActualEditor()} className="shrink-0 px-3 py-2 rounded-[9px] bg-[var(--purple)] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-35 disabled:cursor-not-allowed">
              <History size={13} /> 지난 시간 기록
            </button>
          </div>
          <div className="max-h-[680px] overflow-y-auto scrollbar-thin">
            <div
              ref={timelineRef}
              className={clsx('relative ml-14 mr-3 transition-colors', draggedTaskId && 'bg-[var(--purple-bg)]/20')}
              style={{ height: TIMELINE_HEIGHT }}
              onDragOver={event => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDragPreviewMinute(timelineMinuteFromPointer(event.clientY, event.currentTarget))
              }}
              onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragPreviewMinute(null)
              }}
              onDrop={event => {
                event.preventDefault()
                const taskId = draggedTaskId ?? event.dataTransfer.getData('text/plain')
                if (taskId) placeTask(taskId, timelineMinuteFromPointer(event.clientY, event.currentTarget))
              }}
            >
              {TIMELINE_HOURS.map(minute => {
                const top = ((minute - TIMELINE_START) / (TIMELINE_END - TIMELINE_START)) * TIMELINE_HEIGHT
                return (
                  <div key={minute} className="absolute left-0 right-0 border-t border-[var(--border)]" style={{ top }}>
                    <span className="absolute right-full -translate-y-1/2 pr-2 text-[10px] font-medium text-[var(--text-3)] tabular-nums">{minutesToTime(minute)}</span>
                  </div>
                )
              })}

              {isToday && (() => {
                const normalizedNow = nowMinute < TIMELINE_START ? nowMinute + 24 * 60 : nowMinute
                if (normalizedNow < TIMELINE_START || normalizedNow > TIMELINE_END) return null
                const top = ((normalizedNow - TIMELINE_START) / (TIMELINE_END - TIMELINE_START)) * TIMELINE_HEIGHT
                return <div className="absolute left-0 right-0 z-30 border-t border-[var(--red)]" style={{ top }}><span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-[var(--red)]" /><span className="absolute right-1 -top-4 text-[9px] font-semibold text-[var(--red)]">현재</span></div>
              })()}

              {dragPreviewMinute !== null && (
                <div className="absolute left-0 right-0 z-30 border-t-2 border-dashed border-[var(--purple)] pointer-events-none" style={{ top: ((dragPreviewMinute - TIMELINE_START) / (TIMELINE_END - TIMELINE_START)) * TIMELINE_HEIGHT }}>
                  <span className="absolute left-2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-[var(--purple)] text-white text-[10px] font-bold">{minutesToTime(dragPreviewMinute)}</span>
                </div>
              )}

              {chronological.map(({ task, start, end, fixed }) => {
                const top = ((start - TIMELINE_START) / (TIMELINE_END - TIMELINE_START)) * TIMELINE_HEIGHT
                const height = Math.max(30, ((end - start) / (TIMELINE_END - TIMELINE_START)) * TIMELINE_HEIGHT)
                return (
                  <div
                    key={task.id}
                    draggable={!fixed && !task.done}
                    onDragStart={event => {
                      if (fixed || task.done) return
                      setDraggedTaskId(task.id)
                      event.dataTransfer.setData('text/plain', task.id)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => { setDraggedTaskId(null); setDragPreviewMinute(null) }}
                    onClick={() => { if (start < editableUntil) openActualEditor(task, start, end) }}
                    onKeyDown={event => { if (start < editableUntil && (event.key === 'Enter' || event.key === ' ')) openActualEditor(task, start, end) }}
                    role={start < editableUntil ? 'button' : undefined}
                    tabIndex={start < editableUntil ? 0 : undefined}
                    aria-label={start < editableUntil ? `${task.text} 실제 시간 정리` : undefined}
                    className={clsx('absolute left-1 right-1 z-10 rounded-[9px] border-2 border-dashed px-2 py-1.5 overflow-hidden opacity-35', start < editableUntil && 'hover:opacity-60 cursor-pointer', !fixed && !task.done && 'active:cursor-grabbing', fixed ? 'bg-[var(--blue-bg)] border-[var(--blue)]' : `cat-${task.category_color} border-[var(--purple)]`)}
                    style={{ top, height }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={clsx('text-xs font-semibold flex-1 min-w-0 truncate', task.done && 'line-through')}>{task.text}</span>
                      <span className="text-[9px] opacity-65 shrink-0">{fixed ? '일정' : task.category_name}</span>
                    </div>
                    {height >= 42 && <p className="text-[10px] opacity-70 mt-0.5">{minutesToTime(start)}–{minutesToTime(end)} · {formatDuration(end - start)}</p>}
                  </div>
                )
              })}

              {actualBlocks.map(({ task, start, end }) => {
                const top = ((start - TIMELINE_START) / (TIMELINE_END - TIMELINE_START)) * TIMELINE_HEIGHT
                const height = Math.max(30, ((end - start) / (TIMELINE_END - TIMELINE_START)) * TIMELINE_HEIGHT)
                return (
                  <button
                    type="button"
                    key={`actual:${task.id}`}
                    onClick={() => openActualEditor(task, start, end)}
                    className={clsx('absolute left-2 right-2 z-20 rounded-[9px] border px-2 py-1.5 overflow-hidden text-left shadow-md hover:ring-2 hover:ring-white/80', isFixedTask(task) ? 'bg-[var(--blue)] border-[var(--blue)] text-white' : 'bg-[var(--purple)] border-[var(--purple)] text-white')}
                    style={{ top, height }}
                    title="실제 시간 수정"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold flex-1 min-w-0 truncate">{task.text}</span>
                      <span className="text-[9px] opacity-75 shrink-0">실제</span>
                    </div>
                    {height >= 42 && <p className="text-[10px] opacity-80 mt-0.5">{minutesToTime(start)}–{minutesToTime(end)} · {formatDuration(end - start)}</p>}
                  </button>
                )
              })}

              {chronological.length === 0 && actualBlocks.length === 0 && !draggedTaskId && (
                <div className="absolute inset-x-3 top-16 rounded-[12px] border border-dashed border-[var(--border-strong)] py-5 flex flex-col items-center text-center pointer-events-none">
                  <CalendarClock size={20} className="text-[var(--text-3)] mb-1.5" />
                  <span className="text-xs font-medium">할 일을 이 시간축으로 끌어오세요.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-[var(--border)] rounded-[18px] overflow-visible self-start">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h3 className="text-sm font-bold">오늘 할 일</h3>
            <p className="text-xs text-[var(--text-3)] mt-0.5">카테고리별로 모아보고, 드래그해 왼쪽 타임라인에 배치하세요.</p>
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
                        <div key={category.id} className="flex items-center gap-1 group">
                          <button type="button" onClick={() => { setCategoryId(category.id); setShowCategories(false) }} className="flex-1 px-2 py-2 rounded-[8px] hover:bg-[var(--surface-2)] text-sm text-left flex items-center gap-2">
                            <CategoryDot color={category.color} /> {category.name}
                          </button>
                          {onDeleteCategory && selectableCategories.length > 1 && (
                            <button type="button" aria-label={`${category.name} 삭제`} onClick={() => onDeleteCategory(category.id)} className="w-7 h-7 rounded-[7px] text-[var(--text-3)] opacity-0 group-hover:opacity-100 hover:text-[var(--red)] hover:bg-[var(--red-bg)] flex items-center justify-center"><Trash2 size={12} /></button>
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

          <div className="p-3 flex flex-col gap-4 max-h-[680px] overflow-y-auto scrollbar-thin">
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
                    <div className="flex flex-col gap-2">
                      {activeRoutines.map(routine => {
                        const done = routineLogs.some(log => log.routine_id === routine.id && log.date === date && log.done)
                        return (
                          <button
                            type="button"
                            key={routine.id}
                            onClick={() => onToggleRoutine?.(routine.id, date)}
                            className={clsx('w-full rounded-[12px] border px-3 py-2.5 flex items-center gap-2.5 text-left', done ? 'bg-[var(--teal-bg)] border-transparent opacity-65' : 'bg-white border-[var(--border)]')}
                          >
                            <span className={clsx('h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0', done ? 'bg-[var(--teal)] border-[var(--teal)] text-white' : 'border-[var(--amber)]')}>{done && <Check size={11} strokeWidth={3} />}</span>
                            <span className={clsx('text-sm font-medium flex-1 min-w-0 truncate', done && 'line-through')}>{routine.name}</span>
                            {routine.time && <span className="text-[11px] text-[var(--text-3)] tabular-nums">{routine.time}</span>}
                          </button>
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
                  {tasks.map(task => (
                    <div
                      key={task.id}
                      draggable={!task.done}
                      onDragStart={event => {
                        if (task.done) return
                        setDraggedTaskId(task.id)
                        event.dataTransfer.setData('text/plain', task.id)
                        event.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => { setDraggedTaskId(null); setDragPreviewMinute(null) }}
                      className={clsx('rounded-[12px] border px-3 py-2.5 group', task.done ? 'bg-[var(--surface-2)] border-transparent opacity-60' : 'bg-white border-[var(--border)] cursor-grab active:cursor-grabbing', draggedTaskId === task.id && 'opacity-50 ring-2 ring-[var(--purple)]')}
                    >
                      <div className="flex items-start gap-2.5">
                        <button
                          type="button"
                          aria-label={`${task.text} 타임라인에 배치`}
                          draggable={false}
                          onDragStart={event => event.preventDefault()}
                          className="mt-0.5 -ml-1 h-6 w-6 touch-none rounded-[6px] text-[var(--text-3)] hover:bg-[var(--surface-2)] flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing"
                          onPointerDown={event => {
                            if (task.done || !event.isPrimary) return
                            pointerTaskIdRef.current = task.id
                            setDraggedTaskId(task.id)
                            event.currentTarget.setPointerCapture(event.pointerId)
                          }}
                          onPointerMove={event => {
                            if (pointerTaskIdRef.current !== task.id) return
                            event.preventDefault()
                            setDragPreviewMinute(timelineMinuteAtPoint(event.clientX, event.clientY))
                          }}
                          onPointerUp={event => finishPointerDrag(event.clientX, event.clientY)}
                          onPointerCancel={() => finishPointerDrag(-1, -1)}
                        >
                          <GripVertical size={15} aria-hidden="true" />
                        </button>
                        <button type="button" aria-label={task.done ? '완료 취소' : '완료'} onClick={() => onToggleTask(task.id)} className={clsx('mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0', task.done ? 'bg-[var(--teal)] border-[var(--teal)] text-white' : 'border-[var(--border-strong)]')}>{task.done && <Check size={11} strokeWidth={3} />}</button>
                        <div className="flex-1 min-w-0">
                          <p className={clsx('text-sm font-medium truncate', task.done && 'line-through')}>{task.text}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <label className="flex items-center gap-1 text-[11px] text-[var(--text-3)]">
                              예상
                              <input key={`${task.id}:${task.duration_min ?? ''}`} inputMode="numeric" defaultValue={getTaskDuration(task)} onBlur={event => { const value = Number.parseInt(event.target.value, 10); if (value > 0 && value !== getTaskDuration(task)) onUpdateTask(task.id, { duration_min: value }) }} className="w-14 px-1.5 py-1 rounded-[6px] bg-[var(--surface-2)] text-right text-xs font-semibold outline-none focus:bg-white focus:ring-1 focus:ring-[var(--purple)]" />분
                            </label>
                            <label className="flex items-center gap-1 text-[11px] text-[var(--text-3)]">
                              타임라인
                              <input type="time" value={task.start_time ?? task.time ?? ''} onChange={event => onUpdateTask(task.id, { start_time: event.target.value || undefined, time: event.target.value || undefined })} className="px-1.5 py-1 rounded-[6px] bg-[var(--surface-2)] text-xs outline-none focus:bg-white focus:ring-1 focus:ring-[var(--purple)]" />
                            </label>
                          </div>
                        </div>
                        <button type="button" onClick={() => onDeleteTask(task.id)} aria-label={`${task.text} 삭제`} className="w-7 h-7 rounded-[7px] opacity-40 group-hover:opacity-100 text-[var(--text-3)] hover:text-[var(--red)] hover:bg-[var(--red-bg)] flex items-center justify-center"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {actualEditor && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setActualEditor(null)}>
          <div className="w-full max-w-md bg-white rounded-[20px] shadow-xl p-5" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-bold">{actualEditor.taskId ? '실제 시간 정리' : '지난 시간 기록'}</h3>
                <p className="text-xs text-[var(--text-3)] mt-1">{isToday ? `현재 시각 ${minutesToTime(editableUntil)} 이전만 기록할 수 있습니다.` : '지난 날은 05:00~다음 날 01:00을 정리할 수 있습니다.'}</p>
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
              {actualEditor.taskId && <button type="button" onClick={markActualSkipped} className="px-3 py-2 rounded-[9px] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-2)]">미수행</button>}
              {actualEditor.taskId && entry.tasks.find(task => task.id === actualEditor.taskId)?.actual_status === 'recorded' && <button type="button" onClick={clearActualRecord} className="px-3 py-2 rounded-[9px] text-xs font-semibold text-[var(--red)] hover:bg-[var(--red-bg)]">실제 기록 삭제</button>}
              <button type="button" onClick={saveActualRecord} className="ml-auto px-4 py-2 rounded-[9px] bg-[var(--purple)] text-white text-xs font-semibold">{actualEditor.taskId ? '실제 시간 저장' : '기록 추가'}</button>
            </div>
          </div>
        </div>
      )}

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
    </section>
  )
}
