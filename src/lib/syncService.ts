/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from './supabase'
import type { DayEntry, Routine, RoutineLog, ShortGoal, LongGoal, Task, WeeklyReview } from '@/types'

// FETCH ALL — called on app load
export async function fetchAll(userId: string): Promise<{
  days: DayEntry[]
  routines: Routine[]
  logs: RoutineLog[]
  goals: ShortGoal[]
  longGoals: LongGoal[]
  weeklyReviews: Record<string, string>
}> {
  if (!supabase) return { days: [], routines: [], logs: [], goals: [], longGoals: [], weeklyReviews: {} }
  try {
    const db = supabase as any
    const [
      { data: dayEntriesData, error: dayEntriesError },
      { data: tasksData, error: tasksError },
      { data: routinesData, error: routinesError },
      { data: logsData, error: logsError },
      { data: goalsData, error: goalsError },
      { data: longGoalsData, error: longGoalsError },
      { data: weeklyReviewsData, error: weeklyReviewsError },
    ] = await Promise.all([
      db.from('day_entries').select('*').eq('user_id', userId),
      db.from('tasks').select('*').eq('user_id', userId),
      db.from('routines').select('*').eq('user_id', userId),
      db.from('routine_logs').select('*').eq('user_id', userId),
      db.from('short_goals').select('*').eq('user_id', userId),
      db.from('long_goals').select('*').eq('user_id', userId),
      db.from('weekly_reviews').select('*').eq('user_id', userId),
    ])

    const queryError = [
      dayEntriesError,
      tasksError,
      routinesError,
      logsError,
      goalsError,
      longGoalsError,
      weeklyReviewsError,
    ].find(Boolean)
    if (queryError) throw new Error(`fetchAll failed: ${queryError.message}`)

    // Legacy tasks table — used as fallback when embedded tasks aren't present yet
    const legacyTasks: any[] = tasksData || []

    const days: DayEntry[] = (dayEntriesData || []).map((entry: any) => {
      const meta = entry.meta ?? {}
      // Primary: tasks embedded in meta._tasks (no schema change needed)
      // Fallback: tasks table (legacy, may silently fail on some setups)
      const hasMeta_tasks = '_tasks' in meta
      const { _tasks, ...cleanMeta } = meta
      const embeddedTasks: any[] = hasMeta_tasks
        ? (_tasks ?? [])
        : legacyTasks.filter((t: any) => t.day_id === entry.id && !t.goal_id)
      return {
        ...entry,
        meta: cleanMeta,
        tasks: embeddedTasks.filter((task: any) => !task.deleted_at),
        task_tombstones: embeddedTasks.filter((task: any) => !!task.deleted_at),
        categories: [],
      }
    })

    const goals: ShortGoal[] = (goalsData || []).map((goal: any) => {
      // Primary: tasks embedded in short_goals.tasks column (only if non-empty array)
      // Fallback: tasks table (legacy) — used if embedded column missing or empty
      const embedded: any[] = Array.isArray(goal.tasks) ? goal.tasks : []
      const fromLegacy = legacyTasks.filter((t: any) => t.goal_id === goal.id)
      const goalTaskRecords: any[] = embedded.length > 0 ? embedded : fromLegacy
      const goalTasks = goalTaskRecords.filter((task: any) => !task.deleted_at)
      const taskTombstones = goalTaskRecords.filter((task: any) => !!task.deleted_at)
      const goalNotes: any[] = Array.isArray(goal.notes) ? goal.notes : (goal.notes ?? [])
      // Diagnostic log so user can verify what Supabase actually returns
      console.log(`[Planr] fetchAll goal ${goal.id}: embedded=${embedded.length} legacy=${fromLegacy.length} using=${embedded.length > 0 ? 'embedded' : 'legacy'}`,
        goalTasks.map((t: any) => ({ id: t.id, text: t.text?.slice(0, 20), done: t.done })))
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
export async function upsertDayEntry(userId: string, entry: DayEntry): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { id, date, note, meta, tasks, task_tombstones } = entry
  const metaWithTasks = { ...(meta ?? {}), _tasks: [...(tasks ?? []), ...(task_tombstones ?? [])] }
  const { error } = await db.from('day_entries').upsert(
    { id, user_id: userId, date, note, meta: metaWithTasks },
    { onConflict: 'user_id,date' },
  )
  if (error) {
    console.error('Error upserting day entry:', error.message, error)
    throw new Error(`upsertDayEntry failed: ${error.message}`)
  }
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
  const { id, name, status, created_at, time, order, period, updated_at } = routine
  const { error } = await db.from('routines').upsert({
    id, user_id: userId, name, status, created_at,
    time: time ?? null, order: order ?? 0, period: period ?? 'anytime',
    updated_at: updated_at ?? null,
  })
  if (error) {
    if (error.code === '42703' || (error.message && error.message.includes('column'))) {
      // Existing deployments may have the extended routine fields but not the
      // newest timestamp column. Preserve those fields whenever possible.
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
    } else {
      console.error('Error upserting routine:', error.message, error)
      throw new Error(`upsertRoutine failed: ${error.message}`)
    }
  }
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
  const { id, routine_id, date, done, updated_at } = log
  const { error } = await db.from('routine_logs').upsert(
    {
      id, user_id: userId, routine_id, date, done,
      updated_at: updated_at ?? null,
    },
    { onConflict: 'user_id,routine_id,date' },
  )
  if (error) {
    if (error.code === '42703' || (error.message && error.message.includes('column'))) {
      // Fallback for instances where updated_at column hasn't been added yet.
      const { error: e2 } = await db.from('routine_logs').upsert(
        { id, user_id: userId, routine_id, date, done },
        { onConflict: 'user_id,routine_id,date' },
      )
      if (e2) {
        console.error('Error upserting routine log (fallback):', e2.message, e2)
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
