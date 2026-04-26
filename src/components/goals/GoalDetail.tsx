'use client'
import { useState } from 'react'
import { Plus, Trash2, ChevronRight, ChevronDown, Pencil } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { dayRangeLabel } from '@/lib/dates'
import { Badge, Checkbox, CircleCheck, Input, Textarea, IconBtn, ProgressBar } from '@/components/ui'
import type { ShortGoal, Category, Routine, Task, SubTask, NoteEntry } from '@/types'
import clsx from 'clsx'

const genId = () => Math.random().toString(36).slice(2, 10)

interface Props {
  goal: ShortGoal
  categories: Category[]          // global categories
  allRoutines: Routine[]
  onUpdate: (patch: Partial<ShortGoal>) => void
  onDelete: () => void
  onToggleTask: (taskId: string) => void
  onAddTask: (catId: string, text: string) => void
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void
  onAddRoutine: (name: string) => void
  onAddNote: (text: string) => void
  onUpdateNote: (noteId: string, text: string) => void
  onDeleteNote: (noteId: string) => void
}

export function GoalDetail({
  goal, categories, allRoutines,
  onUpdate, onDelete, onToggleTask, onAddTask, onUpdateTask, onAddRoutine,
  onAddNote, onUpdateNote, onDeleteNote,
}: Props) {
  const [newTaskTexts, setNewTaskTexts] = useState<Record<string, string>>({})
  const [newRoutineName, setNewRoutineName] = useState('')
  const [showRoutineInput, setShowRoutineInput] = useState(false)

  // ── Task edit / expand ───────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [subInputs, setSubInputs] = useState<Record<string, string>>({})

  function startEdit(task: Task) { setEditingId(task.id); setEditingText(task.text) }
  function commitEdit(task: Task) {
    if (editingText.trim() && editingText.trim() !== task.text)
      onUpdateTask(task.id, { text: editingText.trim() })
    setEditingId(null)
  }
  function toggleExpand(id: string) {
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function addSubTask(task: Task) {
    const text = subInputs[task.id]?.trim()
    if (!text) return
    const newSub: SubTask = { id: genId(), text, done: false }
    onUpdateTask(task.id, { subtasks: [...(task.subtasks ?? []), newSub] })
    setSubInputs(p => ({ ...p, [task.id]: '' }))
    setExpandedIds(prev => new Set([...prev, task.id]))
  }

  // ── Notes ────────────────────────────────────────────────────────────────
  const [showNewNote, setShowNewNote] = useState(false)
  const [newNoteText, setNewNoteText] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteText, setEditingNoteText] = useState('')

  function handleAddNote() {
    if (!newNoteText.trim()) return
    onAddNote(newNoteText)
    setNewNoteText('')
    setShowNewNote(false)
  }
  function handleUpdateNote() {
    if (!editingNoteId || !editingNoteText.trim()) return
    onUpdateNote(editingNoteId, editingNoteText.trim())
    setEditingNoteId(null)
  }

  const notes = [...(goal.notes ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const done = goal.tasks.filter(t => t.done).length

  // ── Routine helpers ──────────────────────────────────────────────────────
  function handleToggleRoutine(routineId: string) {
    const exists = goal.routines.find((r: any) => r.id === routineId)
    if (exists) {
      onUpdate({ routines: goal.routines.filter((r: any) => r.id !== routineId) })
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

  // ── Task row ─────────────────────────────────────────────────────────────
  function renderTaskRow(task: Task) {
    const isEditing = editingId === task.id
    const isExpanded = expandedIds.has(task.id)
    const subtasks = task.subtasks ?? []
    const subDone = subtasks.filter(s => s.done).length

    return (
      <div key={task.id}>
        <div className="flex items-center gap-2 group py-1">
          <Checkbox checked={task.done} onChange={() => onToggleTask(task.id)} size="sm" />

          {isEditing ? (
            <input autoFocus value={editingText}
              onChange={e => setEditingText(e.target.value)}
              onBlur={() => commitEdit(task)}
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(task); if (e.key === 'Escape') setEditingId(null) }}
              className="flex-1 text-sm bg-transparent outline-none border-b border-[var(--teal)] py-0.5"
            />
          ) : (
            <span className={clsx('flex-1 text-sm leading-snug', task.done && 'line-through text-[var(--text-3)]')}>
              {task.text}
            </span>
          )}

          {/* subtask toggle */}
          <button onClick={() => toggleExpand(task.id)}
            className={clsx(
              'flex items-center gap-1 rounded-[6px] px-1.5 h-6 text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--surface-2)] transition-all flex-shrink-0 text-[10px] font-medium',
              subtasks.length > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-70',
            )}>
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {subtasks.length > 0 && <span className="tabular-nums">{subDone}/{subtasks.length}</span>}
          </button>

          {!isEditing && (
            <IconBtn className="opacity-30 group-hover:opacity-100 transition-opacity" onClick={() => startEdit(task)}>
              <Pencil size={14} />
            </IconBtn>
          )}
        </div>

        {/* Subtask list */}
        {isExpanded && (
          <div className="ml-5 border-l-2 border-[var(--border)] pl-3 pb-2 mt-0.5">
            {subtasks.map(sub => (
              <div key={sub.id} className="flex items-center gap-2 py-0.5 group/sub">
                <Checkbox checked={sub.done} size="sm"
                  onChange={() => onUpdateTask(task.id, {
                    subtasks: subtasks.map(s => s.id === sub.id ? { ...s, done: !s.done } : s),
                  })} />
                <span className={clsx('flex-1 text-sm', sub.done ? 'line-through text-[var(--text-3)]' : 'text-[var(--text-2)]')}>
                  {sub.text}
                </span>
                <IconBtn className="opacity-20 group-hover/sub:opacity-100 hover:!text-red-400 !w-6 !h-6"
                  onClick={() => onUpdateTask(task.id, { subtasks: subtasks.filter(s => s.id !== sub.id) })}>
                  <Trash2 size={12} />
                </IconBtn>
              </div>
            ))}
            <div className="flex gap-1.5 mt-2">
              <input value={subInputs[task.id] ?? ''}
                onChange={e => setSubInputs(p => ({ ...p, [task.id]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') addSubTask(task) }}
                placeholder="세부 작업 추가..."
                className="flex-1 px-2 py-1.5 rounded-[6px] text-sm bg-[var(--surface-2)] outline-none focus:bg-white border border-transparent focus:border-[var(--border-strong)]"
              />
              <button onClick={() => addSubTask(task)}
                className="px-2.5 py-1.5 rounded-[6px] text-sm bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--border)]">
                추가
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  function handleAddTask(catId: string) {
    const text = newTaskTexts[catId]?.trim()
    if (!text) return
    onAddTask(catId, text)
    setNewTaskTexts(p => ({ ...p, [catId]: '' }))
  }

  return (
    <div className="flex flex-col gap-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <span className="text-[11px] text-[var(--teal)] font-medium">
            {dayRangeLabel(goal.date_from, goal.date_to)}
          </span>
          <input value={goal.title} onChange={e => onUpdate({ title: e.target.value })}
            className="block w-full text-xl font-semibold tracking-tight bg-transparent outline-none mt-0.5 placeholder:text-[var(--text-3)]"
            placeholder="목표 제목" />
        </div>
        <IconBtn onClick={onDelete}><Trash2 size={14} /></IconBtn>
      </div>

      {/* ── Progress ── */}
      {goal.tasks.length > 0 && (
        <div>
          <div className="flex justify-between text-xs text-[var(--text-3)] mb-1.5">
            <span>진행률</span><span>{done}/{goal.tasks.length}</span>
          </div>
          <ProgressBar value={done} max={goal.tasks.length} color="teal" />
        </div>
      )}

      {/* ── Routines ── */}
      <div>
        <label className="block text-[11px] font-medium text-[var(--text-3)] uppercase tracking-wider mb-2">이 기간 루틴</label>
        <div className="flex flex-col gap-1 mb-2">
          {allRoutines.map(r => {
            const active = !!goal.routines.find((gr: any) => gr.id === r.id)
            return (
              <label key={r.id} className="flex items-center gap-2 cursor-pointer py-0.5">
                <CircleCheck checked={active} onChange={() => handleToggleRoutine(r.id)} />
                <span className={`text-sm ${active ? 'text-[var(--text)]' : 'text-[var(--text-3)]'}`}>{r.name}</span>
              </label>
            )
          })}
        </div>
        {showRoutineInput ? (
          <div className="flex gap-2">
            <Input value={newRoutineName} onChange={e => setNewRoutineName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddRoutine()}
              placeholder="새 루틴..." className="text-sm py-1.5" autoFocus />
            <button onClick={handleAddRoutine} className="px-3 py-1.5 rounded-[8px] text-sm bg-[var(--teal)] text-white">추가</button>
            <button onClick={() => setShowRoutineInput(false)} className="px-3 py-1.5 rounded-[8px] text-sm text-[var(--text-2)] hover:bg-[var(--border)]">취소</button>
          </div>
        ) : (
          <button onClick={() => setShowRoutineInput(true)}
            className="flex items-center gap-1.5 text-sm text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
            <Plus size={13} /> 루틴 추가
          </button>
        )}
      </div>

      {/* ── Tasks by global category ── */}
      {categories.length === 0 ? (
        <p className="text-xs text-[var(--text-3)] italic text-center py-1">
          왼쪽 카테고리 관리에서 카테고리를 추가하세요.
        </p>
      ) : (
        categories.map(cat => {
          const tasks = goal.tasks.filter(t => t.category_id === cat.id)
          return (
            <div key={cat.id}>
              <div className="flex items-center gap-2 mb-2">
                <Badge color={cat.color}>{cat.name}</Badge>
                <span className="text-[11px] text-[var(--text-3)]">
                  {tasks.filter(t => t.done).length}/{tasks.length}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 mb-2">
                {tasks.map(t => renderTaskRow(t))}
              </div>
              <div className="flex gap-2">
                <Input value={newTaskTexts[cat.id] ?? ''}
                  onChange={e => setNewTaskTexts(p => ({ ...p, [cat.id]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleAddTask(cat.id)}
                  placeholder="할 일 추가..." className="text-sm py-1.5" />
                <button onClick={() => handleAddTask(cat.id)}
                  className="px-3 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--border)]">
                  추가
                </button>
              </div>
            </div>
          )
        })
      )}

      {/* ── Notes journal ── */}
      <div>
        {/* Section header */}
        <div className="flex items-center justify-between mb-3">
          <label className="text-[11px] font-medium text-[var(--text-3)] uppercase tracking-wider">메 모</label>
          {!showNewNote && (
            <button onClick={() => setShowNewNote(true)}
              className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--purple)] transition-colors">
              <Plus size={11} /> 새 메모
            </button>
          )}
        </div>

        {/* New note input */}
        {showNewNote && (
          <div className="mb-4 p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--border)]">
            <Textarea autoFocus value={newNoteText} onChange={e => setNewNoteText(e.target.value)}
              placeholder="지금 이 순간의 생각, 다짐, 아이디어를 적어보세요..." rows={4}
              className="text-sm" />
            <div className="flex gap-2 mt-2">
              <button onClick={handleAddNote}
                className="flex-1 py-1.5 rounded-[8px] text-xs font-medium bg-[var(--purple)] text-white hover:opacity-90">
                저장
              </button>
              <button onClick={() => { setShowNewNote(false); setNewNoteText('') }}
                className="px-3 py-1.5 rounded-[8px] text-xs text-[var(--text-2)] hover:bg-[var(--border)]">
                취소
              </button>
            </div>
          </div>
        )}

        {/* Note entries */}
        <div className="flex flex-col gap-4">
          {notes.length === 0 && !showNewNote && (
            <p className="text-xs text-[var(--text-3)] text-center py-3 italic">
              아직 메모가 없습니다. 위 버튼으로 첫 메모를 작성해보세요.
            </p>
          )}
          {notes.map(note => {
            const isEditing = editingNoteId === note.id
            const date = parseISO(note.createdAt)
            return (
              <div key={note.id}>
                {/* Date separator */}
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 h-px bg-[var(--border)]" />
                  <span className="text-[10px] text-[var(--text-3)] font-medium whitespace-nowrap">
                    {format(date, 'yyyy년 M월 d일 EEEE', { locale: ko })}
                  </span>
                  <div className="flex-1 h-px bg-[var(--border)]" />
                </div>

                {isEditing ? (
                  <div className="p-3 rounded-[12px] bg-white border border-[var(--purple)] shadow-sm">
                    <Textarea autoFocus value={editingNoteText}
                      onChange={e => setEditingNoteText(e.target.value)} rows={4} className="text-sm" />
                    <div className="flex gap-2 mt-2">
                      <button onClick={handleUpdateNote}
                        className="flex-1 py-1 rounded-[7px] text-xs font-medium bg-[var(--purple)] text-white hover:opacity-90">
                        저장
                      </button>
                      <button onClick={() => setEditingNoteId(null)}
                        className="px-3 py-1 rounded-[7px] text-xs text-[var(--text-2)] hover:bg-[var(--border)]">
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="relative group/note">
                    <p
                      onClick={() => { setEditingNoteId(note.id); setEditingNoteText(note.text) }}
                      className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap cursor-text px-1 py-1 rounded-[8px] hover:bg-[var(--surface-2)] transition-colors"
                    >
                      {note.text}
                    </p>
                    <button
                      onClick={() => onDeleteNote(note.id)}
                      className="absolute top-0 right-0 opacity-0 group-hover/note:opacity-100 w-6 h-6 flex items-center justify-center text-[var(--text-3)] hover:text-red-500 transition-all rounded-[6px] hover:bg-red-50"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
