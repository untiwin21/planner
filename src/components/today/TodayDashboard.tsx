'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  HeartPulse,
  Moon,
  Pencil,
  Plus,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { addDays, format, parseISO, subDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import clsx from 'clsx'
import type { BadgeColor, Category, DayEntry, DayMeta, Task, TaskScheduleInput } from '@/types'
import { DEADLINE_CAT_ID, SCHEDULE_CAT_ID } from '@/types'
import { formatDate, formatSleepMin } from '@/lib/dates'
import {
  DEFAULT_DAY_END,
  DEFAULT_DAY_START,
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
  onAddCategory?: (category: Omit<Category, 'id'>) => void
  onDeleteCategory?: (categoryId: string) => void
  compact?: boolean
}

const CATEGORY_COLORS: BadgeColor[] = ['purple', 'teal', 'amber', 'coral', 'blue']
const CONDITION_LABELS: Record<number, string> = {
  1: '매우 나쁨',
  2: '나쁨',
  3: '보통',
  4: '좋음',
  5: '매우 좋음',
}
const CONDITION_EMOJI: Record<number, string> = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' }

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
  onAddCategory,
  onDeleteCategory,
  compact = false,
}: Props) {
  const [nowMinute, setNowMinute] = useState(nowAsMinutes)
  const [editingTop3, setEditingTop3] = useState(false)
  const [showWellness, setShowWellness] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState<BadgeColor>('purple')
  const [taskText, setTaskText] = useState('')
  const [durationText, setDurationText] = useState('60')
  const selectableCategories = categories.filter(category => category.id !== SCHEDULE_CAT_ID && category.id !== DEADLINE_CAT_ID)
  const [categoryId, setCategoryId] = useState(selectableCategories[0]?.id ?? '')

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
    if (!selectableCategories.some(category => category.id === categoryId)) {
      setCategoryId(selectableCategories[0]?.id ?? '')
    }
  }, [categoryId, selectableCategories])

  const capacity = useMemo(
    () => remainingCapacity(entry.tasks, dayStart, dayEnd, isToday ? nowMinute : undefined),
    [entry.tasks, dayStart, dayEnd, isToday, nowMinute],
  )

  // Timeline visibility is intentionally independent from remaining capacity.
  // Past fixed events must stay visible instead of disappearing as the clock advances.
  const chronological = useMemo(() => entry.tasks
    .filter(task => isFixedTask(task) || getTaskStart(task) !== null)
    .map(task => {
      const start = getTaskStart(task)
      if (start === null) return null
      const end = getTaskEnd(task) ?? Math.min(24 * 60, start + getTaskDuration(task))
      return { task, start, end, fixed: isFixedTask(task) }
    })
    .filter((item): item is { task: Task; start: number; end: number; fixed: boolean } => item !== null)
    .sort((a, b) => a.start - b.start || Number(b.fixed) - Number(a.fixed)), [entry.tasks])

  const flexible = useMemo(() => entry.tasks
    .filter(task => !isFixedTask(task) && task.category_id !== DEADLINE_CAT_ID)
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.updated_at ?? 0) - (b.updated_at ?? 0)), [entry.tasks])

  const currentCategory = selectableCategories.find(category => category.id === categoryId)
  const filledTop3 = (entry.meta.top3 ?? []).filter(item => item.trim())

  function addTask() {
    const title = taskText.trim()
    const duration = Math.max(1, Number.parseInt(durationText, 10) || 0)
    if (!title || !categoryId || duration <= 0) return
    onAddTask(categoryId, title, { fixed: false, duration_min: duration })
    setTaskText('')
  }

  function addCategory() {
    const name = newCategoryName.trim()
    if (!name || !onAddCategory) return
    onAddCategory({ name, color: newCategoryColor })
    setNewCategoryName('')
    setShowCategoryForm(false)
  }

  function setTop3(index: number, value: string) {
    const next = [...(entry.meta.top3 ?? [])]
    while (next.length <= index) next.push('')
    next[index] = value
    onMetaChange({ top3: next })
  }

  return (
    <section className={clsx('w-full', compact ? 'px-4 pt-4' : '')}>
      <div className={clsx('flex items-center justify-between gap-3', compact ? 'mb-4' : 'mb-5')}>
        {onDateChange && (
          <button type="button" aria-label="이전 날짜" onClick={() => onDateChange(formatDate(subDays(dateObject, 1)))} className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-white">
            <ChevronLeft size={18} />
          </button>
        )}
        <div className={clsx(onDateChange ? 'text-center' : '')}>
          <p className="text-xs font-semibold text-[var(--purple)] mb-1">{isToday ? 'TODAY' : 'DAY PLAN'}</p>
          <h2 className={clsx('font-bold tracking-tight', compact ? 'text-lg' : 'text-2xl')}>{format(dateObject, 'M월 d일 EEEE', { locale: ko })}</h2>
          <p className="text-sm text-[var(--text-3)] mt-1">남은 시간을 먼저 보고, 할 수 있는 만큼만 계획하세요.</p>
        </div>
        {onDateChange && (
          <button type="button" aria-label="다음 날짜" onClick={() => onDateChange(formatDate(addDays(dateObject, 1)))} className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-white">
            <ChevronRight size={18} />
          </button>
        )}
      </div>

      <div className={clsx('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-4')}>
        <div className="rounded-[16px] bg-[var(--purple)] text-white p-4">
          <div className="flex items-center gap-2 text-xs text-white/70"><Clock3 size={14} /> 남은 가용시간</div>
          <p className="text-2xl font-bold mt-2">{formatDuration(capacity.availableMinutes)}</p>
          <p className="text-[11px] text-white/65 mt-1">현재부터 활동 종료까지</p>
        </div>

        <button type="button" onClick={() => setShowWellness(true)} className="rounded-[16px] bg-white border border-[var(--border)] p-4 text-left hover:border-[var(--purple)] transition-colors">
          <div className="flex items-center gap-2 text-xs text-[var(--text-3)]"><Moon size={14} /> 수면시간</div>
          <p className="text-2xl font-bold mt-2">{entry.meta.sleep != null ? formatSleepMin(entry.meta.sleep) : '기록 전'}</p>
          <p className="text-[11px] text-[var(--purple)] mt-1">클릭하여 기록</p>
        </button>

        <button type="button" onClick={() => setShowWellness(true)} className="rounded-[16px] bg-white border border-[var(--border)] p-4 text-left hover:border-[var(--purple)] transition-colors">
          <div className="flex items-center gap-2 text-xs text-[var(--text-3)]"><HeartPulse size={14} /> 컨디션</div>
          <p className="text-2xl font-bold mt-2">{entry.meta.condition != null ? `${CONDITION_EMOJI[entry.meta.condition]} ${CONDITION_LABELS[entry.meta.condition]}` : '기록 전'}</p>
          <p className="text-[11px] text-[var(--purple)] mt-1">클릭하여 기록</p>
        </button>

        <div className={clsx('rounded-[16px] border p-4', capacity.overloadMinutes > 0 ? 'bg-[var(--red-bg)] border-[var(--red)]' : 'bg-[var(--teal-bg)] border-[var(--teal)]')}>
          <div className={clsx('flex items-center gap-2 text-xs', capacity.overloadMinutes > 0 ? 'text-[var(--red-text)]' : 'text-[var(--teal-text)]')}>
            {capacity.overloadMinutes > 0 ? <AlertTriangle size={14} /> : <Check size={14} />}
            {capacity.overloadMinutes > 0 ? '과부하' : '현실적인 계획'}
          </div>
          <p className="text-2xl font-bold mt-2">{capacity.overloadMinutes > 0 ? `+${formatDuration(capacity.overloadMinutes)}` : '여유 있음'}</p>
          <p className="text-[11px] opacity-70 mt-1">가용시간 대비 예상 작업량</p>
        </div>
      </div>

      <div className="bg-white border border-[var(--border)] rounded-[18px] p-4 mt-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold">오늘의 핵심 3가지</h3>
            <p className="text-xs text-[var(--text-3)] mt-0.5">이 세 가지가 끝나면 오늘은 성공입니다.</p>
          </div>
          <button type="button" onClick={() => setEditingTop3(value => !value)} className="px-2.5 py-1.5 rounded-[8px] text-xs font-semibold text-[var(--purple)] hover:bg-[var(--purple-bg)] flex items-center gap-1">
            {editingTop3 ? <><Check size={13} /> 완료</> : <><Pencil size={13} /> 편집</>}
          </button>
        </div>
        {editingTop3 ? (
          <div className={clsx('grid gap-2', compact ? 'grid-cols-1' : 'md:grid-cols-3')}>
            {[0, 1, 2].map(index => (
              <label key={index} className="flex items-center gap-2 rounded-[12px] bg-[var(--surface-2)] px-3 py-2.5 border border-transparent focus-within:border-[var(--purple)] focus-within:bg-white">
                <span className="h-6 w-6 rounded-full bg-[var(--purple)] text-white text-xs font-bold flex items-center justify-center shrink-0">{index + 1}</span>
                <input value={(entry.meta.top3 ?? [])[index] ?? ''} onChange={event => setTop3(index, event.target.value)} placeholder="핵심 작업 입력" className="w-full min-w-0 bg-transparent outline-none text-sm" />
              </label>
            ))}
          </div>
        ) : filledTop3.length > 0 ? (
          <div className={clsx('grid gap-2', compact ? 'grid-cols-1' : 'md:grid-cols-3')}>
            {[0, 1, 2].map(index => {
              const value = (entry.meta.top3 ?? [])[index]?.trim()
              return (
                <div key={index} className={clsx('rounded-[13px] px-3.5 py-3 min-h-16 flex items-center gap-3', value ? 'bg-gradient-to-br from-[var(--purple-bg)] to-white border border-purple-100' : 'bg-[var(--surface-2)] border border-dashed border-[var(--border)]')}>
                  <span className={clsx('h-7 w-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0', value ? 'bg-[var(--purple)] text-white' : 'bg-white text-[var(--text-3)]')}>{index + 1}</span>
                  <p className={clsx('text-sm font-semibold leading-snug', !value && 'text-[var(--text-3)] font-normal')}>{value || '비어 있음'}</p>
                </div>
              )
            })}
          </div>
        ) : (
          <button type="button" onClick={() => setEditingTop3(true)} className="w-full py-6 rounded-[13px] border border-dashed border-[var(--border-strong)] text-sm text-[var(--text-3)] hover:bg-[var(--surface-2)]">오늘 반드시 끝낼 세 가지를 정해보세요.</button>
        )}
      </div>

      <div className={clsx('grid gap-4 mt-4', compact ? 'grid-cols-1' : 'xl:grid-cols-[1.15fr_1fr]')}>
        <div className="bg-white border border-[var(--border)] rounded-[18px] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h3 className="text-sm font-bold">오늘의 타임라인</h3>
            <p className="text-xs text-[var(--text-3)] mt-0.5">일정은 주간 페이지에서 입력하고, 여기서는 하루 전체 흐름을 확인합니다.</p>
          </div>
          <div className="px-4 py-3 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-2)]/50">
            <span className="text-[11px] text-[var(--text-3)]">활동 시간</span>
            <input aria-label="활동 시작 시간" type="time" value={dayStart === '24:00' ? '23:59' : dayStart} onChange={event => onMetaChange({ dayStart: event.target.value })} className="px-2 py-1 rounded-[7px] bg-white border border-[var(--border)] text-xs outline-none" />
            <span className="text-[var(--text-3)]">–</span>
            <input aria-label="활동 종료 시간" type="time" value={dayEnd === '24:00' ? '23:59' : dayEnd} onChange={event => onMetaChange({ dayEnd: event.target.value })} className="px-2 py-1 rounded-[7px] bg-white border border-[var(--border)] text-xs outline-none" />
          </div>
          <div className="p-4">
            {chronological.length === 0 ? (
              <div className="min-h-36 rounded-[14px] border border-dashed border-[var(--border-strong)] flex flex-col items-center justify-center text-center">
                <CalendarClock size={24} className="text-[var(--text-3)] mb-2" />
                <span className="text-sm font-medium">아직 배치된 일정이 없습니다.</span>
                <span className="text-xs text-[var(--text-3)] mt-1">주간 페이지에서 일정 시간을 입력하거나 할 일에 시작 시간을 지정하세요.</span>
              </div>
            ) : (
              <div className="relative pl-16">
                <div className="absolute left-[52px] top-2 bottom-2 w-px bg-[var(--border)]" />
                {chronological.map(({ task, start, end, fixed }) => (
                  <div key={task.id} className="relative pb-3 last:pb-0">
                    <span className="absolute -left-16 top-2 w-12 text-right text-[11px] font-medium text-[var(--text-3)]">{minutesToTime(start)}</span>
                    <span className={clsx('absolute -left-[17px] top-2.5 h-2.5 w-2.5 rounded-full ring-4 ring-white', fixed ? 'bg-[var(--blue)]' : 'bg-[var(--purple)]')} />
                    <div className={clsx('w-full rounded-[12px] px-3 py-2.5 border', task.done && 'opacity-50', fixed ? 'bg-[var(--blue-bg)] border-blue-200' : `cat-${task.category_color} border-transparent`)}>
                      <div className="flex items-center gap-2">
                        {!fixed && <CategoryDot color={task.category_color} />}
                        <span className={clsx('text-sm font-semibold flex-1 min-w-0 truncate', task.done && 'line-through')}>{task.text}</span>
                        <span className="text-[10px] opacity-65">{fixed ? '일정' : task.category_name}</span>
                      </div>
                      <p className="text-[11px] opacity-70 mt-1">{minutesToTime(start)}–{minutesToTime(end)} · {formatDuration(end - start)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-[var(--border)] rounded-[18px] overflow-visible self-start">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h3 className="text-sm font-bold">오늘 할 일</h3>
            <p className="text-xs text-[var(--text-3)] mt-0.5">카테고리, 할 일, 예상 시간을 한 번에 입력하세요.</p>
          </div>
          <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-2)]/45">
            <div className={clsx('grid gap-2', compact ? 'grid-cols-[auto_1fr_76px_auto]' : 'grid-cols-[minmax(104px,auto)_1fr_92px_auto]')}>
              <div className="relative">
                <button type="button" onClick={() => setShowCategories(value => !value)} className="h-10 w-full px-3 rounded-[10px] bg-white border border-[var(--border)] text-xs font-semibold flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">{currentCategory ? <CategoryDot color={currentCategory.color} /> : <Tag size={13} />}<span className="truncate">{currentCategory?.name ?? '카테고리'}</span></span>
                  <ChevronDown size={13} />
                </button>
                {showCategories && (
                  <div className="absolute z-30 top-full left-0 mt-1 w-56 bg-white border border-[var(--border)] rounded-[12px] shadow-lg p-2">
                    <div className="max-h-48 overflow-y-auto">
                      {selectableCategories.map(category => (
                        <div key={category.id} className="flex items-center gap-1 group">
                          <button type="button" onClick={() => { setCategoryId(category.id); setShowCategories(false) }} className="flex-1 px-2 py-2 rounded-[8px] hover:bg-[var(--surface-2)] text-sm text-left flex items-center gap-2">
                            <CategoryDot color={category.color} /> {category.name}
                          </button>
                          {onDeleteCategory && selectableCategories.length > 1 && (
                            <button type="button" aria-label={`${category.name} 삭제`} onClick={() => onDeleteCategory(category.id)} className="w-7 h-7 rounded-[7px] text-[var(--text-3)] opacity-0 group-hover:opacity-100 hover:text-[var(--red)] hover:bg-[var(--red-bg)] flex items-center justify-center"><Trash2 size={12} /></button>
                          )}
                        </div>
                      ))}
                    </div>
                    {onAddCategory && (
                      <div className="mt-1 pt-2 border-t border-[var(--border)]">
                        {showCategoryForm ? (
                          <div className="flex flex-col gap-2">
                            <input autoFocus value={newCategoryName} onChange={event => setNewCategoryName(event.target.value)} onKeyDown={event => event.key === 'Enter' && addCategory()} placeholder="새 카테고리" className="w-full px-2.5 py-2 rounded-[8px] bg-[var(--surface-2)] text-sm outline-none" />
                            <div className="flex gap-1">
                              {CATEGORY_COLORS.map(color => <button type="button" key={color} aria-label={color} onClick={() => setNewCategoryColor(color)} className={clsx(`h-5 w-5 rounded-full cat-${color}`, newCategoryColor === color && 'ring-2 ring-[var(--purple)] ring-offset-1')} />)}
                            </div>
                            <div className="flex gap-1">
                              <button type="button" onClick={addCategory} className="flex-1 py-1.5 rounded-[7px] bg-[var(--purple)] text-white text-xs font-semibold">추가</button>
                              <button type="button" onClick={() => setShowCategoryForm(false)} className="px-2 py-1.5 rounded-[7px] text-xs text-[var(--text-3)]">취소</button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setShowCategoryForm(true)} className="w-full px-2 py-2 rounded-[8px] text-xs font-semibold text-[var(--purple)] hover:bg-[var(--purple-bg)] flex items-center gap-1"><Plus size={12} /> 카테고리 추가</button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <input value={taskText} onChange={event => setTaskText(event.target.value)} onKeyDown={event => event.key === 'Enter' && addTask()} placeholder="할 일 입력" className="h-10 min-w-0 px-3 rounded-[10px] bg-white border border-[var(--border)] text-sm outline-none focus:border-[var(--purple)]" />
              <label className="h-10 px-2 rounded-[10px] bg-white border border-[var(--border)] flex items-center gap-1">
                <input aria-label="예상 시간(분)" inputMode="numeric" value={durationText} onChange={event => setDurationText(event.target.value.replace(/\D/g, '').slice(0, 4))} onKeyDown={event => event.key === 'Enter' && addTask()} className="w-full min-w-0 text-right text-sm font-semibold outline-none" />
                <span className="text-[11px] text-[var(--text-3)]">분</span>
              </label>
              <button type="button" onClick={addTask} aria-label="할 일 추가" className="h-10 w-10 rounded-[10px] bg-[var(--purple)] text-white flex items-center justify-center"><Plus size={17} /></button>
            </div>
          </div>

          <div className="p-3 flex flex-col gap-2 max-h-[520px] overflow-y-auto scrollbar-thin">
            {flexible.length === 0 ? (
              <div className="py-10 text-center text-sm text-[var(--text-3)]">오늘 할 일을 추가해보세요.</div>
            ) : flexible.map(task => (
              <div key={task.id} className={clsx('rounded-[12px] border px-3 py-2.5 group', task.done ? 'bg-[var(--surface-2)] border-transparent opacity-60' : 'bg-white border-[var(--border)]')}>
                <div className="flex items-start gap-2.5">
                  <button type="button" aria-label={task.done ? '완료 취소' : '완료'} onClick={() => onToggleTask(task.id)} className={clsx('mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0', task.done ? 'bg-[var(--teal)] border-[var(--teal)] text-white' : 'border-[var(--border-strong)]')}>{task.done && <Check size={11} strokeWidth={3} />}</button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5"><CategoryDot color={task.category_color} /><p className={clsx('text-sm font-medium truncate', task.done && 'line-through')}>{task.text}</p></div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <label className="flex items-center gap-1 text-[11px] text-[var(--text-3)]">
                        예상
                        <input key={`${task.id}:${task.duration_min ?? ''}`} inputMode="numeric" defaultValue={getTaskDuration(task)} onBlur={event => { const value = Number.parseInt(event.target.value, 10); if (value > 0 && value !== getTaskDuration(task)) onUpdateTask(task.id, { duration_min: value }) }} className="w-14 px-1.5 py-1 rounded-[6px] bg-[var(--surface-2)] text-right text-xs font-semibold outline-none focus:bg-white focus:ring-1 focus:ring-[var(--purple)]" />분
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-[var(--text-3)]">
                        타임라인
                        <input type="time" value={task.start_time ?? task.time ?? ''} onChange={event => onUpdateTask(task.id, { start_time: event.target.value || undefined, time: event.target.value || undefined })} className="px-1.5 py-1 rounded-[6px] bg-[var(--surface-2)] text-xs outline-none focus:bg-white focus:ring-1 focus:ring-[var(--purple)]" />
                      </label>
                    </div>
                  </div>
                  <button type="button" onClick={() => onDeleteTask(task.id)} aria-label={`${task.text} 삭제`} className="w-7 h-7 rounded-[7px] opacity-40 group-hover:opacity-100 text-[var(--text-3)] hover:text-[var(--red)] hover:bg-[var(--red-bg)] flex items-center justify-center"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showWellness && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowWellness(false)}>
          <div className="w-full max-w-md bg-white rounded-[20px] shadow-xl p-5" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div><h3 className="text-lg font-bold">수면·컨디션 기록</h3><p className="text-xs text-[var(--text-3)] mt-1">오늘의 계획을 세우기 전에 몸 상태를 기록하세요.</p></div>
              <button type="button" onClick={() => setShowWellness(false)} className="w-8 h-8 rounded-full hover:bg-[var(--surface-2)] flex items-center justify-center"><X size={17} /></button>
            </div>
            <div className="mb-5">
              <label className="text-xs font-semibold text-[var(--text-2)] block mb-2">수면시간</label>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="24" value={entry.meta.sleep == null ? '' : Math.floor(entry.meta.sleep / 60)} onChange={event => { const hours = Math.max(0, Number(event.target.value) || 0); const minutes = (entry.meta.sleep ?? 0) % 60; onMetaChange({ sleep: hours * 60 + minutes }) }} placeholder="7" className="w-20 px-3 py-2.5 rounded-[10px] bg-[var(--surface-2)] outline-none text-center font-semibold" /><span className="text-sm text-[var(--text-3)]">시간</span>
                <input type="number" min="0" max="59" step="5" value={entry.meta.sleep == null ? '' : entry.meta.sleep % 60} onChange={event => { const minutes = Math.min(59, Math.max(0, Number(event.target.value) || 0)); const hours = Math.floor((entry.meta.sleep ?? 0) / 60); onMetaChange({ sleep: hours * 60 + minutes }) }} placeholder="30" className="w-20 px-3 py-2.5 rounded-[10px] bg-[var(--surface-2)] outline-none text-center font-semibold" /><span className="text-sm text-[var(--text-3)]">분</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-2)] block mb-2">컨디션</label>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map(level => <button type="button" key={level} onClick={() => onMetaChange({ condition: level })} className={clsx('py-3 rounded-[11px] border flex flex-col items-center gap-1 transition-all', entry.meta.condition === level ? 'border-[var(--purple)] bg-[var(--purple-bg)] ring-1 ring-[var(--purple)]' : 'border-[var(--border)] hover:bg-[var(--surface-2)]')}><span className="text-xl">{CONDITION_EMOJI[level]}</span><span className="text-[10px] text-[var(--text-3)]">{level}</span></button>)}
              </div>
            </div>
            <button type="button" onClick={() => setShowWellness(false)} className="w-full mt-5 py-2.5 rounded-[10px] bg-[var(--purple)] text-white text-sm font-semibold">완료</button>
          </div>
        </div>
      )}
    </section>
  )
}
