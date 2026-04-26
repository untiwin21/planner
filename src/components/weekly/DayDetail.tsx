'use client'
import { useState, useRef, useEffect } from 'react'
import { Trash2, Clock } from 'lucide-react'
import { formatDisplay } from '@/lib/dates'
import { Badge, Checkbox, Input, Textarea, IconBtn } from '@/components/ui'
import type { DayEntry, Category, DayMeta } from '@/types'
import { SCHEDULE_CAT_ID } from '@/types'

const LEVEL_EMOJI: Record<number, string> = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' }

interface Props {
  date: Date
  entry: DayEntry
  categories: Category[]              // global categories (no schedule)
  onNoteChange: (note: string) => void
  onToggleTask: (taskId: string) => void
  onAddTask: (catId: string, text: string, time?: string) => void
  onDeleteTask: (taskId: string) => void
  onMetaChange: (patch: Partial<DayMeta>) => void
}

export function DayDetail({
  date, entry, categories, onNoteChange, onToggleTask, onAddTask, onDeleteTask, onMetaChange,
}: Props) {
  const [newTaskTexts, setNewTaskTexts] = useState<Record<string, string>>({})
  const [newSchedTime, setNewSchedTime] = useState('')
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const meta = entry.meta

  // ── Sleep input: 4-digit auto-colon ───────────────────────────────────────
  // sleepRaw stores up to 4 digits, e.g. "0730". Display renders as "07:30".
  const [sleepRaw, setSleepRaw] = useState<string>(() => {
    const m = entry.meta?.sleep
    if (m == null) return ''
    return `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}`
  })

  // Sync when the selected date changes (different day loaded)
  useEffect(() => {
    const m = entry.meta?.sleep
    setSleepRaw(
      m != null
        ? `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}`
        : '',
    )
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

  // ── Task handlers ─────────────────────────────────────────────────────────
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

  // ── Render helpers ────────────────────────────────────────────────────────
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
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{formatDisplay(date)}</h2>
        <span className="text-xs text-[var(--text-3)]">
          {['월', '화', '수', '목', '금', '토', '일'][(date.getDay() + 6) % 7]}요일
        </span>
      </div>

      {/* Schedule — always first */}
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

      {/* Meta: sleep / condition / focus */}
      <div className="grid grid-cols-3 gap-3 p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--border)]">
        {/* Sleep */}
        <div>
          <label className="block text-[10px] font-medium text-[var(--text-3)] uppercase tracking-wider mb-1.5">
            수면 시간
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={sleepDisplay}
            onChange={() => {}}
            onKeyDown={handleSleepKeyDown}
            placeholder="0730"
            maxLength={5}
            className="w-full px-2 py-1.5 rounded-[8px] text-sm bg-white border border-[var(--border)] outline-none focus:border-[var(--purple)] text-center font-mono tracking-widest"
          />
          <p className="text-[9px] text-[var(--text-3)] text-center mt-0.5">숫자 4자리 입력</p>
        </div>
        {/* Condition */}
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
        {/* Focus */}
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

      {/* Categories from global CategoryPanel */}
      {categories.length === 0 ? (
        <p className="text-xs text-[var(--text-3)] text-center py-2 italic">
          왼쪽 카테고리 관리에서 카테고리를 추가하세요.
        </p>
      ) : (
        categories.map(cat => {
          const tasks = entry.tasks.filter(t => t.category_id === cat.id)
          return (
            <div key={cat.id}>
              <div className="flex items-center gap-2 mb-2">
                <Badge color={cat.color}>{cat.name}</Badge>
                <span className="text-[11px] text-[var(--text-3)]">
                  {tasks.filter(t => t.done).length}/{tasks.length}
                </span>
              </div>
              {renderTaskList(cat.id)}
            </div>
          )
        })
      )}
    </div>
  )
}
