'use client'
import { useState } from 'react'
import { Plus, ChevronDown, ChevronUp, Check, X } from 'lucide-react'
import clsx from 'clsx'
import { parseISO } from 'date-fns'
import { isGoalActive, dayRangeLabel } from '@/lib/dates'
import { tasksProgress } from '@/lib/taskProgress'
import type { ShortGoal, Category, Task } from '@/types'

interface Props {
  goals: ShortGoal[]
  categories: Category[]
  onToggleTask: (goalId: string, taskId: string) => void
  onAddTask: (goalId: string, catId: string, text: string) => void
  onDeleteTask: (goalId: string, taskId: string) => void
  onAddGoal: (g: Omit<ShortGoal, 'id'>) => void
  onDeleteGoal: (id: string) => void
}

export function MobileGoals({
  goals, categories,
  onToggleTask, onAddTask, onDeleteTask, onAddGoal, onDeleteGoal,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showNewGoalForm, setShowNewGoalForm] = useState(false)
  const [newGoalTitle, setNewGoalTitle] = useState('')
  const [newGoalFrom, setNewGoalFrom] = useState('')
  const [newGoalTo, setNewGoalTo] = useState('')
  const [addingCatId, setAddingCatId] = useState<string | null>(null)
  const [addingGoalId, setAddingGoalId] = useState<string | null>(null)
  const [addText, setAddText] = useState('')

  const today = new Date()
  const activeGoals = goals.filter(g => isGoalActive(g, today))
  const upcomingGoals = goals.filter(g => parseISO(g.date_from) > today)
  const pastGoals = goals.filter(g => parseISO(g.date_to) < today)

  function handleCreateGoal() {
    if (!newGoalTitle.trim() || !newGoalFrom || !newGoalTo) return
    onAddGoal({ title: newGoalTitle, date_from: newGoalFrom, date_to: newGoalTo, note: '', tasks: [], categories: [], routines: [] })
    setNewGoalTitle(''); setNewGoalFrom(''); setNewGoalTo(''); setShowNewGoalForm(false)
  }

  function submitAddTask(goalId: string, catId: string) {
    if (!addText.trim()) { resetAddTask(); return }
    onAddTask(goalId, catId, addText.trim())
    resetAddTask()
  }

  function resetAddTask() {
    setAddText('')
    setAddingCatId(null)
    setAddingGoalId(null)
  }

  function renderGoalCard(goal: ShortGoal) {
    const isExpanded = expandedId === goal.id
    const progress = tasksProgress(goal.tasks)
    const total = progress.total
    const pct = progress.pct

    // Get unique categories used in this goal's tasks
    const usedCatIds = [...new Set(goal.tasks.map(t => t.category_id))]
    const availableCats = categories.filter(c => usedCatIds.includes(c.id) || categories.length <= 3)

    return (
      <div key={goal.id} className="bg-white border border-[var(--border)] rounded-[14px] overflow-hidden">
        {/* Goal header */}
        <button
          onClick={() => setExpandedId(prev => prev === goal.id ? null : goal.id)}
          className="w-full flex items-start gap-3 px-4 py-3 text-left"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{goal.title}</p>
            <p className="text-[11px] text-[var(--text-3)] mt-0.5">{dayRangeLabel(goal.date_from, goal.date_to)}</p>
            {total > 0 && (
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 h-1 rounded-full bg-[var(--border)]">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--teal)' }} />
                </div>
                <span className="text-[10px] text-[var(--text-3)] tabular-nums">{pct}%</span>
              </div>
            )}
          </div>
          {isExpanded ? <ChevronUp size={16} className="text-[var(--text-3)] mt-0.5 flex-shrink-0" /> : <ChevronDown size={16} className="text-[var(--text-3)] mt-0.5 flex-shrink-0" />}
        </button>

        {/* Expanded tasks */}
        {isExpanded && (
          <div className="border-t border-[var(--border)]">
            {goal.tasks.length === 0 ? (
              <p className="px-4 py-3 text-xs text-[var(--text-3)]">아직 할 일이 없습니다</p>
            ) : (
              (() => {
                // Group by category
                const catMap = new Map<string, { cat: { id: string; name: string; color: string }; tasks: Task[] }>()
                for (const task of goal.tasks) {
                  if (!catMap.has(task.category_id)) {
                    catMap.set(task.category_id, {
                      cat: { id: task.category_id, name: task.category_name, color: task.category_color },
                      tasks: [],
                    })
                  }
                  catMap.get(task.category_id)!.tasks.push(task)
                }
                return [...catMap.values()].map(({ cat, tasks }) => (
                  <div key={cat.id}>
                    <div className={clsx('px-4 py-1.5 text-[11px] font-semibold cat-' + cat.color)}>
                      {cat.name}
                    </div>
                    {tasks.map(task => (
                      <div key={task.id} className="flex items-start gap-2.5 px-4 py-2 border-b border-[var(--border)] last:border-b-0 group">
                        <button
                          onClick={() => onToggleTask(goal.id, task.id)}
                          className={clsx(
                            'w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
                            task.done ? 'bg-[var(--teal)] border-[var(--teal)]' : 'border-[var(--border-strong)]',
                          )}>
                          {task.done && <Check size={9} strokeWidth={3} className="text-white" />}
                        </button>
                        <p className={clsx('flex-1 text-sm leading-snug', task.done && 'line-through text-[var(--text-3)]')}>
                          {task.text}
                        </p>
                        <button onClick={() => onDeleteTask(goal.id, task.id)}
                          className="p-0.5 text-[var(--text-3)] opacity-0 group-hover:opacity-100 active:opacity-100">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ))
              })()
            )}

            {/* Add task row */}
            {categories.length > 0 && (
              <div className="px-4 py-2 border-t border-[var(--border)]">
                {addingGoalId === goal.id && addingCatId ? (
                  <div className="flex gap-2">
                    <input autoFocus value={addText} onChange={e => setAddText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') submitAddTask(goal.id, addingCatId); if (e.key === 'Escape') resetAddTask() }}
                      placeholder="할 일 입력..."
                      className="flex-1 px-2.5 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none" />
                    <button onClick={() => submitAddTask(goal.id, addingCatId)}
                      className="px-3 py-1.5 rounded-[8px] text-sm font-medium text-white bg-[var(--teal)]">
                      추가
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map(cat => (
                      <button key={cat.id}
                        onClick={() => { setAddingGoalId(goal.id); setAddingCatId(cat.id) }}
                        className={clsx('px-2 py-1 rounded-[6px] text-[11px] font-medium cat-' + cat.color)}>
                        + {cat.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-28">
      {/* Add goal button */}
      <div>
        <button onClick={() => setShowNewGoalForm(v => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-white bg-[var(--teal)] px-4 py-2 rounded-[10px]">
          <Plus size={14} /> 단기 목표 추가
        </button>
        {showNewGoalForm && (
          <div className="mt-2 p-3 bg-white border border-[var(--border)] rounded-[12px] flex flex-col gap-2">
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
              <button onClick={() => setShowNewGoalForm(false)}
                className="px-3 py-1.5 rounded-[8px] text-sm text-[var(--text-2)] bg-[var(--surface-2)]">
                취소
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active goals */}
      {activeGoals.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[var(--teal-text)] mb-2">진행 중</p>
          <div className="flex flex-col gap-2">
            {activeGoals.map(renderGoalCard)}
          </div>
        </div>
      )}

      {/* Upcoming goals */}
      {upcomingGoals.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[var(--text-3)] mb-2">예정</p>
          <div className="flex flex-col gap-2">
            {upcomingGoals.map(renderGoalCard)}
          </div>
        </div>
      )}

      {/* Past goals */}
      {pastGoals.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[var(--text-3)] mb-2">완료</p>
          <div className="flex flex-col gap-2 opacity-60">
            {pastGoals.map(renderGoalCard)}
          </div>
        </div>
      )}

      {goals.length === 0 && (
        <div className="text-center py-12 text-[var(--text-3)]">
          <p className="text-sm">아직 단기 목표가 없습니다</p>
          <p className="text-xs mt-1">위 버튼으로 목표를 추가해보세요</p>
        </div>
      )}
    </div>
  )
}
