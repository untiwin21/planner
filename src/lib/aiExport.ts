import type { DayEntry, LongGoal, Routine, RoutineLog, ShortGoal, Task } from '@/types'
import { isRoutineScheduledOn, routineConfig } from '@/lib/routineSchedule'

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
  schedule_type?: string
  planned_start?: string
  planned_end?: string
  estimated_min: number | null
  actual_start?: string
  actual_end?: string
  actual_min: number | null
  progress?: string
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
  actual_min: number
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
    actual_task_min: number
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
    (day.tasks ?? []).filter(task => !task.deleted_at).map(task => {
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
        schedule_type: task.schedule_type,
        planned_start: task.start_time ?? task.time,
        planned_end: task.end_time,
        estimated_min: estimated,
        actual_start: task.actual_start_time,
        actual_end: task.actual_end_time,
        actual_min: actual,
        progress: taskProgressLabel(task),
      }
    }),
  )

  const daily: AiDailyRecord[] = selectedDays.map(day => {
    const meaningfulTasks = (day.tasks ?? []).filter(task => !task.deleted_at && !task.discarded)
    const estimated = meaningfulTasks.map(taskEstimatedMinutes).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
    const actual = meaningfulTasks.map(taskActualMinutes).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
    const scheduledRoutines = source.routines.filter(routine => routine.status === 'active' && isRoutineScheduledOn(routine, day.date))
    const routineDone = scheduledRoutines.filter(routine => selectedLogs.some(log => log.routine_id === routine.id && log.date === day.date && log.done)).length
    return {
      date: day.date,
      sleep_hours: day.meta?.sleep ?? null,
      condition: day.meta?.condition ?? null,
      focus: day.meta?.focus ?? null,
      top3: day.meta?.top3 ?? [],
      note: day.note ?? '',
      tasks_total: meaningfulTasks.length,
      tasks_done: meaningfulTasks.filter(task => task.done).length,
      task_completion_pct: pct(meaningfulTasks.filter(task => task.done).length, meaningfulTasks.length),
      estimated_min: estimated,
      actual_min: actual,
      estimation_ratio: estimated > 0 && actual > 0 ? Math.round(actual / estimated * 100) / 100 : null,
      routines_scheduled: scheduledRoutines.length,
      routines_done: routineDone,
      routine_adherence_pct: pct(routineDone, scheduledRoutines.length),
    }
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

  const activeTaskRecords = taskRecords.filter(task => !task.discarded)
  const completedTasks = activeTaskRecords.filter(task => task.done).length
  const taskEstimated = activeTaskRecords.map(task => task.estimated_min).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
  const taskActual = activeTaskRecords.map(task => task.actual_min).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
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
      task_completion_pct: pct(completedTasks, activeTaskRecords.length),
      routine_adherence_pct: pct(routineCompleted, routineScheduled),
      estimated_task_min: taskEstimated,
      actual_task_min: taskActual,
      estimation_ratio: taskEstimated > 0 && taskActual > 0 ? Math.round(taskActual / taskEstimated * 100) / 100 : null,
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
    rows.push(['task', task.date, task.goal_title ?? task.goal_id ?? '', task.text, task.discarded ? 'discarded' : task.done ? 'done' : 'open', task.category, task.planned_start ?? '', task.planned_end ?? '', task.estimated_min, task.actual_start ?? '', task.actual_end ?? '', task.actual_min, '', task.progress ?? '', task.schedule_type ?? ''])
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
  lines.push(`- 할 일 완료율: ${optional(snapshot.overview.task_completion_pct)}${snapshot.overview.task_completion_pct !== null ? '%' : ''}`)
  lines.push(`- 루틴 실행률: ${optional(snapshot.overview.routine_adherence_pct)}${snapshot.overview.routine_adherence_pct !== null ? '%' : ''}`)
  lines.push(`- 예상 작업시간: ${formatHours(snapshot.overview.estimated_task_min)}`)
  lines.push(`- 실제 기록시간: ${formatHours(snapshot.overview.actual_task_min)}`)
  lines.push(`- 실제/예상 시간 비율: ${optional(snapshot.overview.estimation_ratio)}`)
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
    lines.push(`- 할 일: ${day.tasks_done}/${day.tasks_total} (${day.task_completion_pct ?? '-'}%)`)
    lines.push(`- 루틴: ${day.routines_done}/${day.routines_scheduled} (${day.routine_adherence_pct ?? '-'}%)`)
    lines.push(`- 예상/실제 작업시간: ${formatHours(day.estimated_min)} / ${formatHours(day.actual_min)}`)
    lines.push(`- 수면/컨디션/집중: ${optional(day.sleep_hours)} / ${optional(day.condition)} / ${optional(day.focus)}`)
    if (day.top3.length) lines.push(`- Top 3: ${day.top3.join(' / ')}`)
    if (day.note) lines.push(`- 메모: ${day.note}`)
  }
  lines.push('')

  lines.push('## 7. 할 일 상세')
  for (const task of snapshot.tasks) {
    const status = task.discarded ? '폐기' : task.done ? '완료' : '미완료'
    const timing = `예상 ${task.estimated_min ?? '-'}분 / 실제 ${task.actual_min ?? '-'}분`
    lines.push(`- ${task.date} · ${status} · [${task.category}] ${task.text} · ${timing}${task.goal_title ? ` · 목표: ${task.goal_title}` : ''}`)
  }

  if (snapshot.recent_reviews.length) {
    lines.push('')
    lines.push('## 8. 최근 회고')
    for (const review of snapshot.recent_reviews) {
      lines.push(`### ${review.key}`)
      lines.push(review.content)
    }
  }

  lines.push('')
  lines.push('---')
  lines.push('AI 피드백 시 권장 관점: 막연한 격려보다 데이터에 근거해 잘된 행동, 반복되는 실패 패턴, 계획-실행 오차, 회복력, 다음에 바꿀 수 있는 가장 작은 행동을 구체적으로 제시한다.')
  return lines.join('\n')
}
