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
      { data: dayEntriesData },
      { data: tasksData },
      { data: routinesData },
      { data: logsData },
      { data: goalsData },
      { data: longGoalsData },
      { data: weeklyReviewsData },
    ] = await Promise.all([
      db.from('day_entries').select('*').eq('user_id', userId),
      db.from('tasks').select('*').eq('user_id', userId),
      db.from('routines').select('*').eq('user_id', userId),
      db.from('routine_logs').select('*').eq('user_id', userId),
      db.from('short_goals').select('*').eq('user_id', userId),
      db.from('long_goals').select('*').eq('user_id', userId),
      db.from('weekly_reviews').select('*').eq('user_id', userId),
    ])

    // Legacy tasks table — used as fallback when embedded tasks aren't present yet
    const legacyTasks: any[] = tasksData || []

    const days: DayEntry[] = (dayEntriesData || []).map((entry: any) => {
      const meta = entry.meta ?? {}
      // Primary: tasks embedded in meta._tasks (no schema change needed)
      // Fallback: tasks table (legacy, may silently fail on some setups)
      const hasMeta_tasks = '_tasks' in meta
      const { _tasks, ...cleanMeta } = meta
      const entryTasks: any[] = hasMeta_tasks
        ? (_tasks ?? [])
        : legacyTasks.filter((t: any) => t.day_id === entry.id && !t.goal_id)
      return { ...entry, meta: cleanMeta, tasks: entryTasks, categories: [] }
    })

    const goals: ShortGoal[] = (goalsData || []).map((goal: any) => {
      // Primary: tasks embedded in short_goals.tasks column
      // Fallback: tasks table (legacy)
      const hasEmbeddedTasks = Array.isArray(goal.tasks) && goal.tasks.length >= 0
      const goalTasks: any[] = hasEmbeddedTasks
        ? goal.tasks
        : legacyTasks.filter((t: any) => t.goal_id === goal.id)
      // notes column may also be embedded
      const goalNotes: any[] = Array.isArray(goal.notes) ? goal.notes : (goal.notes ?? [])
      return { ...goal, tasks: goalTasks, notes: goalNotes }
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
    return { days: [], routines: [], logs: [], goals: [], longGoals: [], weeklyReviews: {} }
  }
}

// UPSERT operations
export async function upsertDayEntry(userId: string, entry: DayEntry): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { id, date, note, meta, tasks } = entry
  // Embed tasks inside meta._tasks so they sync even if the tasks table has issues
  const metaWithTasks = { ...(meta ?? {}), _tasks: tasks ?? [] }
  try {
    const { error } = await db.from('day_entries').upsert({ id, user_id: userId, date, note, meta: metaWithTasks })
    if (error) console.error('Error upserting day entry:', error.message, error)
  } catch (error) {
    console.error('Error upserting day entry (exception):', error)
  }
}

export async function upsertTask(userId: string, task: Task, contextId: string): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  try {
    const { id, text, done, category_id, category_name, category_color, time, subtasks } = task
    const record: any = {
      id,
      user_id: userId,
      day_id: task.day_id,
      goal_id: task.goal_id,
      text,
      done,
      category_id,
      category_name,
      category_color,
      subtasks: subtasks ?? [],
    }
    if (time !== undefined) record.time = time
    const { error } = await db.from('tasks').upsert(record)
    if (error) console.error('Error upserting task:', error.message, error)
  } catch (error) {
    console.error('Error upserting task (exception):', error)
  }
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  try {
    const { error } = await db.from('tasks').delete().eq('id', taskId).eq('user_id', userId)
    if (error) console.error('Error deleting task:', error.message, error)
  } catch (error) {
    console.error('Error deleting task (exception):', error)
  }
}

export async function upsertRoutine(userId: string, routine: Routine): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { id, name, status, created_at, time, order, period } = routine
  try {
    const { error } = await db.from('routines').upsert({
      id, user_id: userId, name, status, created_at,
      time: time ?? null, order: order ?? 0, period: period ?? 'anytime',
    })
    if (error) {
      if (error.code === '42703' || (error.message && error.message.includes('column'))) {
        const { error: e2 } = await db.from('routines').upsert({ id, user_id: userId, name, status, created_at })
        if (e2) console.error('Error upserting routine (fallback):', e2.message, e2)
      } else {
        console.error('Error upserting routine:', error.message, error)
      }
    }
  } catch (error) {
    console.error('Error upserting routine (exception):', error)
  }
}

export async function deleteRoutine(userId: string, routineId: string): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  try {
    const { error } = await db.from('routines').delete().eq('id', routineId).eq('user_id', userId)
    if (error) console.error('Error deleting routine:', error.message, error)
  } catch (error) {
    console.error('Error deleting routine (exception):', error)
  }
}

export async function upsertRoutineLog(userId: string, log: RoutineLog): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { id, routine_id, date, done } = log
  try {
    const { error } = await db.from('routine_logs').upsert({ id, user_id: userId, routine_id, date, done })
    if (error) console.error('Error upserting routine log:', error.message, error)
  } catch (error) {
    console.error('Error upserting routine log (exception):', error)
  }
}

export async function upsertShortGoal(userId: string, goal: ShortGoal): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { id, title, date_from, date_to, note, long_goal_id, routines, categories, tasks, notes } = goal
  try {
    // Try with tasks + notes columns embedded (requires SQL migration, but fails gracefully)
    const { error } = await db.from('short_goals').upsert({
      id, user_id: userId, title, date_from, date_to, note,
      long_goal_id, routines, categories,
      tasks: tasks ?? [],
      notes: notes ?? [],
    })
    if (error) {
      // Column doesn't exist yet (code 42703) — retry without tasks/notes
      if (error.code === '42703' || (error.message && error.message.includes('column'))) {
        console.warn('short_goals missing tasks/notes columns — saving without them. Run SQL migration to fix.')
        const { error: e2 } = await db.from('short_goals').upsert({
          id, user_id: userId, title, date_from, date_to, note,
          long_goal_id, routines, categories,
        })
        if (e2) console.error('Error upserting short goal (fallback):', e2.message, e2)
      } else {
        console.error('Error upserting short goal:', error.message, error)
      }
    }
  } catch (error) {
    console.error('Error upserting short goal (exception):', error)
  }
}

export async function deleteShortGoal(userId: string, goalId: string): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  try {
    const { error } = await db.from('short_goals').delete().eq('id', goalId).eq('user_id', userId)
    if (error) console.error('Error deleting short goal:', error.message, error)
  } catch (error) {
    console.error('Error deleting short goal (exception):', error)
  }
}

export async function upsertLongGoal(userId: string, goal: LongGoal): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { id, title, description, date_from, date_to, color } = goal
  try {
    const { error } = await db
      .from('long_goals')
      .upsert({ id, user_id: userId, title, description, date_from, date_to, color })
    if (error) console.error('Error upserting long goal:', error.message, error)
  } catch (error) {
    console.error('Error upserting long goal (exception):', error)
  }
}

export async function deleteLongGoal(userId: string, goalId: string): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  try {
    const { error } = await db.from('long_goals').delete().eq('id', goalId).eq('user_id', userId)
    if (error) console.error('Error deleting long goal:', error.message, error)
  } catch (error) {
    console.error('Error deleting long goal (exception):', error)
  }
}

export async function upsertWeeklyReview(
  userId: string,
  weekKey: string,
  content: string,
): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  try {
    const { error } = await db.from('weekly_reviews').upsert({ user_id: userId, week_key: weekKey, content })
    if (error) console.error('Error upserting weekly review:', error.message, error)
  } catch (error) {
    console.error('Error upserting weekly review (exception):', error)
  }
}
