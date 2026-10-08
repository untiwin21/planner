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
  task?: Task
  goal?: ShortGoal
}
export const DETAILS_MARKER = '__schedule_details__'
export function scheduleCards(days: DayEntry[], goals: ShortGoal[]): ScheduleCard[] {
  return [
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
}
export function fourWeekCards(cards: ScheduleCard[], from: string) {
  const to = shiftDate(from, 27)
  return cards.filter(card => card.from <= to && card.to >= from)
}
export function dependencyState(card: ScheduleCard, all: ScheduleCard[]) {
  return (card.details.dependencies ?? []).map(dep => {
    const source = all.find(c => c.id === dep.id)
    const satisfied = dep.requirement === 'passed' ? source?.details.result === 'passed' : !!source?.task?.done
    return { ...dep, title: source?.title ?? '선행 일정 확인 필요', satisfied,
      failed: dep.requirement === 'passed' && source?.details.result === 'failed' }
  })
}
