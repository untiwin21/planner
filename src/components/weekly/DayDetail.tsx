'use client'
import { useState, useRef, useEffect } from 'react'
import { Trash2, Clock, ChevronRight, ChevronDown, Pencil } from 'lucide-react'
import { formatDisplay } from '@/lib/dates'
import { Badge, Checkbox, Input, Textarea, IconBtn } from '@/components/ui'
import type { DayEntry, Category, DayMeta, Task, SubTask } from '@/types'
import { SCHEDULE_CAT_ID } from '@/types'
import clsx from 'clsx'

const LEVEL_EMOJI: Record<number, string> = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' }
const genId = () => Math.random().toString(36).slice(2, 10)

interface Props {
  date: Date
  entry: DayEntry
  categories: Category[]
  onNoteChange: (note: string) => void
  onToggleTask: (taskId: string) => void
  onAddTask: (catId: string, text: string, time?: string) => void
  onDeleteTask: (taskId: string) => void
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void
  onMetaChange: (patch: Partial<DayMeta>) => void
}

export function DayDetail({
  date, entry, categories,
  onNoteChange, onToggleTask, onAddTask, onDeleteTask, onUpdateTask, onMetaChange,
}: Props) {
  const [newTaskTexts, setNewTaskTexts] = useState<Record<string, string>>({})
  const [newSchedTime, setNewSchedTime] = useState('')
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const meta = entry.meta

  // ── Sleep input: 4-digit auto-colon ───────────────────────────────────────
  const [sleepRaw, setSleepRaw] = useState<string>(() => {
    const m = entry.meta?.sleep
    if (m == null) return ''
    return `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}`
  })
  useEffect(() => {
    const m = entry.meta?.sleep
    setSleepRaw(m != null
      ? `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}`
      : '')
  }, [entry.date]) // eslint-disable-line react-hooks/exhaustive-deps

  const sleepDisplay =
    sleepRaw.length === 0 ? '' :
    sleepRaw.length <= 2 ? sleepRaw :
    `${sleepRaw.slice(0, 2)}:${sleepRaw.slice(2)}`

  function handleSleepKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      setSleepRaw(prev => {
        const next = prev.slice(0, -1)
        if (next.length === 0) onMetaChange({ sleep: null })
        return next
      })
    } else if (/^\d$/.test(e.key)) {
      e.preventDefault()
      setSleepRaw(prev => {
        if (prev.length >= 4) return prev
        const next = prev + e.key
        if (next.length === 4) {
          const h = parseInt(next.slice(0, 2), 10)
          const m = parseInt(next.slice(2, 4), 10)
          if (m < 60) onMetaChange({ sleep: h * 60 + m })
        }
        return next
      })
    }
  }

  // ── Edit / expand state ────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [subInputs, setSubInputs] = useState<Record<string, string>>({})

  function startEdit(task: Task) {
    setEditingId(task.id)
    setEditingText(task.text)
  }
  function commitEdit(task: Task) {
    if (editingText.trim() && editingText.trim() !== task.text)
      onUpdateTask(task.id, { text: editingText.trim() })
    setEditingId(null)
  }
  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function addSubTask(task: Task) {
    const text = subInputs[task.id]?.trim()
    if (!text) return
    const newSub: SubTask = { id: genId(), text, done: false }
    onUpdateTask(task.id, { subtasks: [...(task.subtasks ?? []), newSub] })
    setSubInputs(p => ({ ...p, [task.id]: '' }))
    setExpandedIds(prev => new Set([...prev, task.id]))
  }

  // ── Task row (shared for schedule + regular) ───────────────────────────────
  function renderTaskRow(task: Task, isSchedule = false) {
    const isEditing = editingId === task.id
    const isExpanded = expandedIds.has(task.id)
    const subtasks = task.subtasks ?? []
    const subDone = subtasks.filter(s => s.done).length

    return (
      <div key={task.id}>
        <div className="flex items-center gap-2 group py-1">
          <Checkbox checked={task.done} onChange={() => onToggleTask(task.id)} size="sm" />

          {/* time badge for schedule */}
          {isSchedule && task.time && (
            <span className="text-[11px] font-mono text-[var(--blue)] flex-shrink-0 w-10 tabular-nums">
              {task.time}
            </span>
          )}

          {/* editable text */}
          {isEditing ? (
            <input
              autoFocus
              value={editingText}
              onChange={e => setEditingText(e.target.value)}
              onBlur={() => commitEdit(task)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitEdit(task)
                if (e.key === 'Escape') setEditingId(null)
              }}
              className="flex-1 text-sm bg-transparent outline-none border-b border-[var(--purple)] py-0.5"
            />
          ) : (
            <span className={clsx('flex-1 text-sm leading-snug',
              task.done && 'line-through text-[var(--text-3)]'
            )}>
              {task.text}
            </span>
          )}

          {/* subtask counter + expand */}
          <button
            onClick={() => toggleExpand(task.id)}
            className={clsx(
              'flex items-center gap-0.5 rounded px-1 h-5 text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--surface-2)] transition-all flex-shrink-0 text-[9px]',
              subtasks.length > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-60',
            )}
            title="서브태스크"
          >
            {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            {subtasks.length > 0 && <span className="tabular-nums">{subDone}/{subtasks.length}</span>}
          </button>

          {/* edit pencil */}
          {!isEditing && (
            <IconBtn
              className="opacity-0 group-hover:opacity-100 !w-5 !h-5"
              onClick={() => startEdit(task)}
            >
              <Pencil size={10} />
            </IconBtn>
          )}

          {/* delete */}
          <IconBtn
            className="opacity-0 group-hover:opacity-100 !w-5 !h-5"
            onClick={() => onDeleteTask(task.id)}
          >
            <Trash2 size={11} />
          </IconBtn>
        </div>

        {/* Subtask list */}
        {isExpanded && (
          <div className="ml-5 border-l-2 border-[var(--border)] pl-3 pb-2 mt-0.5">
            {subtasks.map(sub => (
              <div key={sub.id} className="flex items-center gap-2 py-0.5 group/sub">
                <Checkbox
                  checked={sub.done}
                  onChange={() => onUpdateTask(task.id, {
                    subtasks: subtasks.map(s => s.id === sub.id ? { ...s, done: !s.done } : s),
                  })}
                  size="sm"
                />
                <span className={clsx('flex-1 text-xs leading-snug',
                  sub.done ? 'line-through text-[var(--text-3)]' : 'text-[var(--text-2)]'
                )}>
                  {sub.text}
                </span>
                <IconBtn
                  className="opacity-0 group-hover/sub:opacity-100 !w-5 !h-5"
                  onClick={() => onUpdateTask(task.id, {
                    subtasks: subtasks.filter(s => s.id !== sub.id),
                  })}
                >
                  <Trash2 size={10} />
                </IconBtn>
              </div>
            ))}
            {/* Add subtask */}
            <div className="flex gap-1.5 mt-1.5">
              <input
                value={subInputs[task.id] ?? ''}
                onChange={e => setSubInputs(p => ({ ...p, [task.id]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') addSubTask(task) }}
                placeholder="세부 작업 추가..."
                className="flex-1 px-2 py-1 rounded-[6px] text-xs bg-[var(--surface-2)] outline-none focus:bg-white border border-transparent focus:border-[var(--border-strong)]"
              />
              <button
                onClick={() => addSubTask(task)}
                className="px-2.5 py-1 rounded-[6px] text-xs bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--border)] transition-colors"
              >
                추가
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Task add handlers ─────────────────────────────────────────────────────
  function handleAddTask(catId: string) {
    const text = newTaskTexts[catId]?.trim()
    if (!text) return
    onAddTask(catId, text)
    setNewTaskTexts(p => ({ ...p, [catId]: '' }))
  }

  function handleAddScheduleTask() {
    const text = newTaskTexts[SCHEDULE_CAT_ID]?.trim()
    if (!text) return
    const time = newSchedTime.trim() || undefined
    onAddTask(SCHEDULE_CAT_ID, text, time)
    setNewTaskTexts(p => ({ ...p, [SCHEDULE_CAT_ID]: '' }))
    setNewSchedTime('')
  }

  // ── Render sections ───────────────────────────────────────────────────────
  function renderScheduleSection() {
    const tasks = entry.tasks
      .filter(t => t.category_id === SCHEDULE_CAT_ID)
      .sort((a, b) => {
        if (a.time && b.time) return a.time.localeCompare(b.time)
        if (a.time) return -1
        if (b.time) return 1
        return a.text.localeCompare(b.text)
      })

    return (
      <>
        <div className="flex flex-col gap-0.5 mb-2">
          {tasks.map(t => renderTaskRow(t, true))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newSchedTime}
            onChange={e => setNewSchedTime(e.target.value.replace(/[^\d:]/g, '').slice(0, 5))}
            onKeyDown={e => e.key === 'Enter' && handleAddScheduleTask()}
            placeholder="09:00"
            maxLength={5}
            className="w-[60px] flex-shrink-0 px-2 py-1.5 rounded-[8px] text-sm font-mono text-center bg-[var(--surface-2)] border border-transparent outline-none focus:border-[var(--blue)] focus:bg-white"
          />
          <Input
            value={newTaskTexts[SCHEDULE_CAT_ID] ?? ''}
            onChange={e => setNewTaskTexts(p => ({ ...p, [SCHEDULE_CAT_ID]: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleAddScheduleTask()}
            placeholder="일정 내용"
            className="text-sm py-1.5"
          />
          <button onClick={handleAddScheduleTask}
            className="flex-shrink-0 px-3 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--border)] transition-colors">
            추가
          </button>
        </div>
      </>
    )
  }

  function renderCategorySection(catId: string) {
    const tasks = entry.tasks.filter(t => t.category_id === catId)
    return (
      <>
        <div className="flex flex-col gap-0.5 mb-2">
          {tasks.map(t => renderTaskRow(t))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newTaskTexts[catId] ?? ''}
            onChange={e => setNewTaskTexts(p => ({ ...p, [catId]: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleAddTask(catId)}
            placeholder="할 일 추가..."
            className="text-sm py-1.5"
          />
          <button onClick={() => handleAddTask(catId)}
            className="flex-shrink-0 px-3 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--border)] transition-colors">
            추가
          </button>
        </div>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{formatDisplay(date)}</h2>
        <span className="text-xs text-[var(--text-3)]">
          {['월', '화', '수', '목', '금', '토', '일'][(date.getDay() + 6) % 7]}요일
        </span>
      </div>

      {/* Schedule */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge color="blue">
            <Clock size={10} className="mr-1 inline" />일정
          </Badge>
          <span className="text-[11px] text-[var(--text-3)]">
            {entry.tasks.filter(t => t.category_id === SCHEDULE_CAT_ID).length}개
          </span>
        </div>
        {renderScheduleSection()}
      </div>

      {/* Meta */}
      <div className="grid grid-cols-3 gap-3 p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--border)]">
        <div>
          <label className="block text-[10px] font-medium text-[var(--text-3)] uppercase tracking-wider mb-1.5">수면 시간</label>
          <input
            type="text" inputMode="numeric"
            value={sleepDisplay} onChange={() => {}} onKeyDown={handleSleepKeyDown}
            placeholder="0730" maxLength={5}
            className="w-full px-2 py-1.5 rounded-[8px] text-sm bg-white border border-[var(--border)] outline-none focus:border-[var(--purple)] text-center font-mono tracking-widest"
          />
          <p className="text-[9px] text-[var(--text-3)] text-center mt-0.5">숫자 4자리 입력</p>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-[var(--text-3)] uppercase tracking-wider mb-1.5">컨디션</label>
          <div className="flex gap-0.5 justify-between">
            {[1,2,3,4,5].map(v => (
              <button key={v} onClick={() => onMetaChange({ condition: meta?.condition === v ? null : v })}
                className={`flex-1 py-1 rounded-[6px] text-[12px] transition-all ${meta?.condition === v ? 'bg-[var(--amber-bg)] ring-1 ring-[var(--amber)]' : 'bg-white border border-[var(--border)] hover:border-[var(--border-strong)]'}`}>
                {LEVEL_EMOJI[v]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-[var(--text-3)] uppercase tracking-wider mb-1.5">집중력</label>
          <div className="flex gap-0.5 justify-between">
            {[1,2,3,4,5].map(v => (
              <button key={v} onClick={() => onMetaChange({ focus: meta?.focus === v ? null : v })}
                className={`flex-1 py-1 rounded-[6px] text-[12px] transition-all ${meta?.focus === v ? 'bg-[var(--purple-bg)] ring-1 ring-[var(--purple)]' : 'bg-white border border-[var(--border)] hover:border-[var(--border-strong)]'}`}>
                {LEVEL_EMOJI[v]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Daily Note */}
      <div>
        <label className="block text-[11px] font-medium text-[var(--text-3)] uppercase tracking-wider mb-1.5">오늘의 생각</label>
        <Textarea ref={noteRef} value={entry.note} onChange={e => onNoteChange(e.target.value)}
          placeholder="자유롭게 생각을 정리해보세요..." rows={3} />
      </div>

      {/* Global categories */}
      {categories.length === 0 ? (
        <p className="text-xs text-[var(--text-3)] text-center py-2 italic">
          왼쪽 카테고리 관리에서 카테고리를 추가하세요.
        </p>
      ) : (
        categories.map(cat => (
          <div key={cat.id}>
            <div className="flex items-center gap-2 mb-2">
              <Badge color={cat.color}>{cat.name}</Badge>
              <span className="text-[11px] text-[var(--text-3)]">
                {entry.tasks.filter(t => t.category_id === cat.id && t.done).length}/
                {entry.tasks.filter(t => t.category_id === cat.id).length}
              </span>
            </div>
            {renderCategorySection(cat.id)}
          </div>
        ))
      )}
    </div>
  )
}
