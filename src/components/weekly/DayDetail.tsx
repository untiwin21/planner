'use client'
import { useState } from 'react'
import { Trash2, Clock, ChevronRight, ChevronDown, Pencil, Plus, AlertCircle, Download, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { formatDisplay, formatDate } from '@/lib/dates'
import { Badge, Checkbox, Input, Textarea } from '@/components/ui'
import type { DayEntry, Category, DayMeta, Task, SubTask, JournalEntry, ShortGoal } from '@/types'
import { SCHEDULE_CAT_ID, DEADLINE_CAT_ID } from '@/types'
import clsx from 'clsx'

const LEVEL_EMOJI: Record<number, string> = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' }
const genId = () => Math.random().toString(36).slice(2, 10)

interface Props {
  date: Date
  entry: DayEntry
  categories: Category[]
  goals: ShortGoal[]
  onToggleTask: (taskId: string) => void
  onAddTask: (catId: string, text: string, time?: string) => void
  onDeleteTask: (taskId: string) => void
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void
  onMetaChange: (patch: Partial<DayMeta>) => void
  onAddDayNote: (title: string, body: string) => void
  onUpdateDayNote: (noteId: string, title: string, body: string) => void
  onDeleteDayNote: (noteId: string) => void
  onReorderTasks: (categoryId: string, draggedId: string, targetId: string) => void
  onLinkGoalTask: (goalTaskId: string) => void
  onUnlinkGoalTask: (goalTaskId: string) => void
  onToggleLinkedTask: (goalId: string, taskId: string) => void
}

export function DayDetail({
  date, entry, categories, goals,
  onToggleTask, onAddTask, onDeleteTask, onUpdateTask, onMetaChange,
  onAddDayNote, onUpdateDayNote, onDeleteDayNote, onReorderTasks,
  onLinkGoalTask, onUnlinkGoalTask, onToggleLinkedTask,
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

  // ── Drag state ────────────────────────────────────────────────────────────
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // ── Import picker state ────────────────────────────────────────────────────
  const [importPickerCatId, setImportPickerCatId] = useState<string | null>(null)

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

  // ── Linked goal task helpers ───────────────────────────────────────────────
  const dateStr = formatDate(date)
  const linkedTaskIds = entry.meta.linkedGoalTaskIds ?? []

  // All tasks from active goals that cover this date, keyed by task id
  const activeGoalsForDay = goals.filter(g => g.date_from <= dateStr && g.date_to >= dateStr)

  function getLinkedTasksForCat(catId: string) {
    return activeGoalsForDay.flatMap(g =>
      g.tasks
        .filter(t => linkedTaskIds.includes(t.id) && t.category_id === catId)
        .map(t => ({ task: t, goalId: g.id, goalTitle: g.title }))
    )
  }

  function getAvailableForImport(catId: string) {
    return activeGoalsForDay.flatMap(g =>
      g.tasks
        .filter(t => t.category_id === catId && !linkedTaskIds.includes(t.id))
        .map(t => ({ task: t, goalId: g.id, goalTitle: g.title }))
    )
  }

  // ── Task row ──────────────────────────────────────────────────────────────
  function renderTaskRow(task: Task, isSchedule = false, draggable = false) {
    const isEditing = editingId === task.id
    const isExpanded = expandedIds.has(task.id)
    const subtasks = task.subtasks ?? []
    const subDone = subtasks.filter(s => s.done).length
    const isDragging = draggable && draggedId === task.id
    const isOver = draggable && dragOverId === task.id && draggedId !== task.id

    return (
      <div key={task.id}
        {...(draggable ? {
          draggable: true,
          onDragStart: () => setDraggedId(task.id),
          onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOverId(task.id) },
          onDrop: () => {
            if (draggedId && draggedId !== task.id) {
              onReorderTasks(task.category_id, draggedId, task.id)
            }
            setDraggedId(null); setDragOverId(null)
          },
          onDragEnd: () => { setDraggedId(null); setDragOverId(null) },
        } : {})}
        className={clsx(
          draggable && 'cursor-grab active:cursor-grabbing',
          isDragging && 'opacity-40',
          isOver && 'border-t-2 border-[var(--purple)]',
        )}
      >
        <div className="flex items-center gap-1.5 group py-1">
          <Checkbox checked={task.done} onChange={() => onToggleTask(task.id)} size="sm" />

          {isSchedule && task.time && (
            <span className="text-[13px] font-mono text-[var(--blue)] flex-shrink-0 w-10 tabular-nums">
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
              'flex items-center gap-1 rounded-[6px] px-1.5 h-6 transition-all flex-shrink-0 text-[11px] font-semibold text-[var(--purple)] hover:bg-[var(--purple-bg)]',
              subtasks.length > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-70',
              isExpanded && 'bg-[var(--purple-bg)]',
            )}>
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {subtasks.length > 0 && <span className="tabular-nums">{subDone}/{subtasks.length}</span>}
          </button>

          {/* edit */}
          {!isEditing && (
            <button
              onClick={() => startEdit(task)}
              className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-[8px] flex items-center justify-center transition-all text-[var(--purple)] hover:bg-[var(--purple-bg)]"
            >
              <Pencil size={14} />
            </button>
          )}

          {/* delete */}
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

  // ── Linked goal task row ───────────────────────────────────────────────────
  function renderLinkedTaskRow(task: Task, goalId: string, goalTitle: string) {
    return (
      <div key={`linked-${task.id}`} className="flex items-center gap-1.5 group py-1 pl-2 border-l-2 border-[var(--teal)]">
        <Checkbox checked={task.done} onChange={() => onToggleLinkedTask(goalId, task.id)} size="sm" />
        <span className={clsx('flex-1 text-sm leading-snug', task.done && 'line-through text-[var(--text-3)]')}>
          {task.text}
        </span>
        <span className="text-[11px] text-[var(--teal-text)] bg-[var(--teal-bg)] px-1.5 py-0.5 rounded-[4px] max-w-[90px] truncate flex-shrink-0">
          {goalTitle}
        </span>
        <button
          onClick={() => onUnlinkGoalTask(task.id)}
          className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-[6px] flex items-center justify-center text-[var(--text-3)] hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
          title="연결 해제"
        >
          <X size={11} />
        </button>
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
  function renderDeadlineSection() {
    const tasks = entry.tasks.filter(t => t.category_id === DEADLINE_CAT_ID)
    return (
      <>
        <div className="flex flex-col gap-0.5 mb-2">{tasks.map(t => renderTaskRow(t, false, true))}</div>
        <div className="flex gap-2">
          <Input value={newTaskTexts[DEADLINE_CAT_ID] ?? ''}
            onChange={e => setNewTaskTexts(p => ({ ...p, [DEADLINE_CAT_ID]: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleAddTask(DEADLINE_CAT_ID)}
            placeholder="데드라인 추가..." className="text-sm py-1.5"
          />
          <button onClick={() => handleAddTask(DEADLINE_CAT_ID)}
            className="flex-shrink-0 w-9 h-9 rounded-[8px] flex items-center justify-center text-[var(--red)] hover:bg-[var(--red-bg)] transition-colors border border-[var(--border)] bg-white">
            <Plus size={16} />
          </button>
        </div>
      </>
    )
  }

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
        <div className="flex flex-col gap-0.5 mb-2">{tasks.map(t => renderTaskRow(t, true, false))}</div>
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
            className="flex-shrink-0 w-9 h-9 rounded-[8px] flex items-center justify-center text-[var(--blue)] hover:bg-[var(--blue-bg)] transition-colors border border-[var(--border)] bg-white">
            <Plus size={16} />
          </button>
        </div>
      </>
    )
  }

  function renderCategorySection(cat: Category) {
    const catId = cat.id
    const dayTasks = entry.tasks.filter(t => t.category_id === catId)
    const linked = getLinkedTasksForCat(catId)
    const available = getAvailableForImport(catId)
    const isPickerOpen = importPickerCatId === catId

    return (
      <>
        {/* Linked goal tasks (teal accent) */}
        {linked.length > 0 && (
          <div className="flex flex-col gap-0.5 mb-1">
            {linked.map(({ task, goalId, goalTitle }) => renderLinkedTaskRow(task, goalId, goalTitle))}
          </div>
        )}

        {/* Regular day tasks (draggable) */}
        <div className="flex flex-col gap-0.5 mb-2">{dayTasks.map(t => renderTaskRow(t, false, true))}</div>

        {/* Import picker */}
        {isPickerOpen && (
          <div className="mb-2 rounded-[10px] border border-[var(--teal)] bg-[var(--teal-bg)] p-2">
            {available.length > 0 ? (
              <>
                <p className="text-[11px] font-semibold text-[var(--teal-text)] mb-1.5 px-1">단기 목표에서 불러오기</p>
                <div className="flex flex-col gap-0.5">
                  {available.map(({ task, goalId: _gid, goalTitle }) => (
                    <button
                      key={task.id}
                      onClick={() => { onLinkGoalTask(task.id); }}
                      className="flex items-center gap-2 py-1.5 px-2 rounded-[7px] hover:bg-white text-left w-full transition-colors"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--teal)] flex-shrink-0" />
                      <span className={clsx('flex-1 text-sm', task.done && 'line-through opacity-50')}>{task.text}</span>
                      <span className="text-[11px] text-[var(--teal-text)] truncate max-w-[80px] flex-shrink-0">{goalTitle}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[12px] text-[var(--teal-text)] italic px-1 py-0.5">이 카테고리의 단기 목표 할 일이 없습니다.</p>
            )}
          </div>
        )}

        {/* Add task input */}
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

      {/* ── 수면 / 컨디션 / 집중력 — TOP ── */}
      <div className="grid grid-cols-3 gap-3 p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--border)]">
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-3)] uppercase tracking-wider mb-1.5">수면 시간</label>
          <input type="text" inputMode="numeric"
            value={sleepDisplay} onChange={() => {}} onKeyDown={handleSleepKeyDown}
            placeholder="0730" maxLength={5}
            className="w-full px-2 py-1.5 rounded-[8px] text-sm bg-white border border-[var(--border)] outline-none focus:border-[var(--purple)] text-center font-mono tracking-widest"
          />
          <p className="text-[11px] text-[var(--text-3)] text-center mt-0.5">숫자 4자리 입력</p>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-3)] uppercase tracking-wider mb-1.5">컨디션</label>
          <div className="flex gap-0.5 justify-between">
            {[1,2,3,4,5].map(v => (
              <button key={v} onClick={() => onMetaChange({ condition: meta?.condition === v ? null : v })}
                className={`flex-1 py-1 rounded-[6px] text-[14px] transition-all ${meta?.condition === v ? 'bg-[var(--amber-bg)] ring-1 ring-[var(--amber)]' : 'bg-white border border-[var(--border)] hover:border-[var(--border-strong)]'}`}>
                {LEVEL_EMOJI[v]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-3)] uppercase tracking-wider mb-1.5">집중력</label>
          <div className="flex gap-0.5 justify-between">
            {[1,2,3,4,5].map(v => (
              <button key={v} onClick={() => onMetaChange({ focus: meta?.focus === v ? null : v })}
                className={`flex-1 py-1 rounded-[6px] text-[14px] transition-all ${meta?.focus === v ? 'bg-[var(--purple-bg)] ring-1 ring-[var(--purple)]' : 'bg-white border border-[var(--border)] hover:border-[var(--border-strong)]'}`}>
                {LEVEL_EMOJI[v]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Deadline */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge color="red"><AlertCircle size={10} className="mr-1 inline" />데드라인</Badge>
          <span className="text-[13px] text-[var(--text-3)]">
            {entry.tasks.filter(t => t.category_id === DEADLINE_CAT_ID).length}개
          </span>
        </div>
        {renderDeadlineSection()}
      </div>

      {/* Schedule */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge color="blue"><Clock size={10} className="mr-1 inline" />일정</Badge>
          <span className="text-[13px] text-[var(--text-3)]">
            {entry.tasks.filter(t => t.category_id === SCHEDULE_CAT_ID).length}개
          </span>
        </div>
        {renderScheduleSection()}
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
              <span className="text-[13px] text-[var(--text-3)]">
                {(entry.meta.linkedGoalTaskIds ?? []).filter(id =>
                  activeGoalsForDay.some(g => g.tasks.some(t => t.id === id && t.category_id === cat.id))
                ).length + entry.tasks.filter(t => t.category_id === cat.id && t.done).length}/
                {(entry.meta.linkedGoalTaskIds ?? []).filter(id =>
                  activeGoalsForDay.some(g => g.tasks.some(t => t.id === id && t.category_id === cat.id))
                ).length + entry.tasks.filter(t => t.category_id === cat.id).length}
              </span>
              <div className="flex-1" />
              {/* Import button */}
              <button
                onClick={() => setImportPickerCatId(prev => prev === cat.id ? null : cat.id)}
                className={clsx(
                  'flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-medium transition-all',
                  importPickerCatId === cat.id
                    ? 'bg-[var(--teal)] text-white'
                    : 'text-[var(--teal-text)] bg-[var(--teal-bg)] hover:bg-[var(--teal)] hover:text-white'
                )}
              >
                <Download size={10} />
                불러오기
              </button>
            </div>
            {renderCategorySection(cat)}
          </div>
        ))
      )}

      {/* ── 오늘의 생각 journal ── */}
      <div className="pt-1">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[13px] font-medium text-[var(--text-3)] uppercase tracking-wider">오늘의 생각</span>
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
                  <span className="text-[11px] text-[var(--text-3)] font-medium whitespace-nowrap">
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
