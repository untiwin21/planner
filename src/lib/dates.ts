import { format, startOfWeek, addDays, isSameDay, parseISO, isWithinInterval } from 'date-fns'
import { ko } from 'date-fns/locale'

export const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일']

export function getWeekDays(date: Date = new Date()): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}


export function formatDisplay(date: Date): string {
  return format(date, 'M월 d일', { locale: ko })
}

export function formatMonth(date: Date): string {
  return format(date, 'yyyy년 M월', { locale: ko })
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date())
}

export function isSameDateStr(date: Date, str: string): boolean {
  return formatDate(date) === str
}

export function isGoalActive(goal: { date_from: string; date_to: string }, date: Date): boolean {
  return isWithinInterval(date, {
    start: parseISO(goal.date_from),
    end: parseISO(goal.date_to),
  })
}

export function dayRangeLabel(from: string, to: string): string {
  const f = parseISO(from)
  const t = parseISO(to)
  const fd = format(f, 'M/d(E)', { locale: ko })
  const td = format(t, 'M/d(E)', { locale: ko })
  return `${fd} — ${td}`
}
