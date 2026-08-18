'use client'

import { useState } from 'react'
import { CalendarClock, Check, Flag, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import type { DayEntry, Task, TaskScheduleInput } from '@/types'
import { DEADLINE_CAT_ID, SCHEDULE_CAT_ID } from '@/types'

interface Props {
  entry: DayEntry
  onAddTask: (categoryId: string, text: string, schedule?: TaskScheduleInput | string) => void
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
  onToggleTask: (taskId: string) => void
  compact?: boolean
}

export function WeeklyScheduleEditor({ entry, onAddTask, onUpdateTask, onDeleteTask, onToggleTask, compact = false }: Props) {
  const [scheduleText, setScheduleText] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [deadlineText, setDeadlineText] = useState('')

  const schedules = entry.tasks
    .filter(task => task.category_id === SCHEDULE_CAT_ID)
    .sort((a, b) => (a.time ?? a.start_time ?? '99:99').localeCompare(b.time ?? b.start_time ?? '99:99'))
  const deadlines = entry.tasks.filter(task => task.category_id === DEADLINE_CAT_ID)

  function addSchedule() {
    const text = scheduleText.trim()
    if (!text) return
    onAddTask(SCHEDULE_CAT_ID, text, scheduleTime || undefined)
    setScheduleText('')
    setScheduleTime('')
  }

  function addDeadline() {
    const text = deadlineText.trim()
    if (!text) return
    onAddTask(DEADLINE_CAT_ID, text)
    setDeadlineText('')
  }

  function renderTask(task: Task, schedule: boolean) {
    return (
      <div key={task.id} className={clsx('group flex items-center gap-2 rounded-[10px] px-2.5 py-2', task.done ? 'bg-[var(--surface-2)] opacity-60' : schedule ? 'bg-[var(--blue-bg)]' : 'bg-[var(--red-bg)]')}>
        <button type="button" onClick={() => onToggleTask(task.id)} className={clsx('h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0', task.done ? 'bg-[var(--teal)] border-[var(--teal)] text-white' : schedule ? 'border-[var(--blue)]' : 'border-[var(--red)]')}>
          {task.done && <Check size={11} strokeWidth={3} />}
        </button>
        {schedule && (
          <input
            aria-label={`${task.text} 시간`}
            type="time"
            value={task.start_time ?? task.time ?? ''}
            onChange={event => onUpdateTask(task.id, { start_time: event.target.value || undefined, time: event.target.value || undefined, fixed: true })}
            className="w-[78px] bg-transparent font-mono text-xs text-[var(--blue-text)] outline-none"
          />
        )}
        <input
          aria-label={`${task.text} 내용`}
          value={task.text}
          onChange={event => onUpdateTask(task.id, { text: event.target.value })}
          className={clsx('flex-1 min-w-0 bg-transparent text-sm outline-none', task.done && 'line-through')}
        />
        <button type="button" onClick={() => onDeleteTask(task.id)} className="w-7 h-7 rounded-[7px] opacity-30 group-hover:opacity-100 text-[var(--text-3)] hover:text-[var(--red)] hover:bg-white/70 flex items-center justify-center">
          <Trash2 size={13} />
        </button>
      </div>
    )
  }

  return (
    <div className={clsx('grid gap-4', compact ? 'grid-cols-1' : 'lg:grid-cols-2')}>
      <section className="rounded-[16px] border border-[var(--border)] bg-white p-4">
        <div className="flex items-center gap-2 mb-3"><CalendarClock size={15} className="text-[var(--blue)]" /><h3 className="text-sm font-bold">일정</h3><span className="text-[11px] text-[var(--text-3)] ml-auto">오늘 타임라인에 자동 표시</span></div>
        <div className="flex flex-col gap-1.5 mb-3">{schedules.map(task => renderTask(task, true))}</div>
        <div className="grid grid-cols-[86px_1fr_auto] gap-2">
          <input type="time" value={scheduleTime} onChange={event => setScheduleTime(event.target.value)} className="min-w-0 px-2 py-2 rounded-[9px] bg-[var(--surface-2)] text-xs font-mono outline-none focus:ring-1 focus:ring-[var(--blue)]" />
          <input value={scheduleText} onChange={event => setScheduleText(event.target.value)} onKeyDown={event => event.key === 'Enter' && addSchedule()} placeholder="수업, 약속, 이동 등" className="min-w-0 px-3 py-2 rounded-[9px] bg-[var(--surface-2)] text-sm outline-none focus:ring-1 focus:ring-[var(--blue)]" />
          <button type="button" onClick={addSchedule} className="h-9 w-9 rounded-[9px] bg-[var(--blue)] text-white flex items-center justify-center"><Plus size={16} /></button>
        </div>
      </section>

      <section className="rounded-[16px] border border-[var(--border)] bg-white p-4">
        <div className="flex items-center gap-2 mb-3"><Flag size={15} className="text-[var(--red)]" /><h3 className="text-sm font-bold">데드라인</h3><span className="text-[11px] text-[var(--text-3)] ml-auto">마감일에 기록</span></div>
        <div className="flex flex-col gap-1.5 mb-3">{deadlines.map(task => renderTask(task, false))}</div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input value={deadlineText} onChange={event => setDeadlineText(event.target.value)} onKeyDown={event => event.key === 'Enter' && addDeadline()} placeholder="제출, 신청, 결제 등" className="min-w-0 px-3 py-2 rounded-[9px] bg-[var(--surface-2)] text-sm outline-none focus:ring-1 focus:ring-[var(--red)]" />
          <button type="button" onClick={addDeadline} className="h-9 w-9 rounded-[9px] bg-[var(--red)] text-white flex items-center justify-center"><Plus size={16} /></button>
        </div>
      </section>
    </div>
  )
}
