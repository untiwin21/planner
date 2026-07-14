'use client'
import { useState } from 'react'
import { formatDate } from '@/lib/dates'
import type { DayEntry, Category, ShortGoal, Routine, RoutineLog, LongGoal, DayMeta, Task, TaskScheduleInput } from '@/types'
import { BottomTabBar, type MobileTab } from './BottomTabBar'
import { MobileToday } from './MobileToday'
import { MobileWeekly } from './MobileWeekly'
import { MobileGoals } from './MobileGoals'
import { MobileReview } from './MobileReview'

interface Props {
  days: DayEntry[]
  goals: ShortGoal[]
  longGoals: LongGoal[]
  categories: Category[]
  routines: Routine[]
  logs: RoutineLog[]
  getDay: (date: string) => DayEntry
  toggleTask: (date: string, taskId: string) => void
  addTask: (date: string, catId: string, text: string, schedule?: string | TaskScheduleInput) => void
  updateTask: (date: string, taskId: string, patch: Partial<Task>) => void
  deleteTask: (date: string, taskId: string) => void
  updateMeta: (date: string, patch: Partial<DayMeta>) => void
  toggleRoutineLog: (routineId: string, date: string) => void
  toggleGoalTask: (goalId: string, taskId: string) => void
  addGoalTask: (goalId: string, catId: string, text: string) => void
  deleteGoalTask: (goalId: string, taskId: string) => void
  addGoal: (g: Omit<ShortGoal, 'id'>) => void
  deleteGoal: (id: string) => void
  linkGoalTask: (date: string, taskId: string) => void
  unlinkGoalTask: (date: string, taskId: string) => void
  getWeeklyReview: (weekKey: string) => string
  updateWeeklyReview: (weekKey: string, content: string) => void
  addCategory: (category: Omit<Category, 'id'>) => void
  deleteCategory: (categoryId: string) => void
  updateGoal: (goalId: string, patch: Partial<ShortGoal>) => void
}

export function MobileLayout({
  days, goals, categories, routines, logs,
  getDay, toggleTask, addTask, updateTask, deleteTask, updateMeta,
  toggleRoutineLog, toggleGoalTask, addGoalTask, deleteGoalTask,
  addGoal, deleteGoal, linkGoalTask, unlinkGoalTask,
  getWeeklyReview, updateWeeklyReview,
  addCategory, deleteCategory, updateGoal,
}: Props) {
  const [activeTab, setActiveTab] = useState<MobileTab>('today')
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
  const todayEntry = getDay(selectedDate)

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Tab content */}
      <div className="overflow-y-auto" style={{ minHeight: '100svh' }}>
        {activeTab === 'today' && (
          <MobileToday
            key={selectedDate}
            date={selectedDate}
            entry={todayEntry}
            categories={categories}
            goals={goals}
            routines={routines}
            logs={logs}
            onDateChange={setSelectedDate}
            onToggleTask={taskId => toggleTask(selectedDate, taskId)}
            onAddTask={(catId, text, schedule) => addTask(selectedDate, catId, text, schedule)}
            onUpdateTask={(taskId, patch) => updateTask(selectedDate, taskId, patch)}
            onDeleteTask={taskId => deleteTask(selectedDate, taskId)}
            onMetaChange={patch => updateMeta(selectedDate, patch)}
            onToggleRoutine={toggleRoutineLog}
            onToggleLinkedTask={toggleGoalTask}
            onLinkGoalTask={taskId => linkGoalTask(selectedDate, taskId)}
            onUnlinkGoalTask={taskId => unlinkGoalTask(selectedDate, taskId)}
            onAddCategory={addCategory}
            onDeleteCategory={deleteCategory}
          />
        )}
        {activeTab === 'weekly' && (
          <MobileWeekly
            selectedDate={selectedDate}
            days={days}
            categories={categories}
            goals={goals}
            routines={routines}
            logs={logs}
            onSelectDate={d => { setSelectedDate(d) }}
            getDay={getDay}
            onToggleTask={toggleTask}
            onAddTask={addTask}
            onUpdateTask={updateTask}
            onDeleteTask={deleteTask}
            onMetaChange={updateMeta}
            onToggleRoutine={toggleRoutineLog}
            onToggleLinkedTask={toggleGoalTask}
            onLinkGoalTask={linkGoalTask}
            onUnlinkGoalTask={unlinkGoalTask}
            onAddGoal={addGoal}
            onUpdateGoal={updateGoal}
          />
        )}
        {activeTab === 'goals' && (
          <MobileGoals
            goals={goals}
            categories={categories}
            onToggleTask={toggleGoalTask}
            onAddTask={addGoalTask}
            onDeleteTask={deleteGoalTask}
            onAddGoal={addGoal}
            onDeleteGoal={deleteGoal}
          />
        )}
        {activeTab === 'review' && (
          <MobileReview
            days={days}
            goals={goals}
            routines={routines}
            logs={logs}
            getWeeklyReview={getWeeklyReview}
            updateWeeklyReview={updateWeeklyReview}
          />
        )}
      </div>

      {/* Bottom tab bar */}
      <BottomTabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}
