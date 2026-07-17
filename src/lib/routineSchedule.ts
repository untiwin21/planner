import { parseISO } from 'date-fns'
import { timeToMinutes } from '@/lib/plannerTime'
import type { BadgeColor, Routine, RoutineConfig, RoutinePeriod, RoutineStage } from '@/types'

export const ROUTINE_WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const
export const ROUTINE_PERIOD_ORDER: RoutinePeriod[] = ['morning', 'afternoon', 'evening', 'anytime']
export const ROUTINE_PERIOD_LABELS: Record<RoutinePeriod, string> = {
  morning: '아침',
  afternoon: '오후',
  evening: '저녁',
  anytime: '언제든',
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

export function routineConfig(routine: Routine): Required<Pick<RoutineConfig, 'days_of_week' | 'duration_min' | 'cue_type' | 'stage' | 'category_color'>> & RoutineConfig {
  const config = routine.config ?? {}
  const validDays = config.days_of_week?.filter(day => Number.isInteger(day) && day >= 0 && day <= 6) ?? []
  return {
    ...config,
    days_of_week: validDays.length ? validDays : EVERY_DAY,
    duration_min: Math.max(5, config.duration_min ?? 15),
    cue_type: config.cue_type ?? (routine.time ? 'time' : 'event'),
    stage: config.stage ?? 'maintenance',
    category_color: config.category_color ?? 'amber',
  }
}

export function routineStage(routine: Routine): RoutineStage {
  return routineConfig(routine).stage
}

export function routineWeekday(date: string): number {
  return (parseISO(date).getDay() + 6) % 7
}

export function isRoutineScheduledOn(routine: Routine, date: string): boolean {
  if (routine.status !== 'active') return false
  const config = routineConfig(routine)
  return config.stage !== 'backlog' && config.days_of_week.includes(routineWeekday(date))
}

export function routineStartMinute(routine: Routine, timelineStart = 5 * 60): number | null {
  if (!routine.time) return null
  const minute = timeToMinutes(routine.time)
  if (minute === null) return null
  return minute < timelineStart ? minute + 24 * 60 : minute
}

export function routineColor(routine: Routine): BadgeColor {
  return routineConfig(routine).category_color
}

export function routineBundleLabel(routine: Routine): string {
  const config = routineConfig(routine)
  return config.bundle?.trim() || routine.name
}
