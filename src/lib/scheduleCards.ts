import type { DayEntry, ScheduleDetails, ShortGoal, Task } from '@/types'
import { DEADLINE_CAT_ID, SCHEDULE_CAT_ID } from '@/types'
import { shortGoalCategory } from './planCategory'
import { shiftDate } from './scheduleConflicts'

export interface ScheduleCard {
  id: string
  title: string
  from: string
  to: string
  kind: 'event' | 'deadline'
  visibility: 'public' | 'private'
  details: ScheduleDetails
  discardedBy?: string
  task?: Task
  goal?: ShortGoal
}
export const DETAILS_MARKER = '__schedule_details__'
export function isStandaloneScheduleCard(goal: ShortGoal) {
  return !!goal.categories?.find(c => c.id === DETAILS_MARKER)?.details?.timing
}
export function scheduleCards(days: DayEntry[], goals: ShortGoal[]): ScheduleCard[] {
  const cards: ScheduleCard[] = [
    ...days.flatMap(day => day.tasks.filter(t => !t.deleted_at && !t.discarded && !t.actual_only && [SCHEDULE_CAT_ID, DEADLINE_CAT_ID].includes(t.category_id)).map(task => ({
      id: task.id, title: task.text, kind: task.category_id === DEADLINE_CAT_ID ? 'deadline' : 'event', from: day.date, to: day.date,
      visibility: task.schedule_details?.visibility ?? (task.schedule_type === 'external' ? 'public' : 'private'),
      details: { ...task.schedule_details, ...(task.category_id === DEADLINE_CAT_ID && !task.schedule_details?.due_time && (task.start_time || task.time) ? { due_time: task.start_time || task.time } : {}) }, task,
    } as ScheduleCard))),
    ...goals.map(goal => {
      const details: ScheduleDetails = goal.categories?.find(c => c.id === DETAILS_MARKER)?.details ?? {}
      return { id: goal.id, title: goal.title, kind: details.kind ?? 'event', from: details.kind === 'deadline' ? goal.date_to : goal.date_from, to: goal.date_to,
        visibility: details.visibility ?? (shortGoalCategory(goal) === 'external' ? 'public' : 'private'), details, goal } as ScheduleCard
    }),
  ].sort((a, b) => a.from.localeCompare(b.from) || (a.task?.start_time ?? a.task?.time ?? '99:99').localeCompare(b.task?.start_time ?? b.task?.time ?? '99:99') || a.id.localeCompare(b.id))
  // Fixed-point traversal propagates failure through every later stage, including
  // completed prerequisites. Missing sources and unknown outcomes never mean failure.
  const unavailable = new Map<string, string>()
  for (const card of cards) if (card.details.result === 'failed') unavailable.set(card.id, card.id)
  let changed = true
  while (changed) {
    changed = false
    for (const card of cards) {
      if (unavailable.has(card.id)) continue
      const failed = card.details.dependencies?.find(dep => unavailable.has(dep.id))
      if (failed) { unavailable.set(card.id, unavailable.get(failed.id)!); changed = true }
    }
  }
  return cards.map(card => ({ ...card, discardedBy: unavailable.get(card.id) }))
}
export function scheduleWeekStart(today: string) {
  const weekday = new Date(today + 'T12:00:00Z').getUTCDay()
  return shiftDate(today, -((weekday + 6) % 7))
}
function approximateWindow(card: ScheduleCard) {
  // Month/week labels can be more precise than legacy month-wide storage bounds.
  const matches = [...(card.details.date_label ?? '').matchAll(/(\d{1,2})월\s*(\d)주차/g)]
  if (matches.length) {
    const year = card.from.slice(0, 4)
    const starts = matches.map(m => shiftDate(scheduleWeekStart(`${year}-${m[1].padStart(2, '0')}-01`), (Number(m[2]) - 1) * 7))
    return { from: starts[0], to: shiftDate(starts[starts.length - 1], 6) }
  }
  return { from: card.goal?.date_from ?? card.from, to: card.to }
}
export function fourWeekCards(cards: ScheduleCard[], today: string) {
  const from = scheduleWeekStart(today), to = shiftDate(from, 27)
  return cards.filter(card => !card.details.hide_from_goal_cards && !card.discardedBy && !['undated', 'window'].includes(card.details.timing ?? '') && card.from <= to && card.to >= today)
}
export function uncertainFourWeekCards(cards: ScheduleCard[], today: string) {
  const from = scheduleWeekStart(today), to = shiftDate(from, 27)
  return cards.filter(card => {
    if (card.details.hide_from_goal_cards || card.discardedBy || card.details.timing !== 'window') return false
    const range = approximateWindow(card)
    return range.from <= to && range.to >= today
  })
}
export function dependencyState(card: ScheduleCard, all: ScheduleCard[]) {
  return (card.details.dependencies ?? []).map(dep => {
    const source = all.find(c => c.id === dep.id)
    const satisfied = !source?.discardedBy && (dep.requirement === 'passed' ? source?.details.result === 'passed' : !!source?.task?.done)
    return { ...dep, title: source?.title ?? '선행 일정 확인 필요', satisfied,
      failed: !!source?.discardedBy || source?.details.result === 'failed' }
  })
}

export function calendarWeekLabel(monday: string) {
  const majorityDate = shiftDate(monday, 3)
  const first = majorityDate.slice(0, 7) + '-01'
  const week = Math.round((Date.parse(monday) - Date.parse(scheduleWeekStart(first))) / 604800000) + 1
  return `${Number(majorityDate.slice(5, 7))}월 ${week}주차`
}
