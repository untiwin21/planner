import type { DayEntry, FocusSessionRecord, LongGoal, Routine, RoutineLog, ShortGoal, Task, TaskHistoryEvent } from '@/types'
import { isRoutineScheduledOn, routineConfig } from '@/lib/routineSchedule'
import { isActualOnlyTask } from '@/lib/taskVisibility'

export type AiExportRange = 1 | 7 | 30 | 'all'

export interface AiExportSource {
  days: DayEntry[]
  goals: ShortGoal[]
  routines: Routine[]
  logs: RoutineLog[]
  longGoals: LongGoal[]
  weeklyReviews: Record<string, string>
}

interface AiTaskRecord {
  date: string
  id: string
  text: string
  category: string
  goal_id?: string
  goal_title?: string
  done: boolean
  discarded: boolean
  fixed: boolean
  actual_only: boolean
  schedule_type?: string
  planned_start?: string
  planned_end?: string
  estimated_min: number | null
  actual_start?: string
  actual_end?: string
  actual_min: number | null
  progress?: string
  deleted: boolean
  actual_sessions: Array<{ started_at: string; ended_at: string; duration_min: number; source: string }>
}

interface AiTaskHistoryRecord extends TaskHistoryEvent {
  date: string
  task_id: string
  task_text: string
}

interface AiTimelineBlock {
  task_id: string
  text: string
  category: string
  start: string
  end: string
  duration_min: number | null
  source: 'plan' | 'actual' | 'focus'
}

interface AiTimelineDay {
  date: string
  planned: AiTimelineBlock[]
  actual: AiTimelineBlock[]
}

interface AiRoutineRecord {
  id: string
  name: string
  identity: string
  status: string
  cue_time?: string
  cue?: string
  minimum_version?: string
  duration_min?: number
  scheduled_count: number
  completed_count: number
  minimum_count: number
  adherence_pct: number | null
}

interface AiDailyRecord {
  date: string
  sleep_hours: number | null
  condition: number | null
  focus: number | null
  top3: string[]
  note: string
  tasks_total: number
  tasks_done: number
  task_completion_pct: number | null
  estimated_min: number
  planned_actual_min: number
  unplanned_actual_min: number
  actual_min: number
  actual_covered_min: number
  estimation_ratio: number | null
  routines_scheduled: number
  routines_done: number
  routine_adherence_pct: number | null
}

interface IdentityProfile {
  name: string
  statement?: string
  meaning?: string
  color?: string
}

interface GoalNarrative {
  why?: string
  futureSelf?: string
  obstacle?: string
  ifThen?: string
  doneDefinition?: string
  nextAction?: string
  recoveryPlan?: string
}

interface BehaviorSystem {
  resetRule?: string
  minimumRule?: string
  selfTalk?: string
}

export interface AiContextSnapshot {
  meta: {
    generated_at: string
    period_start: string | null
    period_end: string | null
    range_days: AiExportRange
    purpose: string
  }
  overview: {
    days_recorded: number
    task_completion_pct: number | null
    routine_adherence_pct: number | null
    estimated_task_min: number
    planned_actual_task_min: number
    unplanned_actual_task_min: number
    actual_task_min: number
    actual_covered_min: number
    estimation_ratio: number | null
    average_sleep_hours: number | null
    average_condition: number | null
    average_focus: number | null
  }
  daily: AiDailyRecord[]
  tasks: AiTaskRecord[]
  routines: AiRoutineRecord[]
  goals: Array<{
    level: 'long' | 'short'
    id: string
    parent_id?: string
    title: string
    description?: string
    date_from: string
    date_to: string
    progress_pct: number | null
    done_items: number
    total_items: number
    narrative?: GoalNarrative
  }>
  identities: IdentityProfile[]
  behavior_system: BehaviorSystem | null
  task_history: AiTaskHistoryRecord[]
  timeline: AiTimelineDay[]
  recent_reviews: Array<{ key: string; content: string }>
}

const IDENTITY_SYNC_KEY = '__identity_profiles__'
const GOAL_NARRATIVE_SYNC_KEY = '__goal_narratives__'
const BEHAVIOR_SYSTEM_SYNC_KEY = '__behavior_system__'

function safeParse<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

function localDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addLocalDays(date: Date, amount: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function timeDiffMinutes(start?: string, end?: string): number | null {
  if (!start || !end) return null
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  if (![sh, sm, eh, em].every(Number.isFinite)) return null
  let diff = eh * 60 + em - (sh * 60 + sm)
  if (diff < 0) diff += 24 * 60
  return diff
}

function taskEstimatedMinutes(task: Task): number | null {
  if (typeof task.duration_min === 'number') return Math.max(0, task.duration_min)
  const planned = timeDiffMinutes(task.start_time ?? task.time, task.end_time)
  if (planned !== null) return planned
  const childValues = (task.subtasks ?? [])
    .filter(subtask => !subtask.discarded)
    .map(subtask => typeof subtask.duration_min === 'number' ? subtask.duration_min : timeDiffMinutes(subtask.start_time, subtask.end_time))
    .filter((value): value is number => typeof value === 'number')
  return childValues.length ? childValues.reduce((sum, value) => sum + value, 0) : null
}

function taskActualMinutes(task: Task): number | null {
  const explicit = (task as Task & { actual_duration_min?: number }).actual_duration_min
  if (typeof explicit === 'number') return Math.max(0, explicit)
  const direct = timeDiffMinutes(task.actual_start_time, task.actual_end_time)
  if (direct !== null) return direct
  const childValues = (task.subtasks ?? [])
    .filter(subtask => !subtask.discarded)
    .map(subtask => timeDiffMinutes(subtask.actual_start_time, subtask.actual_end_time))
    .filter((value): value is number => typeof value === 'number')
  return childValues.length ? childValues.reduce((sum, value) => sum + value, 0) : null
}

function taskProgressLabel(task: Task): string | undefined {
  if (typeof task.progress_target !== 'number') return undefined
  return `${task.progress_current ?? 0}/${task.progress_target}${task.progress_unit ? ` ${task.progress_unit}` : ''}`
}

function sleepHoursFromMinutes(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.round((value / 60) * 10) / 10
}

function plannerClockMinute(value?: string): number | null {
  if (!value) return null
  const [hour, minute] = value.split(':').map(Number)
  if (![hour, minute].every(Number.isFinite)) return null
  const raw = hour * 60 + minute
  return raw < 5 * 60 ? raw + 24 * 60 : raw
}

function taskActualIntervals(task: Task, plannerDate: string): Array<[number, number]> {
  const dayStart = 5 * 60
  const dayEnd = 29 * 60
  const intervals: Array<[number, number]> = []

  if ((task.actual_sessions ?? []).length > 0) {
    const base = new Date(`${plannerDate}T00:00:00`)
    for (const session of task.actual_sessions ?? []) {
      const started = new Date(session.started_at)
      const ended = new Date(session.ended_at)
      if (Number.isNaN(started.getTime())) continue
      const startRaw = (started.getTime() - base.getTime()) / 60_000
      const endRaw = Number.isNaN(ended.getTime())
        ? startRaw + session.duration_min
        : (ended.getTime() - base.getTime()) / 60_000
      const start = Math.max(dayStart, startRaw)
      const end = Math.min(dayEnd, endRaw)
      if (end > start) intervals.push([start, end])
    }
    return intervals
  }

  const start = plannerClockMinute(task.actual_start_time)
  const endClock = plannerClockMinute(task.actual_end_time)
  if (start === null || endClock === null) return intervals
  let end = endClock
  if (end <= start) end += 24 * 60
  const clippedStart = Math.max(dayStart, start)
  const clippedEnd = Math.min(dayEnd, end)
  if (clippedEnd > clippedStart) intervals.push([clippedStart, clippedEnd])
  return intervals
}

function uniqueActualCoveredMinutes(tasks: Task[], plannerDate: string): number {
  const intervals = tasks.flatMap(task => taskActualIntervals(task, plannerDate)).sort((a, b) => a[0] - b[0])
  if (!intervals.length) return 0
  let total = 0
  let [start, end] = intervals[0]
  for (const [nextStart, nextEnd] of intervals.slice(1)) {
    if (nextStart <= end) end = Math.max(end, nextEnd)
    else {
      total += end - start
      start = nextStart
      end = nextEnd
    }
  }
  return Math.round((total + end - start) * 10) / 10
}

function clockLabelFromMinute(minute: number): string {
  const normalized = ((minute % (24 * 60)) + 24 * 60) % (24 * 60)
  const hh = String(Math.floor(normalized / 60)).padStart(2, '0')
  const mm = String(Math.round(normalized % 60)).padStart(2, '0')
  return `${minute >= 24 * 60 ? '다음날 ' : ''}${hh}:${mm}`
}

function plannedRange(task: Task) {
  const startText = task.start_time ?? task.time
  if (!startText) return null
  const [h, m] = startText.split(':').map(Number)
  if (![h, m].every(Number.isFinite)) return null
  let start = h * 60 + m
  if (start < 5 * 60) start += 24 * 60
  let duration = taskEstimatedMinutes(task) ?? 0
  let end = start + duration
  if (task.end_time) {
    const [eh, em] = task.end_time.split(':').map(Number)
    if ([eh, em].every(Number.isFinite)) {
      end = eh * 60 + em
      if (end < 5 * 60) end += 24 * 60
      if (end <= start) end += 24 * 60
      duration = end - start
    }
  }
  return { start, end, duration }
}

function localSessionLabel(iso: string, plannerDate: string) {
  const value = new Date(iso)
  if (Number.isNaN(value.getTime())) return iso
  const time = `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
  const date = localDateString(value)
  if (date === plannerDate) return time
  const next = localDateString(addLocalDays(new Date(`${plannerDate}T12:00:00`), 1))
  if (date === next) return `다음날 ${time}`
  return `${date} ${time}`
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (!valid.length) return null
  return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10) / 10
}

function pct(done: number, total: number): number | null {
  return total > 0 ? Math.round(done / total * 100) : null
}

function selectedDates(range: AiExportRange, sourceDays: DayEntry[]) {
  const today = new Date()
  const end = localDateString(today)
  if (range === 'all') {
    const dates = sourceDays.map(day => day.date).sort()
    return { start: dates[0] ?? null, end, includes: (date: string) => !dates.length || date <= end }
  }
  const start = localDateString(addLocalDays(today, -(range - 1)))
  return { start, end, includes: (date: string) => date >= start && date <= end }
}

export function buildAiContextSnapshot(source: AiExportSource, range: AiExportRange = 7): AiContextSnapshot {
  const window = selectedDates(range, source.days)
  const selectedDays = source.days.filter(day => window.includes(day.date)).sort((a, b) => a.date.localeCompare(b.date))
  const selectedLogs = source.logs.filter(log => window.includes(log.date))
  const shortGoalMap = new Map(source.goals.map(goal => [goal.id, goal]))

  const taskRecords: AiTaskRecord[] = selectedDays.flatMap(day =>
    [...(day.tasks ?? []), ...(day.task_tombstones ?? [])].map(task => {
      const actualOnly = isActualOnlyTask(task)
      const estimated = taskEstimatedMinutes(task)
      const actual = taskActualMinutes(task)
      const goal = task.goal_id ? shortGoalMap.get(task.goal_id) : undefined
      return {
        date: day.date,
        id: task.id,
        text: task.text,
        category: task.category_name,
        goal_id: task.goal_id,
        goal_title: goal?.title,
        done: task.done,
        discarded: !!task.discarded,
        fixed: !!task.fixed,
        actual_only: actualOnly,
        schedule_type: task.schedule_type,
        planned_start: task.start_time ?? task.time,
        planned_end: task.end_time,
        estimated_min: actualOnly ? null : estimated,
        actual_start: task.actual_start_time,
        actual_end: task.actual_end_time,
        actual_min: actual,
        progress: taskProgressLabel(task),
        deleted: !!task.deleted_at,
        actual_sessions: (task.actual_sessions ?? []).map(session => ({
          started_at: session.started_at,
          ended_at: session.ended_at,
          duration_min: session.duration_min,
          source: session.source,
        })),
      }
    }),
  )

  const daily: AiDailyRecord[] = selectedDays.map(day => {
    const activeTasks = (day.tasks ?? []).filter(task => !task.deleted_at && !task.discarded)
    const plannedTasks = activeTasks.filter(task => !isActualOnlyTask(task))
    const actualOnlyTasks = activeTasks.filter(task => isActualOnlyTask(task))
    const estimated = plannedTasks.map(taskEstimatedMinutes).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
    const plannedActual = plannedTasks.map(taskActualMinutes).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
    const unplannedActual = actualOnlyTasks.map(taskActualMinutes).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
    const actual = plannedActual + unplannedActual
    const actualCovered = uniqueActualCoveredMinutes(activeTasks, day.date)
    const scheduledRoutines = source.routines.filter(routine => routine.status === 'active' && isRoutineScheduledOn(routine, day.date))
    const routineDone = scheduledRoutines.filter(routine => selectedLogs.some(log => log.routine_id === routine.id && log.date === day.date && log.done)).length
    return {
      date: day.date,
      sleep_hours: sleepHoursFromMinutes(day.meta?.sleep),
      condition: day.meta?.condition ?? null,
      focus: day.meta?.focus ?? null,
      top3: day.meta?.top3 ?? [],
      note: day.note ?? '',
      tasks_total: plannedTasks.length,
      tasks_done: plannedTasks.filter(task => task.done).length,
      task_completion_pct: pct(plannedTasks.filter(task => task.done).length, plannedTasks.length),
      estimated_min: estimated,
      planned_actual_min: plannedActual,
      unplanned_actual_min: unplannedActual,
      actual_min: actual,
      actual_covered_min: actualCovered,
      estimation_ratio: estimated > 0 && plannedActual > 0 ? Math.round(plannedActual / estimated * 100) / 100 : null,
      routines_scheduled: scheduledRoutines.length,
      routines_done: routineDone,
      routine_adherence_pct: pct(routineDone, scheduledRoutines.length),
    }
  })

  const taskHistory: AiTaskHistoryRecord[] = selectedDays.flatMap(day =>
    [...(day.tasks ?? []), ...(day.task_tombstones ?? [])].flatMap(task =>
      (task.history ?? []).map(event => ({ ...event, date: day.date, task_id: task.id, task_text: task.text })),
    ),
  ).sort((a, b) => a.at.localeCompare(b.at))

  const timeline: AiTimelineDay[] = selectedDays.map(day => {
    const planned: AiTimelineBlock[] = []
    const actual: AiTimelineBlock[] = []
    for (const task of day.tasks ?? []) {
      if (task.deleted_at || task.discarded) continue
      const plan = plannedRange(task)
      if (plan) planned.push({
        task_id: task.id,
        text: task.text,
        category: task.category_name,
        start: clockLabelFromMinute(plan.start),
        end: clockLabelFromMinute(plan.end),
        duration_min: Math.round(plan.duration),
        source: 'plan',
      })
      if ((task.actual_sessions ?? []).length > 0) {
        for (const session of task.actual_sessions ?? []) {
          actual.push({
            task_id: task.id,
            text: task.text,
            category: task.category_name,
            start: localSessionLabel(session.started_at, day.date),
            end: localSessionLabel(session.ended_at, day.date),
            duration_min: Math.round(session.duration_min * 10) / 10,
            source: 'focus',
          })
        }
      } else if (task.actual_start_time && task.actual_end_time) {
        const duration = timeDiffMinutes(task.actual_start_time, task.actual_end_time)
        actual.push({
          task_id: task.id,
          text: task.text,
          category: task.category_name,
          start: task.actual_start_time,
          end: task.actual_end_time,
          duration_min: duration,
          source: 'actual',
        })
      }
    }
    return { date: day.date, planned, actual }
  })

  const routines: AiRoutineRecord[] = source.routines
    .filter(routine => routine.status !== 'archived')
    .map(routine => {
      const config = routineConfig(routine)
      const scheduledDates = selectedDays.map(day => day.date).filter(date => isRoutineScheduledOn(routine, date))
      const relevantLogs = selectedLogs.filter(log => log.routine_id === routine.id && scheduledDates.includes(log.date))
      const completed = relevantLogs.filter(log => log.done)
      return {
        id: routine.id,
        name: routine.name,
        identity: config.bundle?.trim() || '기타 루틴',
        status: routine.status,
        cue_time: routine.time,
        cue: config.cue_label,
        minimum_version: config.minimum_version,
        duration_min: config.duration_min,
        scheduled_count: scheduledDates.length,
        completed_count: completed.length,
        minimum_count: completed.filter(log => log.completion === 'minimum').length,
        adherence_pct: pct(completed.length, scheduledDates.length),
      }
    })

  const goalNarratives = safeParse<Record<string, GoalNarrative>>(source.weeklyReviews[GOAL_NARRATIVE_SYNC_KEY], {})
  const identities = safeParse<IdentityProfile[]>(source.weeklyReviews[IDENTITY_SYNC_KEY], [])
  const behaviorSystem = safeParse<BehaviorSystem | null>(source.weeklyReviews[BEHAVIOR_SYSTEM_SYNC_KEY], null)

  const longGoals = source.longGoals.map(goal => {
    const linkedShortGoals = source.goals.filter(shortGoal => shortGoal.long_goal_id === goal.id)
    const taskItems = linkedShortGoals.flatMap(shortGoal => shortGoal.tasks ?? []).filter(task => !task.deleted_at && !task.discarded)
    const doneItems = taskItems.filter(task => task.done).length
    return {
      level: 'long' as const,
      id: goal.id,
      title: goal.title,
      description: goal.description,
      date_from: goal.date_from,
      date_to: goal.date_to,
      progress_pct: pct(doneItems, taskItems.length),
      done_items: doneItems,
      total_items: taskItems.length,
      narrative: goalNarratives[goal.id],
    }
  })

  const shortGoals = source.goals.map(goal => {
    const taskItems = (goal.tasks ?? []).filter(task => !task.deleted_at && !task.discarded)
    const doneItems = taskItems.filter(task => task.done).length
    return {
      level: 'short' as const,
      id: goal.id,
      parent_id: goal.long_goal_id,
      title: goal.title,
      description: goal.note,
      date_from: goal.date_from,
      date_to: goal.date_to,
      progress_pct: pct(doneItems, taskItems.length),
      done_items: doneItems,
      total_items: taskItems.length,
    }
  })

  const activeTaskRecords = taskRecords.filter(task => !task.discarded && !task.deleted)
  const plannedTaskRecords = activeTaskRecords.filter(task => !task.actual_only)
  const actualOnlyTaskRecords = activeTaskRecords.filter(task => task.actual_only)
  const completedTasks = plannedTaskRecords.filter(task => task.done).length
  const taskEstimated = plannedTaskRecords.map(task => task.estimated_min).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
  const plannedTaskActual = plannedTaskRecords.map(task => task.actual_min).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
  const unplannedTaskActual = actualOnlyTaskRecords.map(task => task.actual_min).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
  const taskActual = plannedTaskActual + unplannedTaskActual
  const actualCovered = daily.reduce((sum, day) => sum + day.actual_covered_min, 0)
  const routineScheduled = routines.reduce((sum, routine) => sum + routine.scheduled_count, 0)
  const routineCompleted = routines.reduce((sum, routine) => sum + routine.completed_count, 0)

  const reviews = Object.entries(source.weeklyReviews)
    .filter(([key, content]) => !key.startsWith('__') && !!content?.trim())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 8)
    .map(([key, content]) => ({ key, content }))

  return {
    meta: {
      generated_at: new Date().toISOString(),
      period_start: window.start,
      period_end: window.end,
      range_days: range,
      purpose: 'Planr current-state context for AI coaching, reflection, and future agent use',
    },
    overview: {
      days_recorded: selectedDays.length,
      task_completion_pct: pct(completedTasks, plannedTaskRecords.length),
      routine_adherence_pct: pct(routineCompleted, routineScheduled),
      estimated_task_min: taskEstimated,
      planned_actual_task_min: plannedTaskActual,
      unplanned_actual_task_min: unplannedTaskActual,
      actual_task_min: taskActual,
      actual_covered_min: actualCovered,
      estimation_ratio: taskEstimated > 0 && plannedTaskActual > 0 ? Math.round(plannedTaskActual / taskEstimated * 100) / 100 : null,
      average_sleep_hours: average(daily.map(day => day.sleep_hours)),
      average_condition: average(daily.map(day => day.condition)),
      average_focus: average(daily.map(day => day.focus)),
    },
    daily,
    tasks: taskRecords,
    routines,
    goals: [...longGoals, ...shortGoals],
    identities,
    behavior_system: behaviorSystem,
    task_history: taskHistory,
    timeline,
    recent_reviews: reviews,
  }
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = Array.isArray(value) ? value.join(' | ') : typeof value === 'object' ? JSON.stringify(value) : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export function aiSnapshotToCsv(snapshot: AiContextSnapshot): string {
  const columns = [
    'record_type', 'date', 'parent', 'name', 'status', 'category_or_identity', 'planned_start', 'planned_end',
    'estimated_min', 'actual_start', 'actual_end', 'actual_min', 'score_or_pct', 'value', 'notes',
  ]
  const rows: unknown[][] = []

  rows.push(['overview', snapshot.meta.period_end, '', 'current_state', '', '', '', '', snapshot.overview.estimated_task_min, '', '', snapshot.overview.actual_task_min, snapshot.overview.task_completion_pct, JSON.stringify(snapshot.overview), ''])

  for (const day of snapshot.daily) {
    rows.push(['daily_summary', day.date, '', 'day', '', '', '', '', day.estimated_min, '', '', day.actual_min, day.task_completion_pct, `sleep=${day.sleep_hours ?? ''}; condition=${day.condition ?? ''}; focus=${day.focus ?? ''}; routines=${day.routines_done}/${day.routines_scheduled}`, day.top3.join(' | ') || day.note])
  }

  for (const task of snapshot.tasks) {
    rows.push(['task', task.date, task.goal_title ?? task.goal_id ?? '', task.text, task.actual_only ? 'actual_only' : task.discarded ? 'discarded' : task.done ? 'done' : 'open', task.category, task.planned_start ?? '', task.planned_end ?? '', task.estimated_min, task.actual_start ?? '', task.actual_end ?? '', task.actual_min, '', task.progress ?? '', [task.schedule_type, task.actual_only ? 'retrospective-only' : 'planned'].filter(Boolean).join(' | ')])
  }

  for (const routine of snapshot.routines) {
    rows.push(['routine', snapshot.meta.period_end, routine.identity, routine.name, routine.status, routine.identity, routine.cue_time ?? '', '', routine.duration_min ?? '', '', '', '', routine.adherence_pct, `${routine.completed_count}/${routine.scheduled_count}; minimum=${routine.minimum_count}`, [routine.cue, routine.minimum_version].filter(Boolean).join(' | ')])
  }

  for (const goal of snapshot.goals) {
    rows.push([`${goal.level}_goal`, snapshot.meta.period_end, goal.parent_id ?? '', goal.title, '', '', goal.date_from, goal.date_to, '', '', '', '', goal.progress_pct, `${goal.done_items}/${goal.total_items}`, goal.description ?? ''])
  }

  for (const identity of snapshot.identities) {
    rows.push(['identity', snapshot.meta.period_end, '', identity.name, '', '', '', '', '', '', '', '', '', identity.statement ?? '', identity.meaning ?? ''])
  }

  if (snapshot.behavior_system) {
    rows.push(['behavior_system', snapshot.meta.period_end, '', 'recovery_protocol', '', '', '', '', '', '', '', '', '', snapshot.behavior_system.resetRule ?? '', [snapshot.behavior_system.minimumRule, snapshot.behavior_system.selfTalk].filter(Boolean).join(' | ')])
  }

  for (const event of snapshot.task_history) {
    rows.push(['task_history', event.date, event.task_id, event.task_text, event.kind, '', '', '', '', '', '', '', '', event.at, JSON.stringify({ before: event.before, after: event.after, note: event.note })])
  }
  for (const day of snapshot.timeline) {
    for (const block of [...day.planned, ...day.actual]) {
      rows.push(['timeline', day.date, block.task_id, block.text, block.source, block.category, block.start, block.end, block.source === 'plan' ? block.duration_min : '', block.source !== 'plan' ? block.start : '', block.source !== 'plan' ? block.end : '', block.source !== 'plan' ? block.duration_min : '', '', '', ''])
    }
  }

  return '\uFEFF' + [columns, ...rows].map(row => row.map(csvEscape).join(',')).join('\n')
}

function formatHours(minutes: number): string {
  if (!minutes) return '0분'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest}분`
  return `${hours}시간 ${rest}분`
}

function optional(value: unknown): string {
  return value === null || value === undefined || value === '' ? '기록 없음' : String(value)
}

export function aiSnapshotToMarkdown(snapshot: AiContextSnapshot): string {
  const lines: string[] = []
  lines.push('# Planr — AI Mentor Context')
  lines.push('')
  lines.push(`- 생성 시각: ${snapshot.meta.generated_at}`)
  lines.push(`- 분석 기간: ${snapshot.meta.period_start ?? '전체'} ~ ${snapshot.meta.period_end ?? '오늘'}`)
  lines.push('- 목적: 이 기록을 바탕으로 사용자의 실제 행동 패턴, 계획 정확도, 습관 지속성, 목표 진행을 근거 중심으로 피드백하기')
  lines.push('')
  lines.push('## 1. 현재 요약')
  lines.push(`- 계획 할 일 완료율: ${optional(snapshot.overview.task_completion_pct)}${snapshot.overview.task_completion_pct !== null ? '%' : ''}`)
  lines.push(`- 루틴 실행률: ${optional(snapshot.overview.routine_adherence_pct)}${snapshot.overview.routine_adherence_pct !== null ? '%' : ''}`)
  lines.push(`- 계획 예상 총시간: ${formatHours(snapshot.overview.estimated_task_min)}`)
  lines.push(`- 계획 항목 실제시간: ${formatHours(snapshot.overview.planned_actual_task_min)}`)
  lines.push(`- 계획 외 실제기록 합계: ${formatHours(snapshot.overview.unplanned_actual_task_min)}`)
  lines.push(`- 전체 실제 활동시간 합계: ${formatHours(snapshot.overview.actual_task_min)} (동시 활동은 중복 합산될 수 있음)`)
  lines.push(`- 실제 타임라인 커버리지: ${formatHours(snapshot.overview.actual_covered_min)} (겹치는 시간대는 1회만 계산)`)
  lines.push(`- 계획 항목 실제/예상 시간 비율: ${optional(snapshot.overview.estimation_ratio)}`)
  lines.push(`- 평균 수면: ${optional(snapshot.overview.average_sleep_hours)}${snapshot.overview.average_sleep_hours !== null ? '시간' : ''}`)
  lines.push(`- 평균 컨디션: ${optional(snapshot.overview.average_condition)}`)
  lines.push(`- 평균 집중도: ${optional(snapshot.overview.average_focus)}`)
  lines.push('')

  if (snapshot.identities.length) {
    lines.push('## 2. 정체성')
    for (const identity of snapshot.identities) {
      lines.push(`### ${identity.name}`)
      if (identity.statement) lines.push(`- 정체성 문장: ${identity.statement}`)
      if (identity.meaning) lines.push(`- 중요한 이유: ${identity.meaning}`)
    }
    lines.push('')
  }

  if (snapshot.behavior_system) {
    lines.push('## 3. 회복 프로토콜')
    if (snapshot.behavior_system.resetRule) lines.push(`- 놓쳤을 때: ${snapshot.behavior_system.resetRule}`)
    if (snapshot.behavior_system.minimumRule) lines.push(`- 최소 행동: ${snapshot.behavior_system.minimumRule}`)
    if (snapshot.behavior_system.selfTalk) lines.push(`- 자기대화: ${snapshot.behavior_system.selfTalk}`)
    lines.push('')
  }

  lines.push('## 4. 목표')
  for (const goal of snapshot.goals.filter(goal => goal.level === 'long')) {
    lines.push(`### ${goal.title}`)
    lines.push(`- 기간: ${goal.date_from} ~ ${goal.date_to}`)
    lines.push(`- 진행: ${goal.progress_pct ?? '측정 불가'}${goal.progress_pct !== null ? '%' : ''} (${goal.done_items}/${goal.total_items})`)
    if (goal.description) lines.push(`- 정의: ${goal.description}`)
    if (goal.narrative?.why) lines.push(`- Why: ${goal.narrative.why}`)
    if (goal.narrative?.futureSelf) lines.push(`- 원하는 미래: ${goal.narrative.futureSelf}`)
    if (goal.narrative?.obstacle) lines.push(`- 핵심 장애물: ${goal.narrative.obstacle}`)
    if (goal.narrative?.ifThen) lines.push(`- If–Then: ${goal.narrative.ifThen}`)
    if (goal.narrative?.doneDefinition) lines.push(`- 완료 기준: ${goal.narrative.doneDefinition}`)
    if (goal.narrative?.nextAction) lines.push(`- 가장 작은 다음 행동: ${goal.narrative.nextAction}`)
    if (goal.narrative?.recoveryPlan) lines.push(`- 복귀 규칙: ${goal.narrative.recoveryPlan}`)
  }
  lines.push('')

  lines.push('## 5. 루틴 현황')
  for (const routine of snapshot.routines) {
    lines.push(`- [${routine.identity}] ${routine.name}: ${routine.completed_count}/${routine.scheduled_count} (${routine.adherence_pct ?? '-'}%)${routine.minimum_count ? ` · 최소버전 ${routine.minimum_count}회` : ''}${routine.minimum_version ? ` · 최소 행동: ${routine.minimum_version}` : ''}`)
  }
  lines.push('')

  lines.push('## 6. 일별 기록')
  for (const day of snapshot.daily) {
    lines.push(`### ${day.date}`)
    lines.push(`- 계획 할 일: ${day.tasks_done}/${day.tasks_total} (${day.task_completion_pct ?? '-'}%)`)
    lines.push(`- 루틴: ${day.routines_done}/${day.routines_scheduled} (${day.routine_adherence_pct ?? '-'}%)`)
    lines.push(`- 계획 예상/계획 항목 실제: ${formatHours(day.estimated_min)} / ${formatHours(day.planned_actual_min)}`)
    lines.push(`- 계획 외 실제기록: ${formatHours(day.unplanned_actual_min)} · 전체 활동 합계 ${formatHours(day.actual_min)} · 실제 커버리지 ${formatHours(day.actual_covered_min)}`)
    lines.push(`- 수면/컨디션/집중: ${day.sleep_hours !== null ? `${day.sleep_hours}시간` : '기록 없음'} / ${optional(day.condition)} / ${optional(day.focus)}`)
    if (day.top3.length) lines.push(`- Top 3: ${day.top3.join(' / ')}`)
    if (day.note) lines.push(`- 메모: ${day.note}`)
  }
  lines.push('')

  lines.push('## 7. 할 일 상세')
  for (const task of snapshot.tasks) {
    const status = task.actual_only ? '실제기록 전용' : task.discarded ? '폐기' : task.done ? '완료' : '미완료'
    const timing = task.actual_only
      ? `계획 예상시간 없음 / 실제 ${task.actual_min ?? '-'}분`
      : `예상 ${task.estimated_min ?? '-'}분 / 실제 ${task.actual_min ?? '-'}분`
    lines.push(`- ${task.date} · ${status} · [${task.category}] ${task.text} · ${timing}${task.goal_title ? ` · 목표: ${task.goal_title}` : ''}`)
  }

  lines.push('')
  lines.push('## 8. 계획 변경 / 의사결정 기록')
  if (snapshot.task_history.length === 0) {
    lines.push('- 변경 이력 없음 (이 기능 적용 이전 기록은 현재 상태만 제공됨)')
  } else {
    for (const event of snapshot.task_history) {
      const note = event.note ? ` · ${event.note}` : ''
      lines.push(`- ${event.at} · ${event.date} · ${event.kind} · ${event.task_text}${note}`)
      if (event.before || event.after) lines.push(`  - before: ${JSON.stringify(event.before ?? {})} / after: ${JSON.stringify(event.after ?? {})}`)
    }
  }

  lines.push('')
  lines.push('## 9. 계획 vs 실제 타임라인')
  for (const day of snapshot.timeline) {
    lines.push(`### ${day.date}`)
    lines.push('- 계획')
    if (day.planned.length === 0) lines.push('  - 시간 배치된 계획 없음')
    for (const block of day.planned) lines.push(`  - ${block.start}–${block.end} · [${block.category}] ${block.text} · ${block.duration_min ?? '-'}분`)
    lines.push('- 실제')
    if (day.actual.length === 0) lines.push('  - 실제 시간 기록 없음')
    for (const block of day.actual) lines.push(`  - ${block.start}–${block.end} · [${block.category}] ${block.text} · ${block.duration_min ?? '-'}분 · ${block.source}`)
  }

  if (snapshot.recent_reviews.length) {
    lines.push('')
    lines.push('## 10. 최근 회고')
    for (const review of snapshot.recent_reviews) {
      lines.push(`### ${review.key}`)
      lines.push(review.content)
    }
  }

  lines.push('')
  lines.push('---')
  lines.push("AI 피드백 지침: 1) 계획 변경 이력을 시간순으로 복원해 처음 계획→재배치/취소→최종 실행을 설명한다. 2) 계획 타임라인과 실제 타임라인을 비교해 계획과 다르게 행동한 구간을 구체적으로 짚는다. 3) 실제 기록이 비어 있는 시간은 딴짓이라고 단정하지 말고 '미기록 시간'으로 표현한다. 4) 폐기/취소를 무조건 실패로 해석하지 말고 합리적 계획 수정인지 구분한다. 5) 막연한 격려보다 잘된 행동, 반복 패턴, 추정오차, 회복력, 다음에 바꿀 가장 작은 행동을 근거와 함께 제시한다. 6) '실제기록 전용' 항목은 사후 활동 로그이며 계획한 할 일/예상시간/완료율에 포함하지 않는다. 7) 전체 실제 활동시간 합계는 동시 활동 때문에 중복될 수 있으므로 하루 시간 사용량을 판단할 때는 실제 타임라인 커버리지와 함께 본다.")
  return lines.join('\n')
}
