/* eslint-disable @typescript-eslint/no-explicit-any */
import { mergeDayMeta, localNoteIsNewer } from './dayMetaSync'
import { supabase } from './supabase'
import { hydrateDays, legacyTasksFor, readRows } from './plannerQueries'
import { latestWriter, sameJson } from './syncEfficiency'
import type { DayEntry, Routine, RoutineLog, ShortGoal, LongGoal, Task, WeeklyReview } from '@/types'

const reads = new WeakMap<object, Map<string, ReturnType<typeof loadAll>>>()
// Share only in-flight reads. Completed snapshots are never cached, so reads
// after an assistant/browser edit always see the server's current records.
export function fetchAll(userId: string, client = supabase, range?: { from: string; to: string }) {
  if (!client) return loadAll(userId, client, range)
  let requests = reads.get(client)
  if (!requests) { requests = new Map(); reads.set(client, requests) }
  const key = JSON.stringify([userId, range])
  const existing = requests.get(key)
  if (existing) return existing
  const request = loadAll(userId, client, range).finally(() => requests!.delete(key))
  requests.set(key, request)
  return request
}

async function loadAll(userId: string, client = supabase, range?: { from: string; to: string }): Promise<{
  days: DayEntry[]
  routines: Routine[]
  logs: RoutineLog[]
  goals: ShortGoal[]
  longGoals: LongGoal[]
  weeklyReviews: Record<string, string>
}> {
  if (!client) return { days: [], routines: [], logs: [], goals: [], longGoals: [], weeklyReviews: {} }
  try {
    const db = client as any
    const [dayEntriesData, routinesData, logsData, goalsData, longGoalsData, weeklyReviewsData] = await Promise.all([
      readRows(() => {
        const query = db.from('day_entries').select('id,date,note,meta').eq('user_id', userId)
        return range ? query.gte('date', range.from).lte('date', range.to) : query
      }),
      readRows(() => db.from('routines').select('*').eq('user_id', userId)),
      readRows(() => {
        const query = db.from('routine_logs').select('*').eq('user_id', userId)
        return range ? query.gte('date', range.from).lte('date', range.to) : query
      }),
      // Goal prerequisites may be outside the requested dates.
      readRows(() => db.from('short_goals').select('*').eq('user_id', userId)),
      range ? Promise.resolve([]) : readRows(() => db.from('long_goals').select('*').eq('user_id', userId)),
      readRows(() => {
        const query = db.from('weekly_reviews').select('id,week_key,content').eq('user_id', userId)
        return range ? query.eq('week_key', '__categories__') : query
      }),
    ])
    const [legacyDays, legacyGoals] = await Promise.all([
      legacyTasksFor(userId, 'day_id', dayEntriesData.filter(row => !('_tasks' in (row.meta ?? {}))).map(row => row.id), client),
      legacyTasksFor(userId, 'goal_id', goalsData.filter(goal => !Array.isArray(goal.tasks) || !goal.tasks.length).map(goal => goal.id), client),
    ])
    const days = hydrateDays(dayEntriesData, legacyDays)
    const legacyTasks = legacyGoals

    const goals: ShortGoal[] = (goalsData || []).map((goal: any) => {
      // Primary: tasks embedded in short_goals.tasks column (only if non-empty array)
      // Fallback: tasks table (legacy) — used if embedded column missing or empty
      const embedded: any[] = Array.isArray(goal.tasks) ? goal.tasks : []
      const fromLegacy = legacyTasks.filter((t: any) => t.goal_id === goal.id)
      const goalTaskRecords: any[] = embedded.length > 0 ? embedded : fromLegacy
      const goalTasks = goalTaskRecords.filter((task: any) => !task.deleted_at)
      const taskTombstones = goalTaskRecords.filter((task: any) => !!task.deleted_at)
      const goalNotes: any[] = Array.isArray(goal.notes) ? goal.notes : (goal.notes ?? [])
      return { ...goal, tasks: goalTasks, task_tombstones: taskTombstones, notes: goalNotes }
    })

    const weeklyReviews: Record<string, string> = (weeklyReviewsData || []).reduce(
      (acc: Record<string, string>, review: any) => {
        acc[review.week_key] = review.content
        return acc
      },
      {},
    )

    return {
      days,
      routines: routinesData || [],
      logs: logsData || [],
      goals,
      longGoals: longGoalsData || [],
      weeklyReviews,
    }
  } catch (error) {
    console.error('Error fetching all data:', error)
    // Callers must be able to distinguish an actual empty account from a
    // transient read failure. Treating an error as empty can erase local data.
    throw error
  }
}

// UPSERT operations — these THROW on actual Supabase failure so callers
// can track dirty state correctly. Network/transient errors propagate up.
const writeDay = latestWriter<{ userId: string; entry: DayEntry }>((_key, { userId, entry }) => persistDayEntry(userId, entry))
export function upsertDayEntry(userId: string, entry: DayEntry): Promise<void> {
  return writeDay(JSON.stringify([userId, entry.date]), { userId, entry })
}
async function persistDayEntry(userId: string, entry: DayEntry): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { id, date, note, meta, tasks, task_tombstones } = entry
  const localRecords = [...(tasks ?? []), ...(task_tombstones ?? [])]
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: remote, error: readError } = await db.from('day_entries').select('id,note,meta').eq('user_id', userId).eq('date', date).maybeSingle()
    if (readError) throw new Error(`upsertDayEntry read failed: ${readError.message}`)
    if (!remote) {
      const { error } = await db.from('day_entries').insert({ id, user_id: userId, date, note, meta: { ...meta, _tasks: localRecords } })
      if (error?.code === '23505') continue
      if (error) throw new Error(`upsertDayEntry failed: ${error.message}`)
      return
    }
    const remoteMeta = remote.meta ?? {}
    const remoteTasks = '_tasks' in remoteMeta ? remoteMeta._tasks ?? [] : await legacyTasksFor(userId, 'day_id', [remote.id])
    const records = new Map<string, Task>(remoteTasks.map((task: Task) => [task.id, task]))
    for (const task of localRecords) {
      const existing = records.get(task.id)
      if (!existing || (task.updated_at ?? 0) >= (existing.updated_at ?? 0)) records.set(task.id, { ...task, day_id: remote.id })
    }
    const mergedMeta = { ...mergeDayMeta(meta, remoteMeta), _tasks: [...records.values()] }
    const mergedNote = localNoteIsNewer(meta, remoteMeta) ? note : remote.note
    if (sameJson(mergedMeta, remoteMeta) && mergedNote === remote.note) return
    const { data: sessionData } = await db.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) throw new Error('upsertDayEntry failed: sign-in required')
    const response = await fetch('/api/sync/day', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: remote.id, expected: remoteMeta, next: mergedMeta,
        note: mergedNote, expectedNote: remote.note }),
    })
    if (!response.ok) throw new Error(`upsertDayEntry failed: sync returned ${response.status}`)
    const { saved } = await response.json()
    const data = saved ? [remote.id] : []
    if (data?.length) return
  }
  throw new Error('upsertDayEntry failed: concurrent edits; retry required')
}

export async function upsertTask(userId: string, task: Task, _contextId: string): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { id, text, done, category_id, category_name, category_color, time, subtasks } = task
  const record: any = {
    id, user_id: userId,
    day_id: task.day_id, goal_id: task.goal_id,
    text, done, category_id, category_name, category_color,
    subtasks: subtasks ?? [],
  }
  if (time !== undefined) record.time = time
  const { error } = await db.from('tasks').upsert(record)
  if (error) {
    console.error('Error upserting task:', error.message, error)
    throw new Error(`upsertTask failed: ${error.message}`)
  }
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { error } = await db.from('tasks').delete().eq('id', taskId).eq('user_id', userId)
  if (error) {
    console.error('Error deleting task:', error.message, error)
    throw new Error(`deleteTask failed: ${error.message}`)
  }
}

export async function upsertRoutine(userId: string, routine: Routine): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { id, name, status, created_at, time, order, period, config, updated_at } = routine
  const baseRecord = {
    id, user_id: userId, name, status, created_at,
    time: time ?? null, order: order ?? 0, period: period ?? 'anytime', config: config ?? {},
  }
  const { error } = await db.from('routines').upsert({
    ...baseRecord,
    updated_at: updated_at ?? null,
  })
  if (!error) return

  if (error.code === '42703' || (error.message && error.message.includes('column'))) {
    // The routine timeline migration added `config` before `updated_at` existed.
    // On those databases, retry WITHOUT the timestamp but keep config. The old
    // fallback dropped config too, so kind/category/days edits appeared to save
    // and then rolled back on the next sync.
    const { error: withoutTimestampError } = await db.from('routines').upsert(baseRecord)
    if (!withoutTimestampError) return

    // Truly old schemas may also lack config/time/order/period. Keep the legacy
    // fallback only as a last resort instead of silently discarding modern
    // routine settings whenever updated_at alone is missing.
    const { error: extendedError } = await db.from('routines').upsert({
      id, user_id: userId, name, status, created_at,
      time: time ?? null, order: order ?? 0, period: period ?? 'anytime',
    })
    if (!extendedError) return

    const { error: e2 } = await db.from('routines').upsert({ id, user_id: userId, name, status, created_at })
    if (e2) {
      console.error('Error upserting routine (fallback):', e2.message, e2)
      throw new Error(`upsertRoutine fallback failed: ${e2.message}`)
    }
    return
  }

  console.error('Error upserting routine:', error.message, error)
  throw new Error(`upsertRoutine failed: ${error.message}`)
}

export async function deleteRoutine(userId: string, routineId: string): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { error } = await db.from('routines').delete().eq('id', routineId).eq('user_id', userId)
  if (error) {
    console.error('Error deleting routine:', error.message, error)
    throw new Error(`deleteRoutine failed: ${error.message}`)
  }
}

export async function upsertRoutineLog(userId: string, log: RoutineLog): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { id, routine_id, date, done, completion, actual_start_time, actual_end_time, updated_at } = log
  const { error } = await db.from('routine_logs').upsert(
    {
      id, user_id: userId, routine_id, date, done, completion: completion ?? null,
      actual_start_time: actual_start_time ?? null,
      actual_end_time: actual_end_time ?? null,
      updated_at: updated_at ?? null,
    },
    { onConflict: 'user_id,routine_id,date' },
  )
  if (error) {
    if (error.code === '42703' || (error.message && error.message.includes('column'))) {
      // Preserve completion and LWW fields when only actual-time columns are
      // missing, then fall back once more for older schemas.
      const { error: withoutActualError } = await db.from('routine_logs').upsert(
        {
          id, user_id: userId, routine_id, date, done, completion: completion ?? null,
          updated_at: updated_at ?? null,
        },
        { onConflict: 'user_id,routine_id,date' },
      )
      if (!withoutActualError) return
      const { error: e2 } = await db.from('routine_logs').upsert(
        { id, user_id: userId, routine_id, date, done },
        { onConflict: 'user_id,routine_id,date' },
      )
      if (e2) {
        console.error('Error upserting routine log (legacy fallback):', e2.message, e2)
        throw new Error(`upsertRoutineLog fallback failed: ${e2.message}`)
      }
      return
    }
    console.error('Error upserting routine log:', error.message, error)
    throw new Error(`upsertRoutineLog failed: ${error.message}`)
  }
}

export async function upsertShortGoal(userId: string, goal: ShortGoal): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { id, title, date_from, date_to, note, long_goal_id, routines, categories, tasks, task_tombstones, notes, updated_at } = goal
  const taskRecords = [...(tasks ?? []), ...(task_tombstones ?? [])]

  // Try embedded path: short_goals.tasks + short_goals.notes columns
  const { error } = await db.from('short_goals').upsert({
    id, user_id: userId, title, date_from, date_to, note,
    long_goal_id, routines, categories,
    tasks: taskRecords,
    notes: notes ?? [],
    updated_at: updated_at ?? null,
  })

  if (!error) {
    console.log('[Planr] goal saved (embedded):', id, `tasks=${taskRecords.length}`)
    return
  }

  // Column missing → fallback: save goal metadata without tasks/notes, then push tasks to legacy table
  if (error.code === '42703' || (error.message && error.message.includes('column'))) {
    // Most older databases already have embedded tasks/notes and only lack
    // updated_at. Retry that shape before falling back to the legacy task table.
    const { error: withoutTimestampError } = await db.from('short_goals').upsert({
      id, user_id: userId, title, date_from, date_to, note,
      long_goal_id, routines, categories,
      tasks: taskRecords,
      notes: notes ?? [],
    })
    if (!withoutTimestampError) return
    console.warn('[Planr] ⚠️ short_goals.tasks 컬럼이 없습니다! Supabase SQL Editor에서 실행:')
    console.warn('[Planr] alter table short_goals add column if not exists tasks jsonb default \'[]\';')
    const { error: e2 } = await db.from('short_goals').upsert({
      id, user_id: userId, title, date_from, date_to, note,
      long_goal_id, routines, categories,
    })
    if (e2) {
      console.error('Error upserting short goal (fallback):', e2.message, e2)
      throw new Error(`upsertShortGoal fallback failed: ${e2.message}`)
    }
    // CRITICAL: also write each task to legacy tasks table so done states persist
    if (taskRecords.length > 0) {
      const results = await Promise.all(taskRecords.filter(t => !t.deleted_at).map((t: any) => {
        const record: any = {
          id: t.id, user_id: userId, day_id: t.day_id, goal_id: t.goal_id ?? id,
          text: t.text, done: t.done, category_id: t.category_id,
          category_name: t.category_name, category_color: t.category_color,
          subtasks: t.subtasks ?? [],
        }
        if (t.time !== undefined) record.time = t.time
        return db.from('tasks').upsert(record)
      }))
      const failed = results.find((r: any) => r.error)
      if (failed) {
        console.error('Error upserting goal task to legacy table:', failed.error.message)
        throw new Error(`upsertShortGoal task fallback failed: ${failed.error.message}`)
      }
    }
    return
  }

  // Any other error → propagate so caller can keep dirty state
  console.error('Error upserting short goal:', error.message, error)
  throw new Error(`upsertShortGoal failed: ${error.message}`)
}

export async function deleteShortGoal(userId: string, goalId: string): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { error } = await db.from('short_goals').delete().eq('id', goalId).eq('user_id', userId)
  if (error) {
    console.error('Error deleting short goal:', error.message, error)
    throw new Error(`deleteShortGoal failed: ${error.message}`)
  }
}

export async function upsertLongGoal(userId: string, goal: LongGoal): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { id, title, description, date_from, date_to, color, updated_at } = goal
  const { error } = await db
    .from('long_goals')
    .upsert({ id, user_id: userId, title, description, date_from, date_to, color, updated_at: updated_at ?? null })
  if (error) {
    if (error.code === '42703' || (error.message && error.message.includes('column'))) {
      const { error: fallbackError } = await db
        .from('long_goals')
        .upsert({ id, user_id: userId, title, description, date_from, date_to, color })
      if (!fallbackError) return
    }
    console.error('Error upserting long goal:', error.message, error)
    throw new Error(`upsertLongGoal failed: ${error.message}`)
  }
}

export async function deleteLongGoal(userId: string, goalId: string): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { error } = await db.from('long_goals').delete().eq('id', goalId).eq('user_id', userId)
  if (error) {
    console.error('Error deleting long goal:', error.message, error)
    throw new Error(`deleteLongGoal failed: ${error.message}`)
  }
}

export async function upsertWeeklyReview(
  userId: string,
  weekKey: string,
  content: string,
): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  // weekly_reviews.id has no database default in the original schema. The old
  // insert omitted it, so categories/Big 3/reviews could remain local to one
  // browser. A deterministic id plus the declared unique key makes this a real
  // cross-device key/value record and remains compatible with existing rows.
  const id = `review:${userId}:${weekKey}`
  const { error } = await db.from('weekly_reviews').upsert(
    { id, user_id: userId, week_key: weekKey, content },
    { onConflict: 'user_id,week_key' },
  )
  if (error) {
    console.error('Error upserting weekly review:', error.message, error)
    throw new Error(`upsertWeeklyReview failed: ${error.message}`)
  }
}
