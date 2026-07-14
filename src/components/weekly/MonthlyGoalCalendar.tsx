'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, GripHorizontal, Plus, X } from 'lucide-react'
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import clsx from 'clsx'
import { formatDate } from '@/lib/dates'
import type { ShortGoal } from '@/types'

interface Props {
  monthBase: Date
  goals: ShortGoal[]
  selectedDate: string
  onMonthChange: (date: Date) => void
  onSelectDate: (date: string) => void
  onAddGoal: (goal: Omit<ShortGoal, 'id'>) => void
  onUpdateGoal: (goalId: string, patch: Partial<ShortGoal>) => void
}

interface WeekGoalSegment {
  goal: ShortGoal
  startColumn: number
  endColumn: number
  lane: number
}

const GOAL_COLORS = [
  'bg-[var(--purple-bg)] text-[var(--purple-text)] border-purple-200',
  'bg-[var(--teal-bg)] text-[var(--teal-text)] border-teal-200',
  'bg-[var(--amber-bg)] text-[var(--amber-text)] border-amber-200',
  'bg-[var(--coral-bg)] text-[var(--coral-text)] border-orange-200',
  'bg-[var(--blue-bg)] text-[var(--blue-text)] border-blue-200',
]

function orderedRange(a: string, b: string) {
  return a <= b ? { from: a, to: b } : { from: b, to: a }
}

function packWeekGoals(week: Date[], goals: ShortGoal[]): WeekGoalSegment[] {
  const weekStart = formatDate(week[0])
  const weekEnd = formatDate(week[6])
  const candidates = goals
    .filter(goal => goal.date_from <= weekEnd && goal.date_to >= weekStart)
    .map(goal => ({
      goal,
      startColumn: Math.max(0, differenceInCalendarDays(parseISO(goal.date_from), week[0])),
      endColumn: Math.min(6, differenceInCalendarDays(parseISO(goal.date_to), week[0])),
    }))
    .sort((a, b) => a.startColumn - b.startColumn || b.endColumn - a.endColumn)

  const laneEnds: number[] = []
  return candidates.map(candidate => {
    let lane = laneEnds.findIndex(end => end < candidate.startColumn)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = candidate.endColumn
    return { ...candidate, lane }
  })
}

export function MonthlyGoalCalendar({ monthBase, goals, selectedDate, onMonthChange, onSelectDate, onAddGoal, onUpdateGoal }: Props) {
  const [dragStart, setDragStart] = useState<string | null>(null)
  const [dragEnd, setDragEnd] = useState<string | null>(null)
  const [draggedGoalId, setDraggedGoalId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthBase), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(monthBase), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [monthBase])
  const weeks = useMemo(() => Array.from({ length: Math.ceil(days.length / 7) }, (_, index) => days.slice(index * 7, index * 7 + 7)), [days])
  const goalColor = useMemo(() => new Map(goals.map((goal, index) => [goal.id, GOAL_COLORS[index % GOAL_COLORS.length]])), [goals])
  const selectedRange = dragStart && dragEnd ? orderedRange(dragStart, dragEnd) : null

  function finishRange(date: string) {
    if (!dragStart || draggedGoalId) return
    setDragEnd(date)
    setShowCreate(true)
  }

  function cancelCreate() {
    setShowCreate(false)
    setTitle('')
    setDragStart(null)
    setDragEnd(null)
  }

  function createGoal() {
    if (!title.trim() || !dragStart || !dragEnd) return
    const range = orderedRange(dragStart, dragEnd)
    onAddGoal({ title: title.trim(), date_from: range.from, date_to: range.to, note: '', tasks: [], categories: [], routines: [] })
    cancelCreate()
  }

  function moveGoal(goalId: string, targetDate: string) {
    const goal = goals.find(item => item.id === goalId)
    if (!goal) return
    const duration = differenceInCalendarDays(parseISO(goal.date_to), parseISO(goal.date_from))
    onUpdateGoal(goal.id, { date_from: targetDate, date_to: formatDate(addDays(parseISO(targetDate), duration)) })
    setDraggedGoalId(null)
  }

  return (
    <section className="bg-white border border-[var(--border)] rounded-[18px] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
        <div>
          <h3 className="text-sm font-bold">월간 단기 일정</h3>
          <p className="text-xs text-[var(--text-3)] mt-0.5">빈 날짜를 드래그해 만들고, 연속된 일정 바를 다른 날짜로 옮길 수 있습니다.</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="이전 달" onClick={() => onMonthChange(subMonths(monthBase, 1))} className="w-8 h-8 rounded-[8px] hover:bg-[var(--surface-2)] flex items-center justify-center"><ChevronLeft size={15} /></button>
          <button type="button" onClick={() => onMonthChange(new Date())} className="px-3 h-8 rounded-[8px] hover:bg-[var(--surface-2)] text-sm font-semibold min-w-24">{format(monthBase, 'yyyy년 M월', { locale: ko })}</button>
          <button type="button" aria-label="다음 달" onClick={() => onMonthChange(addMonths(monthBase, 1))} className="w-8 h-8 rounded-[8px] hover:bg-[var(--surface-2)] flex items-center justify-center"><ChevronRight size={15} /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--surface-2)]/60">
        {['월', '화', '수', '목', '금', '토', '일'].map((day, index) => <div key={day} className={clsx('px-2 py-2 text-center text-[11px] font-semibold text-[var(--text-3)]', index > 0 && 'border-l border-[var(--border)]')}>{day}</div>)}
      </div>

      <div className="select-none">
        {weeks.map((week, weekIndex) => {
          const segments = packWeekGoals(week, goals)
          const laneCount = segments.reduce((max, segment) => Math.max(max, segment.lane + 1), 0)
          const rowHeight = Math.max(112, 44 + laneCount * 25 + 10)
          return (
            <div key={formatDate(week[0])} className={clsx('relative', weekIndex > 0 && 'border-t border-[var(--border)]')} style={{ height: rowHeight }}>
              <div className="absolute inset-0 grid grid-cols-7">
                {week.map((day, dayIndex) => {
                  const date = formatDate(day)
                  const inSelection = selectedRange && date >= selectedRange.from && date <= selectedRange.to
                  return (
                    <div
                      key={date}
                      onMouseDown={event => {
                        if (event.button !== 0 || draggedGoalId) return
                        setDragStart(date)
                        setDragEnd(date)
                      }}
                      onMouseEnter={() => { if (dragStart && !showCreate && !draggedGoalId) setDragEnd(date) }}
                      onMouseUp={() => finishRange(date)}
                      onDragOver={event => event.preventDefault()}
                      onDrop={event => {
                        event.preventDefault()
                        if (draggedGoalId) moveGoal(draggedGoalId, date)
                      }}
                      className={clsx(
                        'relative p-1.5 transition-colors',
                        dayIndex > 0 && 'border-l border-[var(--border)]',
                        !isSameMonth(day, monthBase) && 'bg-[var(--surface-2)]/35',
                        inSelection && 'bg-[var(--purple-bg)]',
                      )}
                    >
                      <button
                        type="button"
                        onMouseDown={event => event.stopPropagation()}
                        onMouseUp={event => event.stopPropagation()}
                        onClick={() => onSelectDate(date)}
                        className={clsx('w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center', selectedDate === date ? 'bg-[var(--purple)] text-white' : isSameMonth(day, monthBase) ? 'hover:bg-[var(--surface-2)]' : 'text-[var(--text-3)]')}
                      >
                        {day.getDate()}
                      </button>
                    </div>
                  )
                })}
              </div>

              <div className="pointer-events-none absolute inset-x-0 top-10 grid grid-cols-7 gap-y-1 px-1" style={{ gridAutoRows: '21px' }}>
                {segments.map(segment => (
                  <div
                    key={segment.goal.id}
                    draggable
                    onMouseDown={event => event.stopPropagation()}
                    onDragStart={event => {
                      event.stopPropagation()
                      setDraggedGoalId(segment.goal.id)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => setDraggedGoalId(null)}
                    className={clsx('pointer-events-auto mx-0.5 px-2 rounded-[6px] border text-[10px] font-semibold truncate cursor-grab active:cursor-grabbing flex items-center gap-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]', goalColor.get(segment.goal.id))}
                    style={{ gridColumn: `${segment.startColumn + 1} / ${segment.endColumn + 2}`, gridRow: segment.lane + 1 }}
                    title={`${segment.goal.title} (${segment.goal.date_from} ~ ${segment.goal.date_to})`}
                  >
                    <GripHorizontal size={10} className="shrink-0" />
                    <span className="truncate">{segment.goal.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {showCreate && selectedRange && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={cancelCreate}>
          <div className="w-full max-w-sm bg-white rounded-[18px] shadow-xl p-5" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><div><h3 className="text-base font-bold">단기 일정 추가</h3><p className="text-xs text-[var(--text-3)] mt-1">{selectedRange.from} ~ {selectedRange.to}</p></div><button type="button" onClick={cancelCreate} className="w-8 h-8 rounded-full hover:bg-[var(--surface-2)] flex items-center justify-center"><X size={16} /></button></div>
            <div className="flex gap-2">
              <input autoFocus value={title} onChange={event => setTitle(event.target.value)} onKeyDown={event => event.key === 'Enter' && createGoal()} placeholder="단기 일정 제목" className="flex-1 min-w-0 px-3 py-2.5 rounded-[10px] bg-[var(--surface-2)] text-sm outline-none focus:ring-1 focus:ring-[var(--purple)]" />
              <button type="button" onClick={createGoal} className="px-3 rounded-[10px] bg-[var(--purple)] text-white text-sm font-semibold flex items-center gap-1"><Plus size={14} /> 추가</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
