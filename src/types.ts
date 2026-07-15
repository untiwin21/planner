export type BadgeColor = 'purple' | 'teal' | 'amber' | 'coral' | 'blue' | 'gray' | 'red'

export const SCHEDULE_CAT_ID = 'schedule'
export const DEADLINE_CAT_ID = 'deadline'

export interface SubTask {
  id: string
  text: string
  done: boolean
  updated_at?: number
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
  /** Legacy single start-time field kept for existing data. */
  time?: string
  /** Start/end are local wall-clock values in HH:mm format. */
  start_time?: string
  end_time?: string
  /** Estimated effort for flexible work. */
  duration_min?: number
  /** Fixed events consume timeline capacity; flexible work consumes available capacity. */
  fixed?: boolean
  /** Retrospective execution record. Kept separate from the planned timeline. */
  actual_start_time?: string
  actual_end_time?: string
  actual_status?: 'recorded' | 'skipped'
  /** Retrospective-only item: shown on the actual timeline, never as a planned task. */
  actual_only?: boolean
  /** Optional measurable completion, e.g. 6 / 7 km. `done` still means 100%. */
  progress_current?: number
  progress_target?: number
  progress_unit?: string
  /** Embedded tombstone used to propagate deletions between devices. */
  deleted_at?: number
  subtasks?: SubTask[]
  // Last-write-wins timestamp (ms epoch). Set on every mutation; merge takes newer.
  updated_at?: number
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
  cardKeywords?: string[]        // Custom keyword labels shown on DayCard
  notes?: JournalEntry[]
  linkedGoalTaskIds?: string[]   // IDs of short-goal tasks linked to this day
  linkedGoalSubtaskIds?: string[] // IDs of specific subtasks linked to this day
  dayStart?: string               // Start of the usable planning window (HH:mm)
  dayEnd?: string                 // End of the usable planning window (HH:mm)
  // Last-write-wins timestamp (ms epoch) for non-task meta fields (sleep/condition/focus/top3/note links etc.)
  // Per-task fields use Task.updated_at directly; this covers everything else in the day entry.
  updated_at?: number
}

export interface DayEntry {
  id: string
  date: string
  note: string
  tasks: Task[]
  task_tombstones?: Task[]
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
  task_tombstones?: Task[]
  long_goal_id?: string
  routines: any[]
  categories: any[]
  notes?: NoteEntry[]
  // Last-write-wins timestamp for goal-level fields (title, dates, note, routines, categories, notes).
  // Tasks have their own per-task updated_at and are merged independently.
  updated_at?: number
}

export interface LongGoal {
  id: string
  title: string
  description: string
  date_from: string
  date_to: string
  color: string
  updated_at?: number
}

export type RoutineStatus = 'active' | 'archived' | 'paused'

export type RoutinePeriod = 'morning' | 'afternoon' | 'evening' | 'anytime'

export interface Routine {
  id: string
  name: string
  status: RoutineStatus
  created_at: string
  time?: string
  order?: number
  period?: RoutinePeriod
  updated_at?: number
}

export interface RoutineLog {
  id: string
  routine_id: string
  date: string
  done: boolean
  updated_at?: number
}

export interface WeeklyReview {
  id: string
  week_key: string
  content: string
}

export interface TaskScheduleInput {
  start_time?: string
  end_time?: string
  duration_min?: number
  fixed?: boolean
  actual_start_time?: string
  actual_end_time?: string
  actual_status?: 'recorded' | 'skipped'
  actual_only?: boolean
  done?: boolean
  progress_current?: number
  progress_target?: number
  progress_unit?: string
}
