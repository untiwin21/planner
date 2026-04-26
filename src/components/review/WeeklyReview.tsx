'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { format } from 'date-fns'
import { formatDate, DAY_NAMES } from '@/lib/dates'
import { Textarea } from '@/components/ui'
import type { DayEntry, ShortGoal, Routine, RoutineLog } from '@/types'
import clsx from 'clsx'

interface Props {
  weekDays: Date[]
  days: DayEntry[]
  goals: ShortGoal[]
  routines: Routine[]
  logs: RoutineLog[]
}

function parseSleepHours(time: string | null): number | null {
  if (!time) return null
  const parts = time.split(':').map(Number)
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null
  return parts[0] + parts[1] / 60
}

export function WeeklyReview({ weekDays, days, routines, logs }: Props) {
  // Build ISO week key: planr_weekly_review_{yyyy-Www}
  const weekKey = useMemo(
    () => `planr_weekly_review_${format(weekDays[0], "RRRR-'W'II")}`,
    [weekDays],
  )

  const [reviewText, setReviewText] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setReviewText(localStorage.getItem(weekKey) ?? '')
  }, [weekKey])

  function handleReviewChange(v: string) {
    setReviewText(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      localStorage.setItem(weekKey, v)
    }, 500)
  }

  // ① Summary stats
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
    const h = Math.floor(avg)
    const m = Math.round((avg - h) * 60)
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
      total += entry.tasks.length
      done += entry.tasks.filter(t => t.done).length
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
      if (active.every(r => logs.find(l => l.routine_id === r.id && l.date === dateStr && l.done))) {
        allDoneDays++
      }
    }
    return Math.round((allDoneDays / 7) * 100)
  }, [weekDays, routines, logs])

  const statCards = [
    { label: '평균 수면',    value: avgSleep    ?? '—' },
    { label: '평균 컨디션', value: avgCondition ? `${avgCondition} / 5` : '—' },
    { label: '평균 집중력', value: avgFocus     ? `${avgFocus} / 5`     : '—' },
    { label: '할 일 달성률', value: taskRate    !== null ? `${taskRate}%`    : '—' },
    { label: '루틴 완수율', value: routineRate  !== null ? `${routineRate}%` : '—' },
  ]

  // ② Bar chart data
  const dayRates = useMemo(() =>
    weekDays.map(d => {
      const entry = days.find(e => e.date === formatDate(d))
      if (!entry || entry.tasks.length === 0) return { pct: 0, hasData: false }
      return {
        pct: Math.round((entry.tasks.filter(t => t.done).length / entry.tasks.length) * 100),
        hasData: true,
      }
    }),
    [weekDays, days],
  )

  // ③ Routine heatmap (non-archived)
  const heatmapRoutines = routines.filter(r => r.status !== 'archived').slice(0, 8)

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-base font-bold">주간 회고</h2>

      {/* ① 이번 주 요약 */}
      <section>
        <h3 className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide mb-2">이번 주 요약</h3>
        <div className="grid grid-cols-5 gap-2">
          {statCards.map(({ label, value }) => (
            <div key={label} className="bg-[var(--surface-2)] rounded-[12px] p-3 flex flex-col gap-1">
              <span className="text-[10px] text-[var(--text-3)] leading-tight">{label}</span>
              <span className="text-base font-bold text-[var(--text)] leading-tight">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ② 요일별 달성률 bar chart */}
      <section>
        <h3 className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide mb-2">요일별 달성률</h3>
        <div className="bg-[var(--surface-2)] rounded-[12px] p-4">
          <div className="flex gap-1.5">
            {weekDays.map((_, i) => {
              const { pct, hasData } = dayRates[i]
              const barPx = hasData ? Math.max(Math.round((pct / 100) * 80), 3) : 2
              const color =
                pct === 100 ? 'var(--teal)' :
                pct > 0     ? 'var(--purple)' :
                'var(--border-strong)'
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[9px] text-[var(--text-3)] h-3 flex items-end">
                    {hasData ? `${pct}%` : ''}
                  </span>
                  <div className="w-full flex items-end" style={{ height: '80px' }}>
                    <div
                      className="w-full rounded-[3px] transition-all duration-300"
                      style={{ height: `${barPx}px`, background: color }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--text-2)]">{DAY_NAMES[i]}</span>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ③ 루틴 히트맵 */}
      {heatmapRoutines.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide mb-2">루틴 히트맵</h3>
          <div className="bg-[var(--surface-2)] rounded-[12px] p-4">
            {/* Day headers */}
            <div className="flex items-center gap-2 mb-2 ml-[100px]">
              {DAY_NAMES.map(n => (
                <div key={n} className="flex-1 text-center text-[10px] text-[var(--text-3)]">{n}</div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              {heatmapRoutines.map(r => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--text-2)] truncate flex-shrink-0" style={{ width: '100px' }}>
                    {r.name}
                  </span>
                  <div className="flex-1 flex gap-2">
                    {weekDays.map(d => {
                      const dateStr = formatDate(d)
                      const done = !!logs.find(l => l.routine_id === r.id && l.date === dateStr && l.done)
                      return (
                        <div
                          key={dateStr}
                          className={clsx(
                            'flex-1 h-5 rounded-[3px] transition-all',
                            done ? 'bg-[var(--teal)]' : 'bg-[var(--border)]',
                          )}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ④ 주간 회고 텍스트 */}
      <section>
        <h3 className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide mb-2">주간 회고</h3>
        <Textarea
          value={reviewText}
          onChange={e => handleReviewChange(e.target.value)}
          placeholder="이번 주를 돌아보며 자유롭게 적어보세요..."
          rows={6}
        />
      </section>
    </div>
  )
}
