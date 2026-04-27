'use client'
import clsx from 'clsx'
import { dayRangeLabel } from '@/lib/dates'
import type { ShortGoal } from '@/types'

interface Props {
  goal: ShortGoal
  isSelected: boolean
  onClick: () => void
}

export function GoalCard({ goal, isSelected, onClick }: Props) {
  const total = goal.tasks.length
  const done = goal.tasks.filter(t => t.done).length

  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex flex-col items-start p-3.5 rounded-[14px] border transition-all duration-150 text-left min-w-[160px]',
        isSelected
          ? 'bg-[var(--teal-bg)] border-[var(--teal)] shadow-[0_0_0_1px_var(--teal)]'
          : 'bg-white border-[var(--border)] hover:border-[var(--border-strong)] hover:-translate-y-0.5'
      )}
    >
      <span className={clsx('text-[15px] font-medium mb-1', isSelected ? 'text-[var(--teal-text)]' : 'text-[var(--text-3)]')}>
        {dayRangeLabel(goal.date_from, goal.date_to)}
      </span>
      <span className={clsx('text-sm font-semibold leading-snug mb-3', isSelected ? 'text-[var(--teal-text)]' : 'text-[var(--text)]')}>
        {goal.title}
      </span>
      {total > 0 && (
        <div className="flex items-center gap-1.5 mt-auto">
          <div className="flex gap-1">
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={clsx('w-2 h-2 rounded-full transition-all', i < done ? 'bg-[var(--teal)]' : 'bg-[var(--border)]')}
              />
            ))}
          </div>
          <span className="text-[15px] text-[var(--text-3)]">{done}/{total}</span>
        </div>
      )}
    </button>
  )
}
