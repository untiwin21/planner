'use client'
import { useMemo } from 'react'
import { formatDate } from '@/lib/dates'
import { tasksProgress } from '@/lib/taskProgress'
import type { DayEntry, Routine, RoutineLog } from '@/types'

function parseSleepHours(time: string | null): number | null {
  if (!time) return null
  const parts = time.split(':').map(Number)
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null
  return parts[0] + parts[1] / 60
}

export function WeeklySummary({ weekDays, days, routines, logs }: { weekDays: Date[]; days: DayEntry[]; routines: Routine[]; logs: RoutineLog[] }) {
  // ── Stats ───────────────────────────────────────────────────────────────
  const avgSleep = useMemo(() => {
    const vals: number[] = []
    for (const d of weekDays) {
      const sleep = days.find(e => e.date === formatDate(d))?.meta.sleep
      const sleepStr = sleep ? `${String(Math.floor(sleep / 60)).padStart(2, '0')}:${String(sleep % 60).padStart(2, '0')}` : null
      const h = parseSleepHours(sleepStr)
      if (h !== null) vals.push(h)
    }
    if (vals.length === 0) return null
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length
    const h = Math.floor(avg); const m = Math.round((avg - h) * 60)
    return `${h}h ${m}m`
  }, [weekDays, days])

  const avgCondition = useMemo(() => {
    const vals = weekDays
      .map(d => days.find(e => e.date === formatDate(d))?.meta.condition)
      .filter((v): v is number => v !== null && v !== undefined)
    if (vals.length === 0) return null
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
  }, [weekDays, days])

  const avgFocus = useMemo(() => {
    const vals = weekDays
      .map(d => days.find(e => e.date === formatDate(d))?.meta.focus)
      .filter((v): v is number => v !== null && v !== undefined)
    if (vals.length === 0) return null
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
  }, [weekDays, days])

  const taskRate = useMemo(() => {
    let total = 0, done = 0
    for (const d of weekDays) {
      const entry = days.find(e => e.date === formatDate(d))
      if (!entry) continue
      const p = tasksProgress(entry.tasks)
      total += p.total
      done += p.done
    }
    if (total === 0) return null
    return Math.round((done / total) * 100)
  }, [weekDays, days])

  const routineRate = useMemo(() => {
    const active = routines.filter(r => r.status === 'active')
    if (active.length === 0) return null
    let allDoneDays = 0
    for (const d of weekDays) {
      const dateStr = formatDate(d)
      if (active.every(r => logs.find(l => l.routine_id === r.id && l.date === dateStr && l.done))) allDoneDays++
    }
    return Math.round((allDoneDays / 7) * 100)
  }, [weekDays, routines, logs])

  const statCards = [
    { label: '평균 수면',   value: avgSleep    ?? '—' },
    { label: '평균 컨디션', value: avgCondition ? `${avgCondition} / 5` : '—' },
    { label: '평균 집중력', value: avgFocus     ? `${avgFocus} / 5`     : '—' },
    { label: '할 일 달성률', value: taskRate   !== null ? `${taskRate}%`    : '—' },
    { label: '루틴 완수율', value: routineRate  !== null ? `${routineRate}%` : '—' },
  ]

  return (
      <section>
        <h3 className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide mb-2">이번 주 요약</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {statCards.map(({ label, value }) => (
            <div key={label} className="bg-[var(--surface-2)] rounded-[12px] p-3 flex flex-col gap-1">
              <span className="text-[11px] text-[var(--text-3)] leading-tight">{label}</span>
              <span className="text-base font-bold text-[var(--text)] leading-tight">{value}</span>
            </div>
          ))}
        </div>
      </section>

  )
}
