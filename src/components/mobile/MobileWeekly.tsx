'use client'
import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { addWeeks, subWeeks } from 'date-fns'
import clsx from 'clsx'
import { getWeekDays, formatDate, isToday, DAY_NAMES } from '@/lib/dates'
import { tasksProgress } from '@/lib/taskProgress'
import { isActualOnlyTask } from '@/lib/taskVisibility'
import type { DayEntry, Category, ShortGoal, Routine, RoutineLog, DayMeta, Task, TaskScheduleInput } from '@/types'
import { WeeklyScheduleEditor } from '@/components/weekly/WeeklyScheduleEditor'
import { MonthlyGoalCalendar } from '@/components/weekly/MonthlyGoalCalendar'
import { ShortGoalEditModal } from '@/components/weekly/ShortGoalEditModal'

interface Props {
  selectedDate: string
  days: DayEntry[]
  categories: Category[]
  goals: ShortGoal[]
  routines: Routine[]
  logs: RoutineLog[]
  onSelectDate: (date: string) => void
  getDay: (date: string) => DayEntry
  onToggleTask: (date: string, taskId: string) => void
  onAddTask: (date: string, catId: string, text: string, schedule?: string | TaskScheduleInput) => void
  onUpdateTask: (date: string, taskId: string, patch: Partial<Task>) => void
  onDeleteTask: (date: string, taskId: string) => void
  onMetaChange: (date: string, patch: Partial<DayMeta>) => void
  onToggleRoutine: (routineId: string, date: string) => void
  onToggleLinkedTask: (goalId: string, taskId: string) => void
  onLinkGoalTask: (date: string, taskId: string) => void
  onUnlinkGoalTask: (date: string, taskId: string) => void
  onAddGoal: (g: Omit<ShortGoal, 'id'>) => void
  onUpdateGoal: (goalId: string, patch: Partial<ShortGoal>) => void
}

function packGoalsIntoRows(goals: ShortGoal[], weekDays: Date[]) {
  const weekStart = formatDate(weekDays[0])
  const weekEnd = formatDate(weekDays[6])
  const weekGoals = goals
    .filter(g => g.date_from <= weekEnd && g.date_to >= weekStart)
    .sort((a, b) => a.date_from.localeCompare(b.date_from))
  const rows: ShortGoal[][] = []
  for (const goal of weekGoals) {
    const clampedFrom = goal.date_from < weekStart ? weekStart : goal.date_from
    let placed = false
    for (const row of rows) {
      const last = row[row.length - 1]
      const lastTo = last.date_to > weekEnd ? weekEnd : last.date_to
      if (clampedFrom > lastTo) { row.push(goal); placed = true; break }
    }
    if (!placed) rows.push([goal])
  }
  return rows
}

const GOAL_COLORS = [
  'bg-[var(--purple-bg)] text-[var(--purple-text)] border-[var(--purple)]',
  'bg-[var(--teal-bg)] text-[var(--teal-text)] border-[var(--teal)]',
  'bg-[var(--amber-bg)] text-[var(--amber-text)] border-[var(--amber)]',
  'bg-[var(--coral-bg)] text-[var(--coral-text)] border-[var(--coral)]',
  'bg-[var(--blue-bg)] text-[var(--blue-text)] border-[var(--blue)]',
]

export function MobileWeekly({
  selectedDate, days, categories, goals, routines, logs,
  onSelectDate, getDay, onToggleTask, onAddTask, onUpdateTask, onDeleteTask,
  onMetaChange, onToggleRoutine, onToggleLinkedTask, onLinkGoalTask, onUnlinkGoalTask,
  onAddGoal,
  onUpdateGoal,
}: Props) {
  const [weekBase, setWeekBase] = useState(new Date())
  const [monthBase, setMonthBase] = useState(new Date())
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [newGoalTitle, setNewGoalTitle] = useState('')
  const [newGoalFrom, setNewGoalFrom] = useState('')
  const [newGoalTo, setNewGoalTo] = useState('')

  const weekDays = useMemo(() => getWeekDays(weekBase), [weekBase])
  const goalRows = useMemo(() => packGoalsIntoRows(goals, weekDays), [goals, weekDays])
  const entry = getDay(selectedDate)
  const editingGoal = editingGoalId ? goals.find(goal => goal.id === editingGoalId) ?? null : null

  function handleCreateGoal() {
    if (!newGoalTitle.trim() || !newGoalFrom || !newGoalTo) return
    onAddGoal({ title: newGoalTitle, date_from: newGoalFrom, date_to: newGoalTo, note: '', tasks: [], categories: [], routines: [] })
    setNewGoalTitle(''); setNewGoalFrom(''); setNewGoalTo(''); setShowGoalForm(false)
  }

  return (
    <div className="flex flex-col pb-28">
      {/* Week navigation */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button onClick={() => setWeekBase(prev => subWeeks(prev, 1))}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--surface-2)]">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-[var(--text-2)]">
          {formatDate(weekDays[0])} ~ {formatDate(weekDays[6])}
        </span>
        <button onClick={() => setWeekBase(prev => addWeeks(prev, 1))}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--surface-2)]">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day pills */}
      <div className="flex overflow-x-auto scrollbar-none px-3 gap-1.5 pb-2">
        {weekDays.map(d => {
          const ds = formatDate(d)
          const dayEntry = days.find(e => e.date === ds)
          const taskCount = dayEntry?.tasks.filter(task => !isActualOnlyTask(task)).length ?? 0
          const isSelected = selectedDate === ds
          const isT = isToday(d)
          const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1
          return (
            <button key={ds}
              onClick={() => onSelectDate(ds)}
              className={clsx(
                'flex flex-col items-center px-3 py-2 rounded-[12px] transition-all flex-shrink-0 min-w-[46px]',
                isSelected
                  ? 'bg-[var(--purple)] text-white'
                  : isT
                    ? 'bg-[var(--purple-bg)] text-[var(--purple-text)]'
                    : 'bg-white border border-[var(--border)] text-[var(--text-2)]',
              )}>
              <span className="text-[10px] font-medium">{DAY_NAMES[dayIdx]}</span>
              <span className="text-sm font-bold mt-0.5">{d.getDate()}</span>
              {taskCount > 0 && (
                <div className={clsx('w-1.5 h-1.5 rounded-full mt-1',
                  isSelected ? 'bg-white/70' : 'bg-[var(--purple)]')} />
              )}
            </button>
          )
        })}
      </div>

      {/* Goal spans */}
      {goalRows.length > 0 && (
        <div className="mx-4 mb-2 flex flex-col gap-1">
          {goalRows.map((row, rowIdx) => (
            <div key={rowIdx} className="flex gap-1">
              {row.map((goal, i) => {
                const colorClass = GOAL_COLORS[i % GOAL_COLORS.length]
                const prog = tasksProgress(goal.tasks)
                return (
                  <button key={goal.id}
                    type="button"
                    onClick={() => setEditingGoalId(goal.id)}
                    className={clsx('flex-1 px-2 py-1 rounded-[8px] border-l-2 text-left', colorClass)}
                  >
                    <p className="text-[11px] font-semibold truncate">{goal.title}</p>
                    {prog.total > 0 && (
                      <p className="text-[10px] opacity-70 tabular-nums">{prog.pct}%</p>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* Add goal button */}
      <div className="mx-4 mb-1">
        <button onClick={() => setShowGoalForm(v => !v)}
          className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] py-1">
          <Plus size={12} /> 단기 목표 추가
        </button>
        {showGoalForm && (
          <div className="mt-1 p-3 rounded-[12px] bg-white border border-[var(--border)] flex flex-col gap-2">
            <input value={newGoalTitle} onChange={e => setNewGoalTitle(e.target.value)}
              placeholder="목표 제목" autoFocus
              className="w-full px-2.5 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none" />
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={newGoalFrom} onChange={e => setNewGoalFrom(e.target.value)}
                className="px-2 py-1.5 rounded-[8px] text-xs bg-[var(--surface-2)] outline-none" />
              <input type="date" value={newGoalTo} onChange={e => setNewGoalTo(e.target.value)}
                className="px-2 py-1.5 rounded-[8px] text-xs bg-[var(--surface-2)] outline-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreateGoal}
                className="flex-1 py-1.5 rounded-[8px] text-sm font-medium text-white bg-[var(--teal)]">
                만들기
              </button>
              <button onClick={() => setShowGoalForm(false)}
                className="px-3 py-1.5 rounded-[8px] text-sm text-[var(--text-2)] hover:bg-[var(--border)]">
                취소
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-[var(--border)] mx-4 my-2" />

      {/* Weekly input stays focused on schedules and deadlines. */}
      <div className="mx-4">
        <WeeklyScheduleEditor
        key={selectedDate}
        compact
        entry={entry}
        onToggleTask={taskId => onToggleTask(selectedDate, taskId)}
        onAddTask={(catId, text, schedule) => onAddTask(selectedDate, catId, text, schedule)}
        onUpdateTask={(taskId, patch) => onUpdateTask(selectedDate, taskId, patch)}
        onDeleteTask={taskId => onDeleteTask(selectedDate, taskId)}
        />
      </div>

      <div className="mx-4 mt-4 overflow-x-auto rounded-[18px]">
        <div className="min-w-[700px]">
          <MonthlyGoalCalendar
            monthBase={monthBase}
            goals={goals}
            selectedDate={selectedDate}
            onMonthChange={setMonthBase}
            onSelectDate={onSelectDate}
            onAddGoal={onAddGoal}
            onUpdateGoal={onUpdateGoal}
            onEditGoal={setEditingGoalId}
          />
        </div>
      </div>

      <ShortGoalEditModal
        goal={editingGoal}
        onClose={() => setEditingGoalId(null)}
        onSave={onUpdateGoal}
      />
    </div>
  )
}
