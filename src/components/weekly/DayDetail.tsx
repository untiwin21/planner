'use client'
import { useState } from 'react'
import { Trash2, Clock, ChevronRight, ChevronDown, Pencil, Plus } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { formatDisplay } from '@/lib/dates'
import { Badge, Checkbox, Input, Textarea, IconBtn } from '@/components/ui'
import type { DayEntry, Category, DayMeta, Task, SubTask, JournalEntry } from '@/types'
import { SCHEDULE_CAT_ID } from '@/types'
import clsx from 'clsx'

const LEVEL_EMOJI: Record<number, string> = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' }
const genId = () => Math.random().toString(36).slice(2, 10)

interface Props {
  date: Date
  entry: DayEntry
  categories: Category[]
  onToggleTask: (taskId: string) => void
  onAddTask: (catId: string, text: string, time?: string) => void
  onDeleteTask: (taskId: string) => void
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void
  onMetaChange: (patch: Partial<DayMeta>) => void
  onAddDayNote: (title: string, body: string) => void
  onUpdateDayNote: (noteId: string, title: string, body: string) => void
  onDeleteDayNote: (noteId: string) => void
}

export function DayDetail({
  date, entry, categories,
  onToggleTask, onAddTask, onDeleteTask, onUpdateTask, onMetaChange,
  onAddDayNote, onUpdateDayNote, onDeleteDayNote,
}: Props) {
  const [newTaskTexts, setNewTaskTexts] = useState<Record<string, string>>({})
  const [newSchedTime, setNewSchedTime] = useState('')
  const meta = entry.meta

  // ── Sleep input ────────────────────────────────────────────────────────────
  const [sleepRaw, setSleepRaw] = useState<string>(() => {
    const m = entry.meta?.sleep
    if (m == null) return ''
    return `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}`
  })
  const sleepDisplay =
    sleepRaw.length === 0 ? '' :
    sleepRaw.length <= 2 ? sleepRaw :
    `${sleepRaw.slice(0, 2)}:${sleepRaw.slice(2)}`

  function handleSleepKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      setSleepRaw(prev => { const n = prev.slice(0, -1); if (!n) onMetaChange({ sleep: null }); return n })
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

  // ── Edit / expand ──────────────────────────────────────────────────────────
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

  // ── Journal state ──────────────────────────────────────────────────────────
  const [showNewNote, setShowNewNote] = useState(false)
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [newNoteBody, setNewNoteBody] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteTitle, setEditingNoteTitle] = useState('')
  const [editingNoteBody, setEditingNoteBody] = useState('')

  function handleAddNote() {
    if (!newNoteBody.trim()) return
    onAddDayNote(newNoteTitle.trim(), newNoteBody.trim())
    setNewNoteTitle(''); setNewNoteBody(''); setShowNewNote(false)
  }
  function handleUpdateNote() {
    if (!editingNoteId || !editingNoteBody.trim()) return
    onUpdateDayNote(editingNoteId, editingNoteTitle.trim(), editingNoteBody.trim())
    setEditingNoteId(null)
  }

  const dayNotes = [...(entry.meta?.notes ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  // ── Task row ──────────────────────────────────────────────────────────────
  function renderTaskRow(task: Task, isSchedule = false) {
    const isEditing = editingId === task.id
    const isExpanded = expandedIds.has(task.id)
    const subtasks = task.subtasks ?? []
    const subDone = subtasks.filter(s => s.done).length

    return (
      <div key={task.id}>
        <div className="flex items-center gap-1.5 group py-1">
          <Checkbox checked={task.done} onChange={() => onToggleTask(task.id)} size="sm" />

          {isSchedule && task.time && (
            <span className="text-[11px] font-mono text-[var(--blue)] flex-shrink-0 w-10 tabular-nums">
              {task.time}
            </span>
          )}

          {isEditing ? (
            <input autoFocus value={editingText}
              onChange={e => setEditingText(e.target.value)}
              onBlur={() => commitEdit(task)}
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(task); if (e.key === 'Escape') setEditingId(null) }}
              className="flex-1 text-sm bg-transparent outline-none border-b border-[var(--purple)] py-0.5"
            />
          ) : (
            <span className={clsx('flex-1 text-sm leading-snug', task.done && 'line-through text-[var(--text-3)]')}>
              {task.text}
            </span>
          )}

          {/* subtask toggle */}
          <button onClick={() => toggleExpand(task.id)}
            className={clsx(
              'flex items-center gap-1 rounded-[6px] px-1.5 h-6 transition-all flex-shrink-0 text-[10px] font-semibold text-[var(--purple)] hover:bg-[var(--purple-bg)]',
              subtasks.length > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-70',
              isExpanded && 'bg-[var(--purple-bg)]',
            )}>
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {subtasks.length > 0 && <span className="tabular-nums">{subDone}/{subtasks.length}</span>}
          </button>

          {/* edit — purple, fade-in on hover */}
          {!isEditing && (
            <button
              onClick={() => startEdit(task)}
              className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-[8px] flex items-center justify-center transition-all text-[var(--purple)] hover:bg-[var(--purple-bg)]"
            >
              <Pencil size={14} />
            </button>
          )}

          {/* delete — red, fade-in on hover */}
          <button
            onClick={() => onDeleteTask(task.id)}
            className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-[8px] flex items-center justify-center transition-all text-red-400 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 size={14} />
          </button>
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
                <span className={clsx('flex-1 text-sm leading-snug',
                  sub.done ? 'line-through text-[var(--text-3)]' : 'text-[var(--text-2)]')}>
                  {sub.text}
                </span>
                <button
                  onClick={() => onUpdateTask(task.id, { subtasks: subtasks.filter(s => s.id !== sub.id) })}
                  className="opacity-0 group-hover/sub:opacity-100 w-6 h-6 rounded-[6px] flex items-center justify-center transition-all text-red-400 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={12} />
                </button>
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
                className="w-8 h-8 flex-shrink-0 rounded-[6px] flex items-center justify-center text-[var(--purple)] hover:bg-[var(--purple-bg)] transition-colors">
                <Plus size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Add handlers ───────────────────────────────────────────────────────────
  function handleAddTask(catId: string) {
    const text = newTaskTexts[catId]?.trim()
    if (!text) return
    onAddTask(catId, text)
    setNewTaskTexts(p => ({ ...p, [catId]: '' }))
  }
  function handleAddScheduleTask() {
    const text = newTaskTexts[SCHEDULE_CAT_ID]?.trim()
    if (!text) return
    onAddTask(SCHEDULE_CAT_ID, text, newSchedTime.trim() || undefined)
    setNewTaskTexts(p => ({ ...p, [SCHEDULE_CAT_ID]: '' }))
    setNewSchedTime('')
  }

  // ── Sections ───────────────────────────────────────────────────────────────
  function renderScheduleSection() {
    const tasks = entry.tasks
      .filter(t => t.category_id === SCHEDULE_CAT_ID)
      .sort((a, b) => {
        if (a.time && b.time) return a.time.localeCompare(b.time)
        if (a.time) return -1; if (b.time) return 1
        return a.text.localeCompare(b.text)
      })
    return (
      <>
        <div className="flex flex-col gap-0.5 mb-2">{tasks.map(t => renderTaskRow(t, true))}</div>
        <div className="flex gap-2">
          <input type="text" value={newSchedTime}
            onChange={e => setNewSchedTime(e.target.value.replace(/[^\d:]/g, '').slice(0, 5))}
            onKeyDown={e => e.key === 'Enter' && handleAddScheduleTask()}
            placeholder="09:00" maxLength={5}
            className="w-[60px] flex-shrink-0 px-2 py-1.5 rounded-[8px] text-sm font-mono text-center bg-[var(--surface-2)] border border-transparent outline-none focus:border-[var(--blue)] focus:bg-white"
          />
          <Input value={newTaskTexts[SCHEDULE_CAT_ID] ?? ''}
            onChange={e => setNewTaskTexts(p => ({ ...p, [SCHEDULE_CAT_ID]: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleAddScheduleTask()}
            placeholder="일정 내용" className="text-sm py-1.5"
          />
          <button onClick={handleAddScheduleTask}
            className="flex-shrink-0 w-9 h-9 rounded-[8px] flex items-center justify-center text-[var(--blue)] hover:bg-[var(--blue-bg,#eff6ff)] transition-colors border border-[var(--border)] bg-white">
            <Plus size={16} />
          </button>
        </div>
      </>
    )
  }

  function renderCategorySection(catId: string) {
    const tasks = entry.tasks.filter(t => t.category_id === catId)
    return (
      <>
        <div className="flex flex-col gap-0.5 mb-2">{tasks.map(t => renderTaskRow(t))}</div>
        <div className="flex gap-2">
          <Input value={newTaskTexts[catId] ?? ''}
            onChange={e => setNewTaskTexts(p => ({ ...p, [catId]: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleAddTask(catId)}
            placeholder="할 일 추가..." className="text-sm py-1.5"
          />
          <button onClick={() => handleAddTask(catId)}
            className="flex-shrink-0 w-9 h-9 rounded-[8px] flex items-center justify-center text-[var(--purple)] hover:bg-[var(--purple-bg)] transition-colors border border-[var(--border)] bg-white">
            <Plus size={16} />
          </button>
        </div>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-5">
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
          <Badge color="blue"><Clock size={10} className="mr-1 inline" />일정</Badge>
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
          <input type="text" inputMode="numeric"
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

      {/* ── 오늘의 생각 journal ── */}
      <div className="pt-1">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-medium text-[var(--text-3)] uppercase tracking-wider">오늘의 생각</span>
          {!showNewNote && (
            <button onClick={() => setShowNewNote(true)}
              className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--purple)] transition-colors">
              <Plus size={11} /> 새 메모
            </button>
          )}
        </div>

        {showNewNote && (
          <div className="mb-4 p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--border)]">
            <input value={newNoteTitle} onChange={e => setNewNoteTitle(e.target.value)}
              placeholder="소제목 (선택)"
              className="w-full px-2.5 py-1.5 mb-2 rounded-[8px] text-sm font-medium bg-white border border-[var(--border)] outline-none focus:border-[var(--purple)] placeholder:text-[var(--text-3)] placeholder:font-normal"
            />
            <Textarea autoFocus value={newNoteBody} onChange={e => setNewNoteBody(e.target.value)}
              placeholder="지금 이 순간의 생각, 다짐, 아이디어를 적어보세요..." rows={4} className="text-sm" />
            <div className="flex gap-2 mt-2">
              <button onClick={handleAddNote}
                className="flex-1 py-1.5 rounded-[8px] text-xs font-medium bg-[var(--purple)] text-white hover:opacity-90">저장</button>
              <button onClick={() => { setShowNewNote(false); setNewNoteTitle(''); setNewNoteBody('') }}
                className="px-3 py-1.5 rounded-[8px] text-xs text-[var(--text-2)] hover:bg-[var(--border)]">취소</button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {dayNotes.length === 0 && !showNewNote && (
            <p className="text-xs text-[var(--text-3)] text-center py-2 italic">아직 메모가 없습니다.</p>
          )}
          {dayNotes.map((note: JournalEntry) => {
            const isEditing = editingNoteId === note.id
            const noteDate = parseISO(note.createdAt)
            return (
              <div key={note.id}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 h-px bg-[var(--border)]" />
                  <span className="text-[10px] text-[var(--text-3)] font-medium whitespace-nowrap">
                    {format(noteDate, 'M월 d일 HH:mm')}
                  </span>
                  <div className="flex-1 h-px bg-[var(--border)]" />
                </div>
                {isEditing ? (
                  <div className="p-3 rounded-[12px] bg-white border border-[var(--purple)] shadow-sm">
                    <input value={editingNoteTitle} onChange={e => setEditingNoteTitle(e.target.value)}
                      placeholder="소제목 (선택)"
                      className="w-full px-2.5 py-1.5 mb-2 rounded-[8px] text-sm font-medium bg-[var(--surface-2)] outline-none border border-transparent focus:border-[var(--purple)] placeholder:text-[var(--text-3)] placeholder:font-normal"
                    />
                    <Textarea autoFocus value={editingNoteBody} onChange={e => setEditingNoteBody(e.target.value)} rows={4} className="text-sm" />
                    <div className="flex gap-2 mt-2">
                      <button onClick={handleUpdateNote}
                        className="flex-1 py-1 rounded-[7px] text-xs font-medium bg-[var(--purple)] text-white hover:opacity-90">저장</button>
                      <button onClick={() => setEditingNoteId(null)}
                        className="px-3 py-1 rounded-[7px] text-xs text-[var(--text-2)] hover:bg-[var(--border)]">취소</button>
                    </div>
                  </div>
                ) : (
                  <div className="relative group/daynote p-3 rounded-[12px] bg-[var(--surface-2)]">
                    {note.title && <p className="text-sm font-semibold text-[var(--text)] mb-1.5">{note.title}</p>}
                    <p onClick={() => { setEditingNoteId(note.id); setEditingNoteTitle(note.title); setEditingNoteBody(note.body) }}
                      className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap cursor-text">
                      {note.body}
                    </p>
                    <button onClick={() => onDeleteDayNote(note.id)}
                      className="absolute top-2.5 right-2.5 opacity-0 group-hover/daynote:opacity-100 w-7 h-7 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition-all rounded-[7px]">
                      <Trash2 size={13} />
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
