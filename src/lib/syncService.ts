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

    const tasks: any[] = tasksData || []
    const days: DayEntry[] = (dayEntriesData || []).map((entry: any) => {
      const entryTasks = tasks.filter((t: any) => t.day_id === entry.id && !t.goal_id)
      return { ...entry, tasks: entryTasks, categories: [] }
    })

    const goals: ShortGoal[] = (goalsData || []).map((goal: any) => {
      const goalTasks = tasks.filter((t: any) => t.goal_id === goal.id)
      return { ...goal, tasks: goalTasks }
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
  const { id, date, note, meta } = entry
  try {
    await db.from('day_entries').upsert({ id, user_id: userId, date, note, meta })
  } catch (error) {
    console.error('Error upserting day entry:', error)
  }
}

export async function upsertTask(userId: string, task: Task, contextId: string): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  try {
    const { id, text, done, category_id, category_name, category_color, time } = task
    const record: any = {
      id,
      user_id: userId,
      day_id: contextId,
      goal_id: task.goal_id,
      text,
      done,
      category_id,
      category_name,
      category_color,
    }
    if (time !== undefined) record.time = time
    await db.from('tasks').upsert(record)
  } catch (error) {
    console.error('Error upserting task:', error)
  }
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  try {
    await db.from('tasks').delete().eq('id', taskId).eq('user_id', userId)
  } catch (error) {
    console.error('Error deleting task:', error)
  }
}

export async function upsertRoutine(userId: string, routine: Routine): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { id, name, status, created_at } = routine
  try {
    await db.from('routines').upsert({ id, user_id: userId, name, status, created_at })
  } catch (error) {
    console.error('Error upserting routine:', error)
  }
}

export async function deleteRoutine(userId: string, routineId: string): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  try {
    await db.from('routines').delete().eq('id', routineId).eq('user_id', userId)
  } catch (error) {
    console.error('Error deleting routine:', error)
  }
}

export async function upsertRoutineLog(userId: string, log: RoutineLog): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { id, routine_id, date, done } = log
  try {
    await db.from('routine_logs').upsert({ id, user_id: userId, routine_id, date, done })
  } catch (error) {
    console.error('Error upserting routine log:', error)
  }
}

export async function upsertShortGoal(userId: string, goal: ShortGoal): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { id, title, date_from, date_to, note, long_goal_id, routines, categories } = goal
  try {
    await db
      .from('short_goals')
      .upsert({ id, user_id: userId, title, date_from, date_to, note, long_goal_id, routines, categories })
  } catch (error) {
    console.error('Error upserting short goal:', error)
  }
}

export async function deleteShortGoal(userId: string, goalId: string): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  try {
    await db.from('short_goals').delete().eq('id', goalId).eq('user_id', userId)
  } catch (error) {
    console.error('Error deleting short goal:', error)
  }
}

export async function upsertLongGoal(userId: string, goal: LongGoal): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  const { id, title, description, date_from, date_to, color } = goal
  try {
    await db
      .from('long_goals')
      .upsert({ id, user_id: userId, title, description, date_from, date_to, color })
  } catch (error) {
    console.error('Error upserting long goal:', error)
  }
}

export async function deleteLongGoal(userId: string, goalId: string): Promise<void> {
  if (!supabase) return
  const db = supabase as any
  try {
    await db.from('long_goals').delete().eq('id', goalId).eq('user_id', userId)
  } catch (error) {
    console.error('Error deleting long goal:', error)
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
    await db.from('weekly_reviews').upsert({ user_id: userId, week_key: weekKey, content })
  } catch (error) {
    console.error('Error upserting weekly review:', error)
  }
}
