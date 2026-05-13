import type { Task } from '@/types'

/**
 * Equal-weight progress: each top-level task has equal weight (1/N).
 * If a task has subtasks, its weight is split equally among them.
 *
 * Example: 2 tasks, one has 2 subtasks →
 *   Task A (no sub): weight = 50%, completing it → +50%
 *   Task B (2 subs): each subtask = 25%, completing one → +25%
 */
export function taskWeight(task: Task): number {
  const subs = task.subtasks ?? []
  if (subs.length === 0) {
    return task.done ? 1 : 0
  }
  const doneSubs = subs.filter(s => s.done).length
  return doneSubs / subs.length
}

export function tasksProgress(tasks: Task[]): { done: number; total: number; pct: number } {
  const total = tasks.length
  if (total === 0) return { done: 0, total: 0, pct: 0 }
  let doneWeight = 0
  for (const t of tasks) {
    doneWeight += taskWeight(t)
  }
  return { done: doneWeight, total, pct: Math.round((doneWeight / total) * 100) }
}
