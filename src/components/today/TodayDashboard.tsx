'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { addDays, format, parseISO, subDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import clsx from 'clsx'
import type { Category, DayEntry, DayMeta, Task, TaskScheduleInput } from '@/types'
import { SCHEDULE_CAT_ID } from '@/types'
import { formatDate } from '@/lib/dates'
import {
  DEFAULT_DAY_END,
  DEFAULT_DAY_START,
  fixedBlocks,
  formatDuration,
  getTaskDuration,
  getTaskEnd,
  getTaskStart,
  isFixedTask,
  minutesToTime,
  remainingCapacity,
} from '@/lib/plannerTime'

interface Props {
  date: string
  entry: DayEntry
  categories: Category[]
  onDateChange?: (date: string) => void
  onAddTask: (categoryId: string, text: string, schedule?: TaskScheduleInput) => void
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
  onToggleTask: (taskId: string) => void
  onMetaChange: (patch: Partial<DayMeta>) => void
  compact?: boolean
}

type AddMode = 'fixed' | 'flex'

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240]

function taskTimeLabel(task: Task) {
  const start = getTaskStart(task)
  const end = getTaskEnd(task)
  if (start === null) return '아직 배치하지 않음'
  return end !== null ? `${minutesToTime(start)}–${minutesToTime(end)}` : minutesToTime(start)
}

function nowAsMinutes() {
  const date = new Date()
  return date.getHours() * 60 + date.getMinutes()
}

function CategoryDot({ color }: { color: Category['color'] }) {
  const colors: Record<Category['color'], string> = {
    purple: 'bg-[var(--purple)]',
    teal: 'bg-[var(--teal)]',
    amber: 'bg-[var(--amber)]',
    coral: 'bg-[var(--coral)]',
    blue: 'bg-[var(--blue)]',
    gray: 'bg-[var(--text-3)]',
    red: 'bg-[var(--red)]',
  }
  return <span className={clsx('h-2.5 w-2.5 rounded-full shrink-0', colors[color])} />
}

export function TodayDashboard({
  date,
  entry,
  categories,
  onDateChange,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onToggleTask,
  onMetaChange,
  compact = false,
}: Props) {
  const [nowMinute, setNowMinute] = useState(nowAsMinutes)
  const [showAdd, setShowAdd] = useState(false)
  const [mode, setMode] = useState<AddMode>('flex')
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [text, setText] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [duration, setDuration] = useState(60)

  const dateObject = parseISO(date)
  const isToday = date === formatDate(new Date())
  const dayStart = entry.meta.dayStart ?? DEFAULT_DAY_START
  const dayEnd = entry.meta.dayEnd ?? DEFAULT_DAY_END

  useEffect(() => {
    if (!isToday) return
    const timer = window.setInterval(() => setNowMinute(nowAsMinutes()), 60_000)
    return () => window.clearInterval(timer)
  }, [isToday])

  useEffect(() => {
    if (!categoryId && categories[0]) setCategoryId(categories[0].id)
  }, [categories, categoryId])

  const capacity = useMemo(
    () => remainingCapacity(entry.tasks, dayStart, dayEnd, isToday ? nowMinute : undefined),
    [entry.tasks, dayStart, dayEnd, isToday, nowMinute],
  )

  const fixed = useMemo(
    () => fixedBlocks(entry.tasks, capacity.start, capacity.end),
    [entry.tasks, capacity.start, capacity.end],
  )
  const flexible = useMemo(
    () => entry.tasks
      .filter(task => !isFixedTask(task))
      .sort((a, b) => {
        if (a.done !== b.done) return Number(a.done) - Number(b.done)
        const aStart = getTaskStart(a) ?? 10_000
        const bStart = getTaskStart(b) ?? 10_000
        return aStart - bStart
      }),
    [entry.tasks],
  )
  const placedFlexible = flexible.filter(task => !task.done && getTaskStart(task) !== null)
  const waitingFlexible = flexible.filter(task => !task.done && getTaskStart(task) === null)
  const doneCount = entry.tasks.filter(task => task.done).length
  const totalCount = entry.tasks.length

  const chronological = useMemo(() => {
    const fixedItems = fixed.map(block => ({ task: block.task, start: block.start, end: block.end, fixed: true }))
    const flexItems = placedFlexible.map(task => ({
      task,
      start: getTaskStart(task)!,
      end: getTaskEnd(task) ?? getTaskStart(task)! + getTaskDuration(task),
      fixed: false,
    }))
    return [...fixedItems, ...flexItems].sort((a, b) => a.start - b.start || Number(b.fixed) - Number(a.fixed))
  }, [fixed, placedFlexible])

  function resetForm(nextMode: AddMode = mode) {
    setMode(nextMode)
    setEditingTask(null)
    setText('')
    setStartTime('')
    setEndTime('')
    setDuration(60)
    setCategoryId(categories[0]?.id ?? '')
  }

  function openCreate(nextMode: AddMode) {
    resetForm(nextMode)
    setShowAdd(true)
  }

  function openEdit(task: Task) {
    const fixedTask = isFixedTask(task)
    setMode(fixedTask ? 'fixed' : 'flex')
    setEditingTask(task)
    setText(task.text)
    setCategoryId(fixedTask ? SCHEDULE_CAT_ID : task.category_id)
    setStartTime(task.start_time ?? task.time ?? '')
    setEndTime(task.end_time ?? '')
    setDuration(getTaskDuration(task))
    setShowAdd(true)
  }

  function closeForm() {
    setShowAdd(false)
    resetForm('flex')
  }

  function switchMode(nextMode: AddMode) {
    setMode(nextMode)
    if (nextMode === 'flex' && !categories.some(category => category.id === categoryId)) {
      setCategoryId(categories[0]?.id ?? '')
    }
  }

  function submit() {
    const title = text.trim()
    if (!title) return
    if (mode === 'fixed' && (!startTime || !endTime || endTime <= startTime)) return
    const schedule: TaskScheduleInput = mode === 'fixed'
      ? { fixed: true, start_time: startTime, end_time: endTime }
      : { fixed: false, duration_min: duration, ...(startTime ? { start_time: startTime } : {}) }

    if (editingTask) {
      const category = categories.find(item => item.id === categoryId)
      onUpdateTask(editingTask.id, {
        text: title,
        ...schedule,
        time: schedule.start_time,
        start_time: startTime || undefined,
        category_id: mode === 'fixed' ? SCHEDULE_CAT_ID : categoryId,
        category_name: mode === 'fixed' ? '일정' : (category?.name ?? editingTask.category_name),
        category_color: mode === 'fixed' ? 'blue' : (category?.color ?? editingTask.category_color),
        end_time: mode === 'fixed' ? endTime : undefined,
      })
    } else {
      const targetCategory = mode === 'fixed' ? SCHEDULE_CAT_ID : categoryId
      if (!targetCategory) return
      onAddTask(targetCategory, title, schedule)
    }
    closeForm()
  }

  function moveTaskToStart(task: Task, value: string) {
    onUpdateTask(task.id, { start_time: value || undefined, time: value || undefined })
  }

  return (
    <section className={clsx('w-full', compact ? 'px-4 pt-4' : '')}>
      <div className={clsx('flex items-center justify-between gap-3', compact ? 'mb-4' : 'mb-5')}>
        {onDateChange && (
          <button
            type="button"
            aria-label="이전 날짜"
            onClick={() => onDateChange(formatDate(subDays(dateObject, 1)))}
            className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-white"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <div className={clsx(onDateChange ? 'text-center' : '')}>
          <p className="text-xs font-semibold text-[var(--purple)] mb-1">{isToday ? 'TODAY' : 'DAY PLAN'}</p>
          <h2 className={clsx('font-bold tracking-tight', compact ? 'text-lg' : 'text-2xl')}>
            {format(dateObject, 'M월 d일 EEEE', { locale: ko })}
          </h2>
          <p className="text-sm text-[var(--text-3)] mt-1">
            남은 시간을 먼저 보고, 할 수 있는 만큼만 배치하세요.
          </p>
        </div>
        {onDateChange && (
          <button
            type="button"
            aria-label="다음 날짜"
            onClick={() => onDateChange(formatDate(addDays(dateObject, 1)))}
            className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-white"
          >
            <ChevronRight size={18} />
          </button>
        )}
      </div>

      <div className={clsx('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-4')}>
        <div className="rounded-[16px] bg-[var(--purple)] text-white p-4">
          <div className="flex items-center gap-2 text-xs text-white/70"><Clock3 size={14} /> 남은 가용시간</div>
          <p className="text-2xl font-bold mt-2">{formatDuration(capacity.availableMinutes)}</p>
          <p className="text-[11px] text-white/65 mt-1">고정 일정을 제외한 시간</p>
        </div>
        <div className="rounded-[16px] bg-white border border-[var(--border)] p-4">
          <div className="flex items-center gap-2 text-xs text-[var(--text-3)]"><Sparkles size={14} /> 유동 작업량</div>
          <p className="text-2xl font-bold mt-2">{formatDuration(capacity.flexibleMinutes)}</p>
          <p className="text-[11px] text-[var(--text-3)] mt-1">완료 전 작업 기준</p>
        </div>
        <div className="rounded-[16px] bg-white border border-[var(--border)] p-4">
          <div className="flex items-center gap-2 text-xs text-[var(--text-3)]"><CalendarClock size={14} /> 고정 일정</div>
          <p className="text-2xl font-bold mt-2">{fixed.length}개</p>
          <p className="text-[11px] text-[var(--text-3)] mt-1">시간을 먼저 확보합니다</p>
        </div>
        <div className={clsx(
          'rounded-[16px] border p-4',
          capacity.overloadMinutes > 0
            ? 'bg-[var(--red-bg)] border-[var(--red)]'
            : 'bg-[var(--teal-bg)] border-[var(--teal)]',
        )}>
          <div className={clsx(
            'flex items-center gap-2 text-xs',
            capacity.overloadMinutes > 0 ? 'text-[var(--red-text)]' : 'text-[var(--teal-text)]',
          )}>
            {capacity.overloadMinutes > 0 ? <AlertTriangle size={14} /> : <Check size={14} />}
            {capacity.overloadMinutes > 0 ? '과부하' : '현실적인 계획'}
          </div>
          <p className="text-2xl font-bold mt-2">
            {capacity.overloadMinutes > 0 ? `+${formatDuration(capacity.overloadMinutes)}` : '여유 있음'}
          </p>
          <p className="text-[11px] opacity-70 mt-1">가용시간 대비 작업량</p>
        </div>
      </div>

      <div className="bg-white border border-[var(--border)] rounded-[18px] p-4 mt-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold">오늘의 핵심 3가지</h3>
            <p className="text-xs text-[var(--text-3)] mt-0.5">이 세 가지가 끝나면 오늘은 성공입니다.</p>
          </div>
          <span className="text-[11px] text-[var(--purple)] font-semibold">최대 3개</span>
        </div>
        <div className={clsx('grid gap-2', compact ? 'grid-cols-1' : 'md:grid-cols-3')}>
          {[0, 1, 2].map(index => (
            <label key={index} className="flex items-center gap-2 rounded-[11px] bg-[var(--surface-2)] px-3 py-2">
              <span className="h-5 w-5 rounded-full bg-[var(--purple)] text-white text-[11px] font-bold flex items-center justify-center shrink-0">{index + 1}</span>
              <input
                value={(entry.meta.top3 ?? [])[index] ?? ''}
                onChange={event => {
                  const next = [...(entry.meta.top3 ?? [])]
                  while (next.length <= index) next.push('')
                  next[index] = event.target.value
                  onMetaChange({ top3: next })
                }}
                placeholder="핵심 작업"
                className="w-full min-w-0 bg-transparent outline-none text-sm"
              />
            </label>
          ))}
        </div>
      </div>

      <div className={clsx('grid gap-4 mt-4', compact ? 'grid-cols-1' : 'xl:grid-cols-[1.35fr_0.9fr]')}>
        <div className="bg-white border border-[var(--border)] rounded-[18px] overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
            <div>
              <h3 className="text-sm font-bold">오늘의 타임라인</h3>
              <p className="text-xs text-[var(--text-3)] mt-0.5">고정 일정과 배치된 작업</p>
            </div>
            <button
              type="button"
              onClick={() => openCreate('fixed')}
              className="px-3 py-1.5 rounded-[9px] bg-[var(--blue-bg)] text-[var(--blue-text)] text-xs font-semibold flex items-center gap-1"
            >
              <Plus size={13} /> 일정
            </button>
          </div>

          <div className="px-4 py-3 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-2)]/50">
            <span className="text-[11px] text-[var(--text-3)]">활동 시간</span>
            <input
              aria-label="활동 시작 시간"
              type="time"
              value={dayStart === '24:00' ? '23:59' : dayStart}
              onChange={event => onMetaChange({ dayStart: event.target.value })}
              className="px-2 py-1 rounded-[7px] bg-white border border-[var(--border)] text-xs outline-none"
            />
            <span className="text-[var(--text-3)]">–</span>
            <input
              aria-label="활동 종료 시간"
              type="time"
              value={dayEnd === '24:00' ? '23:59' : dayEnd}
              onChange={event => onMetaChange({ dayEnd: event.target.value })}
              className="px-2 py-1 rounded-[7px] bg-white border border-[var(--border)] text-xs outline-none"
            />
          </div>

          <div className="p-4">
            {chronological.length === 0 ? (
              <button
                type="button"
                onClick={() => openCreate('fixed')}
                className="w-full min-h-40 rounded-[14px] border border-dashed border-[var(--border-strong)] flex flex-col items-center justify-center text-center hover:bg-[var(--surface-2)] transition-colors"
              >
                <CalendarClock size={24} className="text-[var(--text-3)] mb-2" />
                <span className="text-sm font-medium">아직 배치된 일정이 없습니다</span>
                <span className="text-xs text-[var(--text-3)] mt-1">먼저 수업·약속 같은 고정 시간을 넣어보세요.</span>
              </button>
            ) : (
              <div className="relative pl-16">
                <div className="absolute left-[52px] top-2 bottom-2 w-px bg-[var(--border)]" />
                {chronological.map(({ task, start, end, fixed: fixedItem }) => (
                  <div key={task.id} className="relative pb-3 last:pb-0 group">
                    <span className="absolute -left-16 top-2 w-12 text-right text-[11px] font-medium text-[var(--text-3)]">
                      {minutesToTime(start)}
                    </span>
                    <span className={clsx(
                      'absolute -left-[17px] top-2.5 h-2.5 w-2.5 rounded-full ring-4 ring-white',
                      fixedItem ? 'bg-[var(--blue)]' : 'bg-[var(--purple)]',
                    )} />
                    <button
                      type="button"
                      onClick={() => openEdit(task)}
                      className={clsx(
                        'w-full text-left rounded-[12px] px-3 py-2.5 border transition-colors',
                        fixedItem
                          ? 'bg-[var(--blue-bg)] border-blue-200 hover:border-[var(--blue)]'
                          : `cat-${task.category_color} border-transparent hover:border-[var(--border-strong)]`,
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {!fixedItem && <CategoryDot color={task.category_color} />}
                        <span className="text-sm font-semibold flex-1 min-w-0 truncate">{task.text}</span>
                        <span className="text-[10px] opacity-65">{fixedItem ? '고정' : '유동'}</span>
                      </div>
                      <p className="text-[11px] opacity-70 mt-1">{minutesToTime(start)}–{minutesToTime(end)} · {formatDuration(end - start)}</p>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-white border border-[var(--border)] rounded-[18px] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <div>
                <h3 className="text-sm font-bold">할 일 배치</h3>
                <p className="text-xs text-[var(--text-3)] mt-0.5">대기 {waitingFlexible.length}개 · 완료 {doneCount}/{totalCount}</p>
              </div>
              <button
                type="button"
                onClick={() => openCreate('flex')}
                className="px-3 py-1.5 rounded-[9px] bg-[var(--purple)] text-white text-xs font-semibold flex items-center gap-1"
              >
                <Plus size={13} /> 작업
              </button>
            </div>

            <div className="p-3 flex flex-col gap-2 max-h-[480px] overflow-y-auto scrollbar-thin">
              {flexible.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-[var(--text-3)]">오늘 할 일이 없습니다.</p>
                  <button type="button" onClick={() => openCreate('flex')} className="text-xs text-[var(--purple)] font-semibold mt-2">첫 작업 추가하기</button>
                </div>
              ) : flexible.map(task => (
                <div key={task.id} className={clsx(
                  'rounded-[12px] border px-3 py-2.5 group',
                  task.done ? 'bg-[var(--surface-2)] border-transparent opacity-60' : 'bg-white border-[var(--border)]',
                )}>
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      aria-label={task.done ? '완료 취소' : '완료'}
                      onClick={() => onToggleTask(task.id)}
                      className={clsx(
                        'mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0',
                        task.done ? 'bg-[var(--teal)] border-[var(--teal)] text-white' : 'border-[var(--border-strong)]',
                      )}
                    >
                      {task.done && <Check size={11} strokeWidth={3} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <CategoryDot color={task.category_color} />
                        <p className={clsx('text-sm font-medium truncate', task.done && 'line-through')}>{task.text}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[11px] text-[var(--text-3)]">{formatDuration(getTaskDuration(task))}</span>
                        {!task.done && (
                          <input
                            aria-label={`${task.text} 시작 시간`}
                            type="time"
                            value={task.start_time ?? task.time ?? ''}
                            onChange={event => moveTaskToStart(task, event.target.value)}
                            className="px-1.5 py-0.5 rounded-[6px] bg-[var(--surface-2)] text-[11px] outline-none"
                          />
                        )}
                        {getTaskStart(task) !== null && <span className="text-[10px] text-[var(--purple)]">배치됨</span>}
                      </div>
                    </div>
                    <button type="button" onClick={() => openEdit(task)} aria-label="수정" className="p-1 text-[var(--text-3)] hover:text-[var(--purple)]"><Pencil size={13} /></button>
                    <button type="button" onClick={() => onDeleteTask(task.id)} aria-label="삭제" className="p-1 text-[var(--text-3)] hover:text-[var(--red)]"><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {capacity.free.length > 0 && (
            <div className="bg-white border border-[var(--border)] rounded-[18px] p-4">
              <h3 className="text-sm font-bold">남은 빈 시간</h3>
              <div className="flex flex-wrap gap-2 mt-3">
                {capacity.free.map(block => (
                  <span key={`${block.start}-${block.end}`} className="px-2.5 py-1.5 rounded-full bg-[var(--teal-bg)] text-[var(--teal-text)] text-xs font-medium">
                    {minutesToTime(block.start)}–{minutesToTime(block.end)} · {formatDuration(block.end - block.start)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="today-task-form-title"
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] flex items-end md:items-center justify-center"
          onMouseDown={event => { if (event.target === event.currentTarget) closeForm() }}
        >
          <div className="w-full md:max-w-md bg-white rounded-t-[22px] md:rounded-[22px] border border-[var(--border)] shadow-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-semibold text-[var(--purple)]">{editingTask ? 'EDIT' : 'QUICK ADD'}</p>
                <h3 id="today-task-form-title" className="text-lg font-bold mt-0.5">{editingTask ? '항목 수정' : '오늘에 추가'}</h3>
              </div>
              <button type="button" onClick={closeForm} className="h-8 w-8 rounded-full bg-[var(--surface-2)] flex items-center justify-center" aria-label="닫기"><X size={16} /></button>
            </div>

            <div className="grid grid-cols-2 bg-[var(--surface-2)] rounded-[10px] p-1 mb-4">
              <button type="button" onClick={() => switchMode('flex')} className={clsx('py-2 rounded-[8px] text-sm font-semibold', mode === 'flex' ? 'bg-white shadow-sm' : 'text-[var(--text-3)]')}>유동 작업</button>
              <button type="button" onClick={() => switchMode('fixed')} className={clsx('py-2 rounded-[8px] text-sm font-semibold', mode === 'fixed' ? 'bg-white shadow-sm' : 'text-[var(--text-3)]')}>고정 일정</button>
            </div>

            <label className="block text-xs font-semibold text-[var(--text-2)] mb-1.5">무엇을 하나요?</label>
            <input
              autoFocus
              value={text}
              onChange={event => setText(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') submit(); if (event.key === 'Escape') closeForm() }}
              placeholder={mode === 'fixed' ? '예: 제어공학 수업' : '예: 강화학습 강의 2개 듣기'}
              className="w-full px-3 py-2.5 rounded-[10px] bg-[var(--surface-2)] outline-none focus:ring-1 focus:ring-[var(--purple)] text-sm"
            />

            {mode === 'flex' ? (
              <div className="grid grid-cols-2 gap-3 mt-4">
                <label className="block">
                  <span className="block text-xs font-semibold text-[var(--text-2)] mb-1.5">카테고리</span>
                  <select value={categoryId} onChange={event => setCategoryId(event.target.value)} className="w-full px-3 py-2.5 rounded-[10px] bg-[var(--surface-2)] outline-none text-sm">
                    {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-[var(--text-2)] mb-1.5">예상 시간</span>
                  <select value={duration} onChange={event => setDuration(Number(event.target.value))} className="w-full px-3 py-2.5 rounded-[10px] bg-[var(--surface-2)] outline-none text-sm">
                    {DURATION_OPTIONS.map(value => <option key={value} value={value}>{formatDuration(value)}</option>)}
                  </select>
                </label>
                <label className="block col-span-2">
                  <span className="block text-xs font-semibold text-[var(--text-2)] mb-1.5">배치 시간 <span className="font-normal text-[var(--text-3)]">(선택)</span></span>
                  <input type="time" value={startTime} onChange={event => setStartTime(event.target.value)} className="w-full px-3 py-2.5 rounded-[10px] bg-[var(--surface-2)] outline-none text-sm" />
                </label>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 mt-4">
                <label className="block">
                  <span className="block text-xs font-semibold text-[var(--text-2)] mb-1.5">시작</span>
                  <input type="time" value={startTime} onChange={event => setStartTime(event.target.value)} className="w-full px-3 py-2.5 rounded-[10px] bg-[var(--surface-2)] outline-none text-sm" />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-[var(--text-2)] mb-1.5">종료</span>
                  <input type="time" value={endTime} onChange={event => setEndTime(event.target.value)} className="w-full px-3 py-2.5 rounded-[10px] bg-[var(--surface-2)] outline-none text-sm" />
                </label>
              </div>
            )}

            {mode === 'fixed' && startTime && endTime && endTime <= startTime && (
              <p className="text-xs text-[var(--red)] mt-2">종료 시간은 시작 시간보다 늦어야 합니다.</p>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={closeForm} className="px-4 py-2 rounded-[9px] text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]">취소</button>
              <button type="button" onClick={submit} className="px-5 py-2 rounded-[9px] text-sm font-semibold bg-[var(--purple)] text-white disabled:opacity-40" disabled={!text.trim() || (mode === 'fixed' && (!startTime || !endTime || endTime <= startTime))}>
                {editingTask ? '저장' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
