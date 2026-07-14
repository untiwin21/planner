import type { Task } from '@/types'
import { SCHEDULE_CAT_ID } from '@/types'

export const DEFAULT_DAY_START = '05:00'
export const DEFAULT_DAY_END = '25:00'
export const DEFAULT_FLEX_DURATION = 60
export const DEFAULT_FIXED_DURATION = 60

export function timeToMinutes(value?: string): number | null {
  if (!value) return null
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || hours > 25 || minutes < 0 || minutes > 59) return null
  if (hours >= 24 && minutes !== 0) return null
  return hours * 60 + minutes
}

export function minutesToTime(value: number): string {
  const clamped = Math.max(0, Math.min(25 * 60, Math.round(value)))
  const hours = Math.floor(clamped / 60) % 24
  const minutes = clamped % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}분`
  if (rest === 0) return `${hours}시간`
  return `${hours}시간 ${rest}분`
}

export function getTaskStart(task: Task): number | null {
  return timeToMinutes(task.start_time ?? task.time)
}

export function getTaskDuration(task: Task): number {
  const explicit = Number(task.duration_min)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  const start = getTaskStart(task)
  const end = timeToMinutes(task.end_time)
  if (start !== null && end !== null && end > start) return end - start
  return isFixedTask(task) ? DEFAULT_FIXED_DURATION : DEFAULT_FLEX_DURATION
}

export function getTaskEnd(task: Task): number | null {
  const start = getTaskStart(task)
  if (start === null) return null
  const explicit = timeToMinutes(task.end_time)
  return explicit !== null && explicit > start ? explicit : Math.min(25 * 60, start + getTaskDuration(task))
}

export function isFixedTask(task: Task): boolean {
  return task.fixed === true || task.category_id === SCHEDULE_CAT_ID
}

export interface TimeBlock {
  task: Task
  start: number
  end: number
}

export interface FreeBlock {
  start: number
  end: number
}

export function fixedBlocks(tasks: Task[], windowStart: number, windowEnd: number): TimeBlock[] {
  return tasks
    .filter(task => !task.done && isFixedTask(task))
    .map(task => {
      const rawStart = getTaskStart(task)
      const rawEnd = getTaskEnd(task)
      if (rawStart === null || rawEnd === null) return null
      const crossesMidnightWindow = windowEnd > 24 * 60 && rawStart < windowStart
      const start = crossesMidnightWindow ? rawStart + 24 * 60 : rawStart
      const end = crossesMidnightWindow ? rawEnd + 24 * 60 : rawEnd
      const clippedStart = Math.max(windowStart, start)
      const clippedEnd = Math.min(windowEnd, end)
      if (clippedEnd <= clippedStart) return null
      return { task, start: clippedStart, end: clippedEnd }
    })
    .filter((block): block is TimeBlock => block !== null)
    .sort((a, b) => a.start - b.start || a.end - b.end)
}

export function mergeBusyBlocks(blocks: TimeBlock[]): Array<{ start: number; end: number }> {
  const merged: Array<{ start: number; end: number }> = []
  for (const block of blocks) {
    const last = merged[merged.length - 1]
    if (!last || block.start > last.end) merged.push({ start: block.start, end: block.end })
    else last.end = Math.max(last.end, block.end)
  }
  return merged
}

export function freeBlocks(tasks: Task[], windowStart: number, windowEnd: number): FreeBlock[] {
  const result: FreeBlock[] = []
  let cursor = windowStart
  for (const block of mergeBusyBlocks(fixedBlocks(tasks, windowStart, windowEnd))) {
    if (block.start > cursor) result.push({ start: cursor, end: block.start })
    cursor = Math.max(cursor, block.end)
  }
  if (cursor < windowEnd) result.push({ start: cursor, end: windowEnd })
  return result
}

export function remainingCapacity(
  tasks: Task[],
  dayStart: string,
  dayEnd: string,
  nowMinutes?: number,
) {
  const start = timeToMinutes(dayStart) ?? timeToMinutes(DEFAULT_DAY_START)!
  const end = timeToMinutes(dayEnd) ?? timeToMinutes(DEFAULT_DAY_END)!
  const normalizedNow = nowMinutes !== undefined && end > 24 * 60 && nowMinutes < end - 24 * 60
    ? nowMinutes + 24 * 60
    : nowMinutes
  const effectiveStart = Math.min(end, Math.max(start, normalizedNow ?? start))
  const free = freeBlocks(tasks, effectiveStart, end)
  const availableMinutes = free.reduce((sum, block) => sum + block.end - block.start, 0)
  const flexibleTasks = tasks.filter(task => !task.done && !isFixedTask(task))
  const flexibleMinutes = flexibleTasks.reduce((sum, task) => sum + getTaskDuration(task), 0)
  return {
    start,
    end,
    effectiveStart,
    free,
    availableMinutes,
    flexibleMinutes,
    overloadMinutes: Math.max(0, flexibleMinutes - availableMinutes),
  }
}
