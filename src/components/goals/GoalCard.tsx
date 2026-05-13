'use client'
import clsx from 'clsx'
import { dayRangeLabel } from '@/lib/dates'
import { tasksProgress } from '@/lib/taskProgress'
import type { ShortGoal } from '@/types'

interface Props {
  goal: ShortGoal
  isSelected: boolean
  onClick: () => void
}

export function GoalCard({ goal, isSelected, onClick }: Props) {
  const progress = tasksProgress(goal.tasks)
  const total = progress.total
  const pct = progress.pct

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
      <span className={clsx('text-[11px] font-medium mb-1', isSelected ? 'text-[var(--teal-text)]' : 'text-[var(--text-3)]')}>
        {dayRangeLabel(goal.date_from, goal.date_to)}
      </span>
      <span className={clsx('text-sm font-semibold leading-snug mb-3', isSelected ? 'text-[var(--teal-text)]' : 'text-[var(--text)]')}>
        {goal.title}
      </span>
      {total > 0 && (
        <div className="flex flex-col gap-1 w-full mt-auto">
          <div className="flex items-center justify-between">
            <span className={clsx('text-[10px] font-medium', isSelected ? 'text-[var(--teal-text)]' : 'text-[var(--text-3)]')}>진행률</span>
            <span className="text-[11px] font-semibold tabular-nums text-[var(--text-2)]">{pct}%</span>
          </div>
          <div className="w-full h-1 rounded-full bg-[var(--border)]">
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--teal)' : 'var(--purple)' }} />
          </div>
        </div>
      )}
    </button>
  )
}
