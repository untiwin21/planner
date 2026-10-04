'use client'
import { useMemo, useState } from 'react'
import { addWeeks, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getWeekDays, formatDate, dayRangeLabel } from '@/lib/dates'
import { findScheduleConflicts } from '@/lib/scheduleConflicts'
import type { DayEntry, ShortGoal } from '@/types'
import { DayCard } from './DayCard'

export function WeekOverview({ days, goals, selectedDate, onSelectDate }: {
  days: DayEntry[]; goals: ShortGoal[]; selectedDate: string; onSelectDate: (date: string) => void
}) {
  const [offset, setOffset] = useState(0)
  const weekDays = getWeekDays(addWeeks(parseISO(selectedDate), offset))
  const start = formatDate(weekDays[0]), end = formatDate(weekDays[6])
  const conflicts = useMemo(() => findScheduleConflicts(days).filter(pair =>
    (pair.first.date >= start && pair.first.date <= end) || (pair.second.date >= start && pair.second.date <= end)), [days, start, end])
  return <section aria-label="주간 일정" className="mb-4">
    <div className="flex items-center gap-2 mb-2">
      <h3 className="text-base font-bold">주간 일정</h3>
      <span className="text-sm text-[var(--text-3)]">{dayRangeLabel(start, end)}</span>
      <div className="ml-auto flex items-center gap-1">
        <button type="button" aria-label="이전 주" onClick={() => setOffset(value => value - 1)} className="p-2 rounded-lg hover:bg-white"><ChevronLeft size={16} /></button>
        <button type="button" onClick={() => { setOffset(0); onSelectDate(formatDate(new Date())) }} className="text-sm px-2 py-1 rounded-lg hover:bg-white">이번 주</button>
        <button type="button" aria-label="다음 주" onClick={() => setOffset(value => value + 1)} className="p-2 rounded-lg hover:bg-white"><ChevronRight size={16} /></button>
      </div>
    </div>
    {conflicts.length > 0 && <div role="status" className="mb-2 rounded-lg border border-[var(--red)] bg-[var(--red-bg)] px-3 py-2 text-sm text-[var(--red)]">
      {conflicts.map((pair, i) => <p key={i}>{pair.date} 일정 겹침: {pair.first.text} · {pair.second.text}</p>)}
    </div>}
    <div className="overflow-x-auto pb-1">
      <div className="grid grid-cols-7 gap-2 min-w-[980px]">
        {weekDays.map(date => <DayCard key={formatDate(date)} date={date} entry={days.find(day => day.date === formatDate(date))} goals={goals}
          isSelected={selectedDate === formatDate(date)} onClick={() => { setOffset(0); onSelectDate(formatDate(date)) }} />)}
      </div>
    </div>
  </section>
}
