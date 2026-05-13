'use client'
import clsx from 'clsx'
import { parseISO } from 'date-fns'
import { formatDate } from '@/lib/dates'
import { tasksProgress } from '@/lib/taskProgress'
import type { ShortGoal } from '@/types'

interface Props {
  weekDays: Date[]
  goalRows: ShortGoal[][]   // pre-computed rows to avoid overlap
  selectedGoalId: string | null
  onSelectGoal: (id: string) => void
}

function dateToColIndex(date: string, weekDays: Date[]): number {
  return weekDays.findIndex(d => formatDate(d) === date)
}

export function GoalSpanRow({ weekDays, goalRows, selectedGoalId, onSelectGoal }: Props) {
  if (goalRows.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5 mt-1.5">
      {goalRows.map((row, rowIdx) => (
        <div key={rowIdx} className="grid grid-cols-7 gap-2">
          {/* Build 7 cells: either a goal spanning its range, or empty placeholder */}
          {buildRowCells(row, weekDays, selectedGoalId, onSelectGoal)}
        </div>
      ))}
    </div>
  )
}

function buildRowCells(
  goals: ShortGoal[],
  weekDays: Date[],
  selectedGoalId: string | null,
  onSelectGoal: (id: string) => void
) {
  const cells: React.ReactNode[] = []
  let col = 0

  // Sort goals by start date
  const sorted = [...goals].sort((a, b) => a.date_from.localeCompare(b.date_from))

  for (const goal of sorted) {
    const weekStart = formatDate(weekDays[0])
    const weekEnd = formatDate(weekDays[6])

    // Clamp goal range to current week
    const clampedFrom = goal.date_from < weekStart ? weekStart : goal.date_from
    const clampedTo = goal.date_to > weekEnd ? weekEnd : goal.date_to

    const startCol = dateToColIndex(clampedFrom, weekDays)
    const endCol = dateToColIndex(clampedTo, weekDays)
    if (startCol < 0 || endCol < 0) continue

    const span = endCol - startCol + 1

    // Fill gap before this goal with empty cells
    while (col < startCol) {
      cells.push(<div key={`empty-${col}`} className="col-span-1" />)
      col++
    }

    const progress = tasksProgress(goal.tasks)
    const total = progress.total
    const pct = progress.pct
    const isSelected = selectedGoalId === goal.id

    cells.push(
      <button
        key={goal.id}
        onClick={() => onSelectGoal(goal.id)}
        style={{ gridColumn: `span ${span}` }}
        className={clsx(
          'flex items-center gap-3 px-3 py-2 rounded-[10px] border transition-all duration-150 text-left w-full',
          isSelected
            ? 'bg-[var(--teal-bg)] border-[var(--teal)] shadow-[0_0_0_1px_var(--teal)]'
            : 'bg-white border-[var(--border)] hover:border-[var(--border-strong)] hover:shadow-sm'
        )}
      >
        {/* Color bar */}
        <div className={clsx('w-1 self-stretch rounded-full flex-shrink-0', isSelected ? 'bg-[var(--teal)]' : 'bg-[var(--border-strong)]')} />

        <div className="flex-1 min-w-0">
          <p className={clsx('text-[13px] font-semibold truncate', isSelected ? 'text-[var(--teal-text)]' : 'text-[var(--text)]')}>
            {goal.title}
          </p>
          {total > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-[2px] rounded-full bg-[var(--border)]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: isSelected ? 'var(--teal)' : 'var(--purple)' }}
                />
              </div>
              <span className="text-[11px] text-[var(--text-3)] flex-shrink-0 tabular-nums">{pct}%</span>
            </div>
          )}
        </div>
      </button>
    )

    col = endCol + 1
  }

  // Fill remaining cells
  while (col < 7) {
    cells.push(<div key={`empty-end-${col}`} className="col-span-1" />)
    col++
  }

  return cells
}
