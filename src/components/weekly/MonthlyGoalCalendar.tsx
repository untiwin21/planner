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
          <p className="text-xs text-[var(--text-3)] mt-0.5">빈 날짜를 드래그해 단기 일정을 만들고, 일정 바를 다른 날짜로 옮길 수 있습니다.</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onMonthChange(subMonths(monthBase, 1))} className="w-8 h-8 rounded-[8px] hover:bg-[var(--surface-2)] flex items-center justify-center"><ChevronLeft size={15} /></button>
          <button type="button" onClick={() => onMonthChange(new Date())} className="px-3 h-8 rounded-[8px] hover:bg-[var(--surface-2)] text-sm font-semibold min-w-24">{format(monthBase, 'yyyy년 M월', { locale: ko })}</button>
          <button type="button" onClick={() => onMonthChange(addMonths(monthBase, 1))} className="w-8 h-8 rounded-[8px] hover:bg-[var(--surface-2)] flex items-center justify-center"><ChevronRight size={15} /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--surface-2)]/60">
        {['월', '화', '수', '목', '금', '토', '일'].map((day, index) => <div key={day} className={clsx('px-2 py-2 text-center text-[11px] font-semibold text-[var(--text-3)]', index > 0 && 'border-l border-[var(--border)]')}>{day}</div>)}
      </div>

      <div className="grid grid-cols-7 select-none">
        {days.map((day, index) => {
          const date = formatDate(day)
          const dayGoals = goals.filter(goal => goal.date_from <= date && goal.date_to >= date)
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
                'relative min-h-28 p-1.5 border-b border-[var(--border)] transition-colors',
                index % 7 !== 0 && 'border-l border-[var(--border)]',
                !isSameMonth(day, monthBase) && 'bg-[var(--surface-2)]/35',
                inSelection && 'bg-[var(--purple-bg)]',
              )}
            >
              <button
                type="button"
                onMouseDown={event => event.stopPropagation()}
                onMouseUp={event => event.stopPropagation()}
                onClick={() => onSelectDate(date)}
                className={clsx('w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center mb-1', selectedDate === date ? 'bg-[var(--purple)] text-white' : isSameMonth(day, monthBase) ? 'hover:bg-[var(--surface-2)]' : 'text-[var(--text-3)]')}
              >
                {day.getDate()}
              </button>
              <div className="flex flex-col gap-1">
                {dayGoals.slice(0, 3).map(goal => (
                  <div
                    key={goal.id}
                    draggable
                    onMouseDown={event => event.stopPropagation()}
                    onDragStart={event => { event.stopPropagation(); setDraggedGoalId(goal.id); event.dataTransfer.effectAllowed = 'move' }}
                    onDragEnd={() => setDraggedGoalId(null)}
                    className={clsx('px-1.5 py-1 rounded-[6px] border text-[10px] font-semibold truncate cursor-grab active:cursor-grabbing flex items-center gap-1', goalColor.get(goal.id))}
                    title={`${goal.title} (${goal.date_from} ~ ${goal.date_to})`}
                  >
                    {goal.date_from === date && <GripHorizontal size={9} className="shrink-0" />}
                    <span className="truncate">{goal.title}</span>
                  </div>
                ))}
                {dayGoals.length > 3 && <span className="text-[10px] text-[var(--text-3)] px-1">+{dayGoals.length - 3}개</span>}
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
