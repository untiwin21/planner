'use client'
import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addWeeks, subWeeks } from 'date-fns'
import { getWeekDays, formatDate } from '@/lib/dates'
import type { DayEntry, ShortGoal, Routine, RoutineLog } from '@/types'
import { MonthlyGoalCalendar } from '@/components/weekly/MonthlyGoalCalendar'
import { ShortGoalEditModal } from '@/components/weekly/ShortGoalEditModal'

import { WeeklySummary } from '@/components/review/WeeklySummary'

interface Props {
  routines: Routine[]
  logs: RoutineLog[]
  selectedDate: string
  days: DayEntry[]
  goals: ShortGoal[]
  onSelectDate: (date: string) => void
  onAddGoal: (g: Omit<ShortGoal, 'id'>) => void
  onUpdateGoal: (goalId: string, patch: Partial<ShortGoal>) => void
}

export function MobileWeekly({
  selectedDate, days, goals, routines, logs,
  onSelectDate,
  onAddGoal,
  onUpdateGoal,
}: Props) {
  const [weekBase, setWeekBase] = useState(new Date())
  const [monthBase, setMonthBase] = useState(new Date())
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const weekDays = useMemo(() => getWeekDays(weekBase), [weekBase])
  const editingGoal = editingGoalId ? goals.find(goal => goal.id === editingGoalId) ?? null : null

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

      <div className="mx-4 mt-3 rounded-[18px] border border-[var(--border)] bg-white p-4">
        <WeeklySummary weekDays={weekDays} days={days} routines={routines} logs={logs} />
      </div>

      <div className="mx-4 mt-4 overflow-x-auto rounded-[18px]">
        <div className="min-w-[700px]">
          <MonthlyGoalCalendar
            monthBase={monthBase}
            goals={goals}
            days={days}
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
