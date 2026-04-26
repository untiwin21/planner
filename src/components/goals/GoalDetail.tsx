'use client'
import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { dayRangeLabel, formatDate } from '@/lib/dates'
import { Badge, Checkbox, CircleCheck, Input, Textarea, IconBtn, ProgressBar } from '@/components/ui'
import type { ShortGoal, Category, Routine, BadgeColor } from '@/types'
import { addDays, parseISO, eachDayOfInterval } from 'date-fns'

const CAT_COLORS: BadgeColor[] = ['purple', 'teal', 'amber', 'coral', 'blue', 'gray']
const CAT_COLOR_LABELS: Record<BadgeColor, string> = { purple: '보라', teal: '청록', amber: '호박', coral: '코랄', blue: '파랑', gray: '회색' }

interface Props {
  goal: ShortGoal
  allRoutines: Routine[]
  onUpdate: (patch: Partial<ShortGoal>) => void
  onDelete: () => void
  onToggleTask: (taskId: string) => void
  onAddTask: (catId: string, text: string) => void
  onAddRoutine: (name: string) => void
}

export function GoalDetail({ goal, allRoutines, onUpdate, onDelete, onToggleTask, onAddTask, onAddRoutine }: Props) {
  const [newTaskTexts, setNewTaskTexts] = useState<Record<string, string>>({})
  const [showCatForm, setShowCatForm] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState<Category['color']>('teal')
  const [newRoutineName, setNewRoutineName] = useState('')
  const [showRoutineInput, setShowRoutineInput] = useState(false)

  const done = goal.tasks.filter(t => t.done).length

  function handleAddTask(catId: string) {
    const text = newTaskTexts[catId]?.trim()
    if (!text) return
    onAddTask(catId, text)
    setNewTaskTexts(p => ({ ...p, [catId]: '' }))
  }

  function handleAddCat() {
    if (!newCatName.trim()) return
    const id = Math.random().toString(36).slice(2, 10)
    onUpdate({ categories: [...goal.categories, { id, name: newCatName.trim(), color: newCatColor }] })
    setNewCatName('')
    setShowCatForm(false)
  }

  function handleToggleRoutine(routineId: string) {
    const exists = goal.routines.find(r => r.id === routineId)
    if (exists) {
      onUpdate({ routines: goal.routines.filter(r => r.id !== routineId) })
    } else {
      const r = allRoutines.find(r => r.id === routineId)
      if (r) onUpdate({ routines: [...goal.routines, r] })
    }
  }

  function handleAddRoutine() {
    if (!newRoutineName.trim()) return
    onAddRoutine(newRoutineName.trim())
    setNewRoutineName('')
    setShowRoutineInput(false)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <span className="text-[11px] text-[var(--teal)] font-medium">
            {dayRangeLabel(goal.date_from, goal.date_to)}
          </span>
          <input
            value={goal.title}
            onChange={e => onUpdate({ title: e.target.value })}
            className="block w-full text-xl font-semibold tracking-tight bg-transparent outline-none mt-0.5 placeholder:text-[var(--text-3)]"
            placeholder="목표 제목"
          />
        </div>
        <div className="flex items-center gap-1">
          <IconBtn onClick={onDelete}><Trash2 size={14} /></IconBtn>
        </div>
      </div>

      {/* Progress */}
      {goal.tasks.length > 0 && (
        <div>
          <div className="flex justify-between text-xs text-[var(--text-3)] mb-1.5">
            <span>진행률</span>
            <span>{done}/{goal.tasks.length}</span>
          </div>
          <ProgressBar value={done} max={goal.tasks.length} color="teal" />
        </div>
      )}

      {/* 생각 정리 */}
      <div>
        <label className="block text-[11px] font-medium text-[var(--text-3)] uppercase tracking-wider mb-1.5">
          생각 정리
        </label>
        <Textarea
          value={goal.note}
          onChange={e => onUpdate({ note: e.target.value })}
          placeholder="이 목표를 세운 이유, 전략, 생각들을 자유롭게..."
          rows={5}
        />
      </div>

      {/* 루틴 */}
      <div>
        <label className="block text-[11px] font-medium text-[var(--text-3)] uppercase tracking-wider mb-2">
          이 기간 루틴
        </label>
        <div className="flex flex-col gap-1.5 mb-2">
          {allRoutines.map(r => {
            const active = !!goal.routines.find(gr => gr.id === r.id)
            return (
              <label key={r.id} className="flex items-center gap-2 cursor-pointer group py-0.5">
                <Checkbox checked={active} onChange={() => handleToggleRoutine(r.id)} size="sm" />
                <span className={`text-sm ${active ? 'text-[var(--text)]' : 'text-[var(--text-3)]'}`}>{r.name}</span>
              </label>
            )
          })}
        </div>
        {showRoutineInput ? (
          <div className="flex gap-2">
            <Input
              value={newRoutineName}
              onChange={e => setNewRoutineName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddRoutine()}
              placeholder="새 루틴..."
              className="text-sm py-1.5"
              autoFocus
            />
            <button onClick={handleAddRoutine} className="px-3 py-1.5 rounded-[8px] text-sm bg-[var(--teal)] text-white">추가</button>
            <button onClick={() => setShowRoutineInput(false)} className="px-3 py-1.5 rounded-[8px] text-sm text-[var(--text-2)] hover:bg-[var(--border)]">취소</button>
          </div>
        ) : (
          <button onClick={() => setShowRoutineInput(true)} className="flex items-center gap-1.5 text-sm text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
            <Plus size={13} /> 루틴 추가
          </button>
        )}
      </div>

      {/* Tasks by category */}
      {goal.categories.map(cat => {
        const tasks = goal.tasks.filter(t => t.category_id === cat.id)
        return (
          <div key={cat.id}>
            <div className="flex items-center gap-2 mb-2">
              <Badge color={cat.color}>{cat.name}</Badge>
            </div>
            <div className="flex flex-col gap-1 mb-2">
              {tasks.map(task => (
                <div key={task.id} className="flex items-center gap-2 py-1">
                  <Checkbox checked={task.done} onChange={() => onToggleTask(task.id)} size="sm" />
                  <span className={`flex-1 text-sm ${task.done ? 'line-through text-[var(--text-3)]' : ''}`}>{task.text}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newTaskTexts[cat.id] ?? ''}
                onChange={e => setNewTaskTexts(p => ({ ...p, [cat.id]: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAddTask(cat.id)}
                placeholder="할 일 추가..."
                className="text-sm py-1.5"
              />
              <button onClick={() => handleAddTask(cat.id)} className="px-3 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--border)]">추가</button>
            </div>
          </div>
        )
      })}

      {/* Add category */}
      {!showCatForm ? (
        <button onClick={() => setShowCatForm(true)} className="flex items-center gap-1.5 text-sm text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
          <Plus size={14} /> 카테고리 추가
        </button>
      ) : (
        <div className="flex flex-col gap-2 p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--border)]">
          <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddCat()} placeholder="카테고리 이름" autoFocus />
          <div className="flex gap-1.5 flex-wrap">
            {CAT_COLORS.map(c => (
              <button key={c} onClick={() => setNewCatColor(c)} className={`px-2 py-0.5 rounded-[6px] text-[11px] font-medium cat-${c} ${newCatColor === c ? 'ring-2 ring-offset-1 ring-[var(--teal)]' : ''}`}>
                {CAT_COLOR_LABELS[c]}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddCat} className="flex-1 py-1.5 rounded-[8px] text-sm bg-[var(--teal)] text-white font-medium">추가</button>
            <button onClick={() => setShowCatForm(false)} className="px-3 py-1.5 rounded-[8px] text-sm text-[var(--text-2)] hover:bg-[var(--border)]">취소</button>
          </div>
        </div>
      )}
    </div>
  )
}
