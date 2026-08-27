'use client'
import { useState } from 'react'
import { Plus, ChevronDown, ChevronUp, Check, X } from 'lucide-react'
import clsx from 'clsx'
import { parseISO } from 'date-fns'
import { isGoalActive, dayRangeLabel } from '@/lib/dates'
import { PLAN_CATEGORY_STYLE, PLAN_CATEGORY_TYPES, shortGoalCategory, withShortGoalCategory } from '@/lib/planCategory'
import { tasksProgress } from '@/lib/taskProgress'
import type { ShortGoal, Category, Task, ScheduleType } from '@/types'

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
  const [newGoalCategory, setNewGoalCategory] = useState<ScheduleType>('personal')
  const [addingCatId, setAddingCatId] = useState<string | null>(null)
  const [addingGoalId, setAddingGoalId] = useState<string | null>(null)
  const [addText, setAddText] = useState('')

  const today = new Date()
  const activeGoals = goals.filter(g => isGoalActive(g, today))
  const upcomingGoals = goals.filter(g => parseISO(g.date_from) > today)
  const pastGoals = goals.filter(g => parseISO(g.date_to) < today)

  function handleCreateGoal() {
    if (!newGoalTitle.trim() || !newGoalFrom || !newGoalTo) return
    onAddGoal({
      title: newGoalTitle,
      date_from: newGoalFrom,
      date_to: newGoalTo,
      note: '',
      tasks: [],
      categories: withShortGoalCategory([], newGoalCategory),
      routines: [],
    })
    setNewGoalTitle('')
    setNewGoalFrom('')
    setNewGoalTo('')
    setNewGoalCategory('personal')
    setShowNewGoalForm(false)
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
    const goalMeta = PLAN_CATEGORY_STYLE[shortGoalCategory(goal)]

    const usedCatIds = [...new Set(goal.tasks.map(t => t.category_id))]
    const availableCats = categories.filter(c => usedCatIds.includes(c.id) || categories.length <= 3)
    void availableCats

    return (
      <div key={goal.id} className={clsx('overflow-hidden rounded-[14px] border bg-white', goalMeta.event)}>
        <button
          onClick={() => setExpandedId(prev => prev === goal.id ? null : goal.id)}
          className="w-full flex items-start gap-3 px-4 py-3 text-left"
        >
          <span className="mt-0.5 h-10 w-1 shrink-0 rounded-full" style={{ background: goalMeta.accent }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{goal.title}</p>
              <span className="shrink-0 text-[9px] font-bold opacity-70">{goalMeta.label}</span>
            </div>
            <p className="text-[11px] opacity-65 mt-0.5">{dayRangeLabel(goal.date_from, goal.date_to)}</p>
            {total > 0 && (
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 h-1 rounded-full bg-white/75">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: goalMeta.accent }} />
                </div>
                <span className="text-[10px] opacity-65 tabular-nums">{pct}%</span>
              </div>
            )}
          </div>
          {isExpanded ? <ChevronUp size={16} className="mt-0.5 flex-shrink-0 opacity-60" /> : <ChevronDown size={16} className="mt-0.5 flex-shrink-0 opacity-60" />}
        </button>

        {isExpanded && (
          <div className="border-t border-black/5 bg-white/75">
            {goal.tasks.length === 0 ? (
              <p className="px-4 py-3 text-xs text-[var(--text-3)]">아직 할 일이 없습니다</p>
            ) : (
              (() => {
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
            <div className="grid grid-cols-3 gap-1.5">
              {PLAN_CATEGORY_TYPES.map(type => {
                const meta = PLAN_CATEGORY_STYLE[type]
                return (
                  <button
                    type="button"
                    key={type}
                    onClick={() => setNewGoalCategory(type)}
                    className={clsx('flex items-center justify-center gap-1 rounded-[8px] border px-1 py-2 text-[10px] font-semibold', meta.event, newGoalCategory === type ? 'ring-2 ring-offset-1 ring-[var(--purple)]' : 'opacity-65')}
                  >
                    <span className={clsx('h-2 w-2 rounded-full', meta.dot)} />
                    {meta.label}
                  </button>
                )
              })}
            </div>
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
              <button onClick={() => { setShowNewGoalForm(false); setNewGoalCategory('personal') }}
                className="px-3 py-1.5 rounded-[8px] text-sm text-[var(--text-2)] bg-[var(--surface-2)]">
                취소
              </button>
            </div>
          </div>
        )}
      </div>

      {activeGoals.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[var(--teal-text)] mb-2">진행 중</p>
          <div className="flex flex-col gap-2">
            {activeGoals.map(renderGoalCard)}
          </div>
        </div>
      )}

      {upcomingGoals.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[var(--text-3)] mb-2">예정</p>
          <div className="flex flex-col gap-2">
            {upcomingGoals.map(renderGoalCard)}
          </div>
        </div>
      )}

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
