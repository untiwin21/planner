import type { Task } from '@/types'

/**
 * Actual records created directly from the timeline are activity logs, not plans.
 * The second condition keeps records saved before `actual_only` was introduced
 * out of task lists as well.
 */
export function isActualOnlyTask(task?: Task): boolean {
  if (!task) return false
  return task.actual_only === true || (
    task.actual_status === 'recorded'
    && Boolean(task.actual_start_time)
    && Boolean(task.actual_end_time)
    && !task.start_time
    && !task.time
  )
}
