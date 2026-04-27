'use client'
import { useState, useEffect, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Plus, Trash2 } from 'lucide-react'
import { formatDate, DAY_NAMES } from '@/lib/dates'
import { Textarea } from '@/components/ui'
import type { DayEntry, ShortGoal, Routine, RoutineLog, JournalEntry } from '@/types'
import clsx from 'clsx'

interface Props {
  weekDays: Date[]
  days: DayEntry[]
  goals: ShortGoal[]
  routines: Routine[]
  logs: RoutineLog[]
}

const genId = () => Math.random().toString(36).slice(2, 10)

function parseSleepHours(time: string | null): number | null {
  if (!time) return null
  const parts = time.split(':').map(Number)
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null
  return parts[0] + parts[1] / 60
}

export function WeeklyReview({ weekDays, days, routines, logs }: Props) {
  const weekKey = useMemo(
    () => `planr_weekly_review_${format(weekDays[0], "RRRR-'W'II")}`,
    [weekDays],
  )
  const journalKey = `${weekKey}_journal`

  // ── Journal state ───────────────────────────────────────────────────────
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [showForm, setShowForm] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formBody, setFormBody] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [editingBody, setEditingBody] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(journalKey)
      setEntries(raw ? JSON.parse(raw) : [])
    } catch { setEntries([]) }
  }, [journalKey])

  function saveEntries(next: JournalEntry[]) {
    setEntries(next)
    if (typeof window !== 'undefined') localStorage.setItem(journalKey, JSON.stringify(next))
  }

  function handleAdd() {
    if (!formBody.trim()) return
    const entry: JournalEntry = {
      id: genId(),
      title: formTitle.trim(),
      body: formBody.trim(),
      createdAt: new Date().toISOString(),
    }
    saveEntries([entry, ...entries])
    setFormTitle(''); setFormBody(''); setShowForm(false)
  }

  function handleUpdate() {
    if (!editingId || !editingBody.trim()) return
    saveEntries(entries.map(e =>
      e.id === editingId ? { ...e, title: editingTitle.trim(), body: editingBody.trim() } : e
    ))
    setEditingId(null)
  }

  function handleDelete(id: string) {
    saveEntries(entries.filter(e => e.id !== id))
  }

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

  const dayRates = useMemo(() =>
    weekDays.map(d => {
      const entry = days.find(e => e.date === formatDate(d))
      if (!entry || entry.tasks.length === 0) return { pct: 0, hasData: false }
      return { pct: Math.round((entry.tasks.filter(t => t.done).length / entry.tasks.length) * 100), hasData: true }
    }),
    [weekDays, days],
  )

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
              <span className="text-[11px] text-[var(--text-3)] leading-tight">{label}</span>
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
              const color = pct === 100 ? 'var(--teal)' : pct > 0 ? 'var(--purple)' : 'var(--border-strong)'
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[11px] text-[var(--text-3)] h-3 flex items-end">{hasData ? `${pct}%` : ''}</span>
                  <div className="w-full flex items-end" style={{ height: '80px' }}>
                    <div className="w-full rounded-[3px] transition-all duration-300" style={{ height: `${barPx}px`, background: color }} />
                  </div>
                  <span className="text-[11px] text-[var(--text-2)]">{DAY_NAMES[i]}</span>
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
            <div className="flex items-center gap-2 mb-2 ml-[100px]">
              {DAY_NAMES.map(n => (
                <div key={n} className="flex-1 text-center text-[11px] text-[var(--text-3)]">{n}</div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              {heatmapRoutines.map(r => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="text-[13px] text-[var(--text-2)] truncate flex-shrink-0" style={{ width: '100px' }}>{r.name}</span>
                  <div className="flex-1 flex gap-2">
                    {weekDays.map(d => {
                      const dateStr = formatDate(d)
                      const done = !!logs.find(l => l.routine_id === r.id && l.date === dateStr && l.done)
                      return (
                        <div key={dateStr}
                          className={clsx('flex-1 h-5 rounded-[3px] transition-all', done ? 'bg-[var(--teal)]' : 'bg-[var(--border)]')} />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ④ 이번 주 기록 (journal) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wide">이번 주 기록</h3>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--purple)] transition-colors"
            >
              <Plus size={11} /> 새 기록
            </button>
          )}
        </div>

        {/* New entry form */}
        {showForm && (
          <div className="mb-5 p-4 rounded-[14px] bg-[var(--surface-2)] border border-[var(--border)]">
            <input
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              placeholder="소제목 (예: 이번 주 배운 것, 잘한 점, 아쉬운 점...)"
              className="w-full px-3 py-2 mb-2.5 rounded-[10px] text-sm font-medium bg-white border border-[var(--border)] outline-none focus:border-[var(--purple)] placeholder:text-[var(--text-3)] placeholder:font-normal"
            />
            <Textarea
              autoFocus
              value={formBody}
              onChange={e => setFormBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAdd() }}
              placeholder="이번 주를 돌아보며 생각, 다짐, 배운 점을 자유롭게 적어보세요..."
              rows={5}
              className="text-sm"
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-[11px] text-[var(--text-3)]">Ctrl+Enter로 저장</span>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowForm(false); setFormTitle(''); setFormBody('') }}
                  className="px-4 py-1.5 rounded-[8px] text-xs text-[var(--text-2)] hover:bg-[var(--border)]"
                >
                  취소
                </button>
                <button
                  onClick={handleAdd}
                  className="px-4 py-1.5 rounded-[8px] text-xs font-medium bg-[var(--purple)] text-white hover:opacity-90"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Entries */}
        <div className="flex flex-col gap-5">
          {entries.length === 0 && !showForm && (
            <div className="text-center py-8">
              <p className="text-sm text-[var(--text-3)] italic">아직 이번 주 기록이 없습니다.</p>
              <p className="text-xs text-[var(--text-3)] mt-1 italic">위 버튼으로 첫 회고를 작성해보세요.</p>
            </div>
          )}
          {entries.map(entry => {
            const isEditing = editingId === entry.id
            const entryDate = parseISO(entry.createdAt)
            return (
              <div key={entry.id}>
                {/* Date separator */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-px bg-[var(--border)]" />
                  <span className="text-[11px] text-[var(--text-3)] font-medium whitespace-nowrap">
                    {format(entryDate, 'yyyy년 M월 d일 EEEE', { locale: ko })}
                  </span>
                  <div className="flex-1 h-px bg-[var(--border)]" />
                </div>

                {isEditing ? (
                  <div className="p-4 rounded-[14px] bg-white border border-[var(--purple)] shadow-sm">
                    <input
                      value={editingTitle}
                      onChange={e => setEditingTitle(e.target.value)}
                      placeholder="소제목 (선택)"
                      className="w-full px-3 py-2 mb-2.5 rounded-[10px] text-sm font-medium bg-[var(--surface-2)] outline-none border border-transparent focus:border-[var(--purple)] focus:bg-white placeholder:text-[var(--text-3)] placeholder:font-normal"
                    />
                    <Textarea
                      autoFocus
                      value={editingBody}
                      onChange={e => setEditingBody(e.target.value)}
                      rows={5}
                      className="text-sm"
                    />
                    <div className="flex gap-2 mt-3 justify-end">
                      <button onClick={() => setEditingId(null)}
                        className="px-4 py-1.5 rounded-[8px] text-xs text-[var(--text-2)] hover:bg-[var(--border)]">
                        취소
                      </button>
                      <button onClick={handleUpdate}
                        className="px-4 py-1.5 rounded-[8px] text-xs font-medium bg-[var(--purple)] text-white hover:opacity-90">
                        저장
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="relative group/entry p-4 rounded-[14px] bg-[var(--surface-2)]">
                    {entry.title && (
                      <h4 className="text-sm font-semibold text-[var(--text)] mb-2">{entry.title}</h4>
                    )}
                    <p
                      onClick={() => {
                        setEditingId(entry.id)
                        setEditingTitle(entry.title)
                        setEditingBody(entry.body)
                      }}
                      className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap cursor-text"
                    >
                      {entry.body}
                    </p>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="absolute top-3 right-3 opacity-0 group-hover/entry:opacity-100 w-7 h-7 flex items-center justify-center text-[var(--text-3)] hover:text-red-500 transition-all rounded-[7px] hover:bg-red-50"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
