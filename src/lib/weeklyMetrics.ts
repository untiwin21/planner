import type { DayEntry, Task, ShortGoal } from '@/types'
import { SCHEDULE_CAT_ID, DEADLINE_CAT_ID } from '@/types'
import { tasksProgress } from './taskProgress'

export const FOCUS_CATEGORIES = ['Study', 'Project', 'Work'] as const
export function quantile(values: number[], fraction: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * fraction
  const low = Math.floor(position), high = Math.ceil(position)
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low)
}
function minutes(start?: string, end?: string): number | null {
  if (!start || !end || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return null
  const clock = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3))
  if (Number(start.slice(3)) > 59 || Number(end.slice(3)) > 59 || Number(start.slice(0, 2)) > 29 || Number(end.slice(0, 2)) > 29) return null
  let duration = clock(end) - clock(start)
  if (duration < 0) duration += 1440
  return duration > 0 ? duration : null
}
/** Explicit execution only. Sessions take precedence over their stored aggregate/window. */
export function actualMinutes(task: Task): number | null {
  if (task.actual_status === 'skipped') return null
  const sessions = (task.actual_sessions ?? []).filter(s => Number.isFinite(s.duration_min) && s.duration_min > 0)
  if (sessions.length) return sessions.reduce((sum, s) => sum + s.duration_min, 0)
  if (typeof task.actual_duration_min === 'number' && Number.isFinite(task.actual_duration_min) && task.actual_duration_min > 0) return task.actual_duration_min
  if (task.actual_status === 'recorded') {
    const duration = minutes(task.actual_start_time, task.actual_end_time)
    if (duration !== null) return duration
  }
  const children = (task.subtasks ?? []).filter(s => !s.discarded && s.actual_status === 'recorded')
    .map(s => minutes(s.actual_start_time, s.actual_end_time)).filter((m): m is number => m !== null)
  return children.length ? children.reduce((sum, m) => sum + m, 0) : null
}
export function estimatedMinutes(task: Task): number | null {
  if (typeof task.duration_min === 'number' && Number.isFinite(task.duration_min) && task.duration_min > 0) return task.duration_min
  return minutes(task.start_time ?? task.time, task.end_time)
}
function dayTasks(entry: DayEntry | undefined, goals: ShortGoal[]): Task[] {
  if (!entry) return []
  const items = new Map(entry.tasks.map(t => [t.id, t]))
  const linkedTasks = new Set(entry.meta.linkedGoalTaskIds ?? [])
  const linkedSubs = new Set(entry.meta.linkedGoalSubtaskIds ?? [])
  for (const goal of goals.filter(g => g.date_from <= entry.date && g.date_to >= entry.date)) {
    for (const task of goal.tasks) {
      if (task.deleted_at || task.discarded) continue
      if (linkedTasks.has(task.id)) { if (!items.has(task.id)) items.set(task.id, task); continue }
      for (const sub of task.subtasks ?? []) if (linkedSubs.has(sub.id) && !items.has(sub.id)) items.set(sub.id, {
        ...sub, day_id: entry.id, category_id: task.category_id, category_name: task.category_name, category_color: task.category_color,
      })
    }
  }
  return [...items.values()]
}
export function weeklyMetrics(dates: string[], days: DayEntry[], today: string, goals: ShortGoal[] = []) {
  const rows = dates.map(date => {
    const entry = days.find(d => d.date === date)
    const future = date > today
    const tasks = future ? [] : dayTasks(entry, goals).filter(t => !t.deleted_at && !t.discarded)
    const planned = tasks.filter(t => !t.actual_only && t.category_id !== SCHEDULE_CAT_ID && t.category_id !== DEADLINE_CAT_ID)
    const progress = tasksProgress(planned)
    const focus = Object.fromEntries(FOCUS_CATEGORIES.map(category => [category, null])) as Record<typeof FOCUS_CATEGORIES[number], number | null>
    for (const task of tasks) {
      if (task.category_id === SCHEDULE_CAT_ID || task.category_id === DEADLINE_CAT_ID) continue
      const category = FOCUS_CATEGORIES.find(c => c.toLowerCase() === task.category_name?.trim().toLowerCase())
      const actual = actualMinutes(task)
      if (category && actual !== null) focus[category] = (focus[category] ?? 0) + actual
    }
    const ratios = planned.filter(t => t.done).flatMap(t => {
      const actual = actualMinutes(t), estimate = estimatedMinutes(t)
      return actual !== null && estimate !== null ? [actual / estimate * 100] : []
    })
    const rawSleep = entry?.meta.sleep, rawCondition = entry?.meta.condition
    return { date, future, sleep: !future && typeof rawSleep === 'number' && Number.isFinite(rawSleep) && rawSleep >= 0 ? rawSleep / 60 : null,
      condition: !future && typeof rawCondition === 'number' && rawCondition >= 1 && rawCondition <= 5 ? rawCondition : null,
      focus, focusHours: Object.values(focus).some(v => v !== null) ? Object.values(focus).reduce<number>((sum, v) => sum + (v ?? 0), 0) / 60 : null,
      completion: progress.total ? progress.pct : null, progress, calibration: quantile(ratios, .5), ratios }
  })
  const sleeps = rows.flatMap(r => r.sleep === null ? [] : [r.sleep])
  const conditions = rows.flatMap(r => r.condition === null ? [] : [r.condition])
  const ratios = rows.flatMap(r => r.ratios)
  const totals = rows.reduce((p, r) => ({ done: p.done + r.progress.done, total: p.total + r.progress.total }), { done: 0, total: 0 })
  return { rows, sleepMean: sleeps.length ? sleeps.reduce((s, v) => s + v, 0) / sleeps.length : null, sleepDays: sleeps.length,
    sleepSd: sleeps.length > 1 ? Math.sqrt(sleeps.reduce((s, v) => s + (v - sleeps.reduce((s, v) => s + v, 0) / sleeps.length) ** 2, 0) / (sleeps.length - 1)) : null,
    conditionMedian: quantile(conditions, .5), conditionDays: conditions.length,
    focusHours: rows.some(r => r.focusHours !== null) ? rows.reduce((sum, r) => sum + (r.focusHours ?? 0), 0) : null,
    focusDays: rows.filter(r => r.focusHours !== null).length,
    completion: totals.total ? Math.round(totals.done / totals.total * 100) : null, plannedCount: totals.total,
    calibrationMedian: quantile(ratios, .5), calibrationQ1: quantile(ratios, .25), calibrationQ3: quantile(ratios, .75), calibrationCount: ratios.length }
}
