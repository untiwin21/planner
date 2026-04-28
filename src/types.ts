export type BadgeColor = 'purple' | 'teal' | 'amber' | 'coral' | 'blue' | 'gray' | 'red'

export const SCHEDULE_CAT_ID = 'schedule'
export const DEADLINE_CAT_ID = 'deadline'

export interface SubTask {
  id: string
  text: string
  done: boolean
}

export interface Task {
  id: string
  day_id: string
  goal_id?: string
  text: string
  done: boolean
  category_id: string
  category_name: string
  category_color: BadgeColor
  time?: string
  subtasks?: SubTask[]
}

export interface Category {
  id: string
  name: string
  color: BadgeColor
}

export interface JournalEntry {
  id: string
  title: string
  body: string
  createdAt: string
}

export interface DayMeta {
  sleep: number | null
  condition: number | null
  focus: number | null
  top3: string[]
  notes?: JournalEntry[]
  linkedGoalTaskIds?: string[]   // IDs of short-goal tasks linked to this day
}

export interface DayEntry {
  id: string
  date: string
  note: string
  tasks: Task[]
  categories: Category[]
  meta: DayMeta
}

export interface NoteEntry {
  id: string
  text: string
  createdAt: string
}

export interface ShortGoal {
  id: string
  title: string
  date_from: string
  date_to: string
  note: string
  tasks: Task[]
  long_goal_id?: string
  routines: any[]
  categories: any[]
  notes?: NoteEntry[]
}

export interface LongGoal {
  id: string
  title: string
  description: string
  date_from: string
  date_to: string
  color: string
}

export type RoutineStatus = 'active' | 'archived' | 'paused'

export interface Routine {
  id: string
  name: string
  status: RoutineStatus
  created_at: string
}

export interface RoutineLog {
  id: string
  routine_id: string
  date: string
  done: boolean
}

export interface WeeklyReview {
  id: string
  week_key: string
  content: string
}
