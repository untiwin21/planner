'use client'
import { useState, useRef } from 'react'
import { Plus, Trash2, Clock } from 'lucide-react'
import { formatDisplay } from '@/lib/dates'
import { Badge, Checkbox, Input, Textarea, IconBtn } from '@/components/ui'
import type { DayEntry, Category, DayMeta, BadgeColor } from '@/types'
import { SCHEDULE_CAT_ID } from '@/types'

const CAT_COLORS: BadgeColor[] = ['purple', 'teal', 'amber', 'coral', 'blue']
const CAT_COLOR_LABELS: Record<BadgeColor, string> = { purple: '보라', teal: '청록', amber: '호박', coral: '코랄', blue: '파랑', gray: '회색' }
const LEVEL_EMOJI: Record<number, string> = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' }

interface Props {
  date: Date
  entry: DayEntry
  onNoteChange: (note: string) => void
  onToggleTask: (taskId: string) => void
  onAddTask: (catId: string, text: string, time?: string) => void
  onDeleteTask: (taskId: string) => void
  onUpsertCategory: (cat: Omit<Category, 'id'> & { id?: string }) => void
  onMetaChange: (patch: Partial<DayMeta>) => void
}

export function DayDetail({
  date, entry, onNoteChange, onToggleTask, onAddTask, onDeleteTask, onUpsertCategory, onMetaChange,
}: Props) {
  const [newTaskTexts, setNewTaskTexts] = useState<Record<string, string>>({})
  const [newSchedTime, setNewSchedTime] = useState('')
  const [showCatForm, setShowCatForm] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState<Category['color']>('purple')
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const meta = entry.meta

  const scheduleCat = entry.categories.find(c => c.id === SCHEDULE_CAT_ID)
  const userCats = entry.categories.filter(c => c.id !== SCHEDULE_CAT_ID)

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

  function handleAddCat() {
    if (!newCatName.trim()) return
    onUpsertCategory({ name: newCatName.trim(), color: newCatColor })
    setNewCatName('')
    setShowCatForm(false)
  }

  function handleSleepChange(val: string) {
    const cleaned = val.replace(/[^\d:]/g, '').slice(0, 5)
    if (cleaned === '') {
      onMetaChange({ sleep: null })
      return
    }
    const [hours, minutes] = cleaned.split(':').map(Number)
    if (!isNaN(hours) && !isNaN(minutes)) {
      onMetaChange({ sleep: hours * 60 + minutes })
    } else if (!isNaN(hours)) {
      onMetaChange({ sleep: hours * 60 })
    }
  }

  // Schedule section — sorted by time, with dedicated time input
  function renderScheduleTaskList() {
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
          {tasks.map(task => (
            <div key={task.id} className="flex items-center gap-2 group py-1">
              <Checkbox checked={task.done} onChange={() => onToggleTask(task.id)} size="sm" />
              {task.time && (
                <span className="text-[11px] font-mono text-[var(--blue)] flex-shrink-0 w-10 tabular-nums">
                  {task.time}
                </span>
              )}
              <span className={`flex-1 text-sm leading-snug ${task.done ? 'line-through text-[var(--text-3)]' : ''}`}>
                {task.text}
              </span>
              <IconBtn className="opacity-0 group-hover:opacity-100" onClick={() => onDeleteTask(task.id)}>
                <Trash2 size={12} />
              </IconBtn>
            </div>
          ))}
        </div>
        {/* Time + text input row */}
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
          <button
            onClick={handleAddScheduleTask}
            className="flex-shrink-0 px-3 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--border)] transition-colors"
          >
            추가
          </button>
        </div>
      </>
    )
  }

  function renderTaskList(catId: string) {
    const tasks = entry.tasks.filter(t => t.category_id === catId)
    return (
      <>
        <div className="flex flex-col gap-0.5 mb-2">
          {tasks.map(task => (
            <div key={task.id} className="flex items-center gap-2 group py-1">
              <Checkbox checked={task.done} onChange={() => onToggleTask(task.id)} size="sm" />
              <span className={`flex-1 text-sm leading-snug ${task.done ? 'line-through text-[var(--text-3)]' : ''}`}>
                {task.text}
              </span>
              <IconBtn className="opacity-0 group-hover:opacity-100" onClick={() => onDeleteTask(task.id)}>
                <Trash2 size={12} />
              </IconBtn>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newTaskTexts[catId] ?? ''}
            onChange={e => setNewTaskTexts(p => ({ ...p, [catId]: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleAddTask(catId)}
            placeholder="할 일 추가..."
            className="text-sm py-1.5"
          />
          <button
            onClick={() => handleAddTask(catId)}
            className="flex-shrink-0 px-3 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--border)] transition-colors"
          >
            추가
          </button>
        </div>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{formatDisplay(date)}</h2>
          <span className="text-xs text-[var(--text-3)]">
            {['월', '화', '수', '목', '금', '토', '일'][(date.getDay() + 6) % 7]}요일
          </span>
        </div>
      </div>

      {/* Schedule category — always first, fixed */}
      {scheduleCat && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge color="blue">
              <Clock size={10} className="mr-1 inline" />
              일정
            </Badge>
            <span className="text-[11px] text-[var(--text-3)]">
              {entry.tasks.filter(t => t.category_id === SCHEDULE_CAT_ID).length}개
            </span>
          </div>
          {renderScheduleTaskList()}
        </div>
      )}

      {/* Meta: sleep / condition / focus */}
      <div className="grid grid-cols-3 gap-3 p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--border)]">
        <div>
          <label className="block text-[10px] font-medium text-[var(--text-3)] uppercase tracking-wider mb-1.5">
            수면 시간
          </label>
          <input
            type="text"
            value={meta?.sleep ? `${String(Math.floor(meta.sleep / 60)).padStart(2, '0')}:${String(meta.sleep % 60).padStart(2, '0')}` : ''}
            onChange={e => handleSleepChange(e.target.value)}
            placeholder="07:30"
            maxLength={5}
            className="w-full px-2 py-1.5 rounded-[8px] text-sm bg-white border border-[var(--border)] outline-none focus:border-[var(--purple)] text-center font-mono tracking-widest"
          />
          <p className="text-[9px] text-[var(--text-3)] text-center mt-0.5">HH:MM</p>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-[var(--text-3)] uppercase tracking-wider mb-1.5">컨디션</label>
          <div className="flex gap-0.5 justify-between">
            {[1, 2, 3, 4, 5].map(v => (
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
            {[1, 2, 3, 4, 5].map(v => (
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

      {/* User categories */}
      {userCats.map(cat => {
        const tasks = entry.tasks.filter(t => t.category_id === cat.id)
        return (
          <div key={cat.id}>
            <div className="flex items-center gap-2 mb-2">
              <Badge color={cat.color}>{cat.name}</Badge>
              <span className="text-[11px] text-[var(--text-3)]">{tasks.filter(t => t.done).length}/{tasks.length}</span>
            </div>
            {renderTaskList(cat.id)}
          </div>
        )
      })}

      {/* Add Category */}
      {!showCatForm ? (
        <button onClick={() => setShowCatForm(true)}
          className="flex items-center gap-1.5 text-sm text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors py-1">
          <Plus size={14} /> 카테고리 추가
        </button>
      ) : (
        <div className="flex flex-col gap-2 p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--border)]">
          <Input value={newCatName} onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddCat()} placeholder="카테고리 이름" className="text-sm" autoFocus />
          <div className="flex gap-1.5 flex-wrap">
            {CAT_COLORS.map(c => (
              <button key={c} onClick={() => setNewCatColor(c)}
                className={`px-2 py-0.5 rounded-[6px] text-[11px] font-medium cat-${c} ${newCatColor === c ? 'ring-2 ring-offset-1 ring-[var(--purple)]' : ''}`}>
                {CAT_COLOR_LABELS[c]}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddCat} className="flex-1 py-1.5 rounded-[8px] text-sm bg-[var(--purple)] text-white font-medium hover:opacity-90">추가</button>
            <button onClick={() => setShowCatForm(false)} className="px-3 py-1.5 rounded-[8px] text-sm text-[var(--text-2)] hover:bg-[var(--border)]">취소</button>
          </div>
        </div>
      )}
    </div>
  )
}
