export type BadgeColor = 'purple' | 'teal' | 'amber' | 'coral' | 'blue' | 'gray'

export const SCHEDULE_CAT_ID = 'schedule'

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
}

export interface Category {
  id: string
  name: string
  color: BadgeColor
}


export interface DayMeta {
  sleep: number | null
  condition: number | null
  focus: number | null
  top3: string[]
}

export interface DayEntry {
  id: string
  date: string
  note: string
  tasks: Task[]
  categories: Category[]
  meta: DayMeta
}

export interface ShortGoal {
  id: string
  title: string
  date_from: string
  date_to: string
  note: string
  tasks: Task[]
  long_goal_id?: string
  routines: any[] // to be defined
  categories: any[] // to be defined
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
