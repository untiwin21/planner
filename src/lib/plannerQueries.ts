import type { DayEntry, Task } from '@/types'
import { supabase } from './supabase'

// Stable pagination avoids silently losing records at Supabase's row limit.
export async function readRows(query: () => any): Promise<any[]> {
  const rows: any[] = []
  const size = 500
  for (let offset = 0; ; offset += size) {
    const { data, error } = await query().order('id').range(offset, offset + size - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < size) return rows
  }
}

export function hydrateDays(rows: any[], legacy: Task[]): DayEntry[] {
  const byDay = new Map<string, Task[]>()
  for (const task of legacy) {
    if (!task.day_id || task.goal_id) continue
    const tasks = byDay.get(task.day_id) ?? []
    tasks.push(task)
    byDay.set(task.day_id, tasks)
  }
  return rows.map(row => {
    const { _tasks, ...meta } = row.meta ?? {}
    const tasks: Task[] = '_tasks' in (row.meta ?? {}) ? (_tasks ?? []) : (byDay.get(row.id) ?? [])
    return { ...row, meta, tasks: tasks.filter(t => !t.deleted_at), task_tombstones: tasks.filter(t => !!t.deleted_at), categories: [] }
  })
}

export async function legacyTasksFor(userId: string, field: 'day_id' | 'goal_id', ids: string[], client = supabase) {
  const db = client as any
  const tasks: Task[] = []
  // Keep URLs bounded even for an old account with years of daily rows.
  for (let i = 0; i < ids.length; i += 50) {
    tasks.push(...await readRows(() => {
      const query = db.from('tasks').select('*').eq('user_id', userId).in(field, ids.slice(i, i + 50))
      return field === 'day_id' ? query.is('goal_id', null) : query
    }))
  }
  return tasks
}

export async function fetchCategories(userId: string, client = supabase) {
  if (!client) return []
  const { data, error } = await client.from('weekly_reviews').select('content').eq('user_id', userId).eq('week_key', '__categories__').maybeSingle()
  if (error) throw new Error(error.message)
  try {
    const parsed = JSON.parse(data?.content ?? '[]')
    return Array.isArray(parsed) ? parsed : parsed.items ?? []
  } catch { return [] }
}

// Read only schedule-bearing JSON, never historical notes/feedback/wellness.
// Keep earlier days: imported fixed tasks may span more than one midnight.
export async function fetchScheduleDays(userId: string, to: string, client = supabase): Promise<DayEntry[]> {
  if (!client) return []
  const db = client as any
  const rows = await readRows(() => db.from('day_entries').select('id,date,records:meta->_tasks').eq('user_id', userId).lte('date', to))
  const legacy = await legacyTasksFor(userId, 'day_id', rows.filter(row => row.records == null).map(row => row.id), client)
  return hydrateDays(rows.map(({ records, ...row }) => ({ ...row, meta: records == null ? {} : { _tasks: records } })), legacy)
}

// Resolve only referenced historical tasks. Loading every past journal entry to
// determine whether one prerequisite failed used to dominate assistant traffic.
export async function fetchDependencyDays(userId: string, taskId: string, client = supabase): Promise<DayEntry[]> {
  const db = client as any
  const onlyDependency = (days: DayEntry[]) => days.map(day => ({ ...day, tasks: day.tasks.filter(task => task.id === taskId), task_tombstones: [] }))
  const rows = await readRows(() => db.from('day_entries').select('id,date,meta').eq('user_id', userId).contains('meta', { _tasks: [{ id: taskId }] }))
  if (rows.length) return onlyDependency(hydrateDays(rows, []))
  const legacy = await readRows(() => db.from('tasks').select('*').eq('user_id', userId).eq('id', taskId).is('goal_id', null))
  if (!legacy.length) return []
  const days = await readRows(() => db.from('day_entries').select('id,date,meta').eq('user_id', userId).in('id', legacy.map(task => task.day_id)))
  // An embedded snapshot, including its tombstones, always overrides legacy data.
  return onlyDependency(hydrateDays(days, legacy))
}
