import type { Task } from '@/types'

/**
 * Actual records created directly from the timeline are activity logs, not plans.
 * Only the explicit flag is reliable here: a normal planned task can also have
 * actual start/end times without having a planned start time.
 */
export function isActualOnlyTask(task?: Task): boolean {
  if (!task) return false
  return task.actual_only === true
}
