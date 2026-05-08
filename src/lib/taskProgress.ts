import type { Task } from '@/types'

export function taskWeight(task: Task): { done: number; total: number } {
  const subs = task.subtasks ?? []
  if (subs.length === 0) {
    return { done: task.done ? 1 : 0, total: 1 }
  }
  return { done: subs.filter(s => s.done).length, total: subs.length }
}

export function tasksProgress(tasks: Task[]): { done: number; total: number; pct: number } {
  let done = 0, total = 0
  for (const t of tasks) {
    const w = taskWeight(t)
    done += w.done
    total += w.total
  }
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
}
