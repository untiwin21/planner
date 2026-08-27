'use client'
import clsx from 'clsx'
import { dayRangeLabel } from '@/lib/dates'
import { PLAN_CATEGORY_STYLE, shortGoalCategory } from '@/lib/planCategory'
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
  const meta = PLAN_CATEGORY_STYLE[shortGoalCategory(goal)]

  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex flex-col items-start p-3.5 rounded-[14px] border transition-all duration-150 text-left min-w-[160px]',
        meta.event,
        isSelected ? 'shadow-[0_0_0_2px_rgba(124,92,191,0.22)]' : 'hover:-translate-y-0.5 hover:shadow-sm',
      )}
    >
      <div className="mb-1 flex w-full items-center gap-2">
        <span className="text-[11px] font-medium opacity-70">{dayRangeLabel(goal.date_from, goal.date_to)}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[9px] font-bold opacity-75">
          <span className={clsx('h-1.5 w-1.5 rounded-full', meta.dot)} />{meta.label}
        </span>
      </div>
      <span className="text-sm font-semibold leading-snug mb-3">{goal.title}</span>
      {total > 0 && (
        <div className="flex flex-col gap-1 w-full mt-auto">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium opacity-70">진행률</span>
            <span className="text-[11px] font-semibold tabular-nums opacity-80">{pct}%</span>
          </div>
          <div className="w-full h-1 rounded-full bg-white/70">
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: meta.accent }} />
          </div>
        </div>
      )}
    </button>
  )
}
