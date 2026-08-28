'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock3, Gauge, TimerReset } from 'lucide-react'
import type { DayEntry, SubTask, Task } from '@/types'
import { formatDate } from '@/lib/dates'
import { getTaskDuration, isFixedTask, timeToMinutes } from '@/lib/plannerTime'
import { isActualOnlyTask } from '@/lib/taskVisibility'

const DAY_STORAGE_KEY = 'planr_days'
const REFRESH_MS = 900

interface TaskHost {
  task: Task
  host: HTMLElement
}

interface InsightSnapshot {
  date: string
  entry: DayEntry
  summaryHost: HTMLElement
  taskHosts: TaskHost[]
}

function formatMinutes(total: number) {
  const minutes = Math.max(0, Math.round(total))
  if (minutes < 60) return `${minutes}분`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${hours}시간 ${rest}분` : `${hours}시간`
}

function signedMinutes(total: number) {
  if (total === 0) return '±0분'
  return `${total > 0 ? '+' : '-'}${formatMinutes(Math.abs(total))}`
}

function rangeMinutes(start?: string, end?: string) {
  const startMinute = timeToMinutes(start)
  const rawEnd = timeToMinutes(end)
  if (startMinute === null || rawEnd === null) return null
  let endMinute = rawEnd
  if (endMinute <= startMinute) endMinute += 24 * 60
  return Math.max(0, endMinute - startMinute)
}

function subtaskActualMinutes(subtask: SubTask) {
  if (subtask.actual_status !== 'recorded') return null
  return rangeMinutes(subtask.actual_start_time, subtask.actual_end_time)
}

function taskActualMinutes(task: Task) {
  if (task.actual_status === 'recorded') {
    const own = rangeMinutes(task.actual_start_time, task.actual_end_time)
    if (own !== null) return own
  }

  const recordedSubtasks = (task.subtasks ?? [])
    .filter(subtask => !subtask.discarded)
    .map(subtaskActualMinutes)
    .filter((minutes): minutes is number => minutes !== null)

  return recordedSubtasks.length > 0
    ? recordedSubtasks.reduce((sum, minutes) => sum + minutes, 0)
    : null
}

function taskTimeRatio(task: Task) {
  const actual = taskActualMinutes(task)
  const expected = Math.max(1, getTaskDuration(task))
  return actual === null ? null : Math.round((actual / expected) * 100)
}

function isVisible(element: Element) {
  if (!(element instanceof HTMLElement)) return false
  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0
}

function classText(element: HTMLElement) {
  return typeof element.className === 'string' ? element.className : ''
}

function findTaskPanel() {
  const heading = Array.from(document.querySelectorAll('h3'))
    .find(element => element.textContent?.trim() === '오늘 할 일' && isVisible(element))
  if (!(heading instanceof HTMLElement)) return null

  let current: HTMLElement | null = heading.parentElement
  while (current) {
    const classes = classText(current)
    if (classes.includes('rounded-[18px]') && classes.includes('flex-col')) return current
    current = current.parentElement
  }
  return null
}

function readDays(): DayEntry[] {
  try {
    const raw = window.localStorage.getItem(DAY_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function closestStoredDate(month: number, day: number, days: DayEntry[]) {
  const suffix = `-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const matches = days.filter(entry => entry.date.endsWith(suffix))
  if (matches.length === 0) return null
  const today = new Date(`${formatDate(new Date())}T12:00:00`)
  return [...matches].sort((a, b) => {
    const aDistance = Math.abs(new Date(`${a.date}T12:00:00`).getTime() - today.getTime())
    const bDistance = Math.abs(new Date(`${b.date}T12:00:00`).getTime() - today.getTime())
    return aDistance - bDistance
  })[0]?.date ?? null
}

function selectedDate(panel: HTMLElement, days: DayEntry[]) {
  const section = panel.closest('section')
  if (!section) return formatDate(new Date())

  const marker = Array.from(section.querySelectorAll('p'))
    .find(element => element.textContent?.trim() === 'TODAY' || element.textContent?.trim() === 'DAY PLAN')
    ?.textContent?.trim()
  if (marker === 'TODAY') return formatDate(new Date())

  const heading = Array.from(section.querySelectorAll('h2'))
    .map(element => element.textContent?.trim() ?? '')
    .find(text => /\d+월\s*\d+일/.test(text))
  const match = heading?.match(/(\d+)월\s*(\d+)일/)
  if (!match) return formatDate(new Date())
  return closestStoredDate(Number(match[1]), Number(match[2]), days) ?? formatDate(new Date())
}

function flexibleTasks(entry: DayEntry) {
  return entry.tasks.filter(task => !isActualOnlyTask(task) && !isFixedTask(task))
}

function ensureSummaryHost(panel: HTMLElement) {
  let host = Array.from(panel.children)
    .find(child => child instanceof HTMLElement && child.dataset.taskTimeSummaryHost === 'true') as HTMLElement | undefined
  if (host) return host

  host = document.createElement('div')
  host.dataset.taskTimeSummaryHost = 'true'
  const header = panel.firstElementChild
  if (header?.nextSibling) panel.insertBefore(host, header.nextSibling)
  else panel.appendChild(host)
  return host
}

function ensureTaskHosts(panel: HTMLElement, tasks: Task[]) {
  const titleNodes = Array.from(panel.querySelectorAll('p'))
    .filter(node => node instanceof HTMLElement && isVisible(node)) as HTMLElement[]
  const used = new Set<HTMLElement>()
  const hosts: TaskHost[] = []

  for (const task of tasks) {
    const title = titleNodes.find(node => !used.has(node) && node.textContent?.trim() === task.text)
    if (!title) continue
    used.add(title)

    const content = title.parentElement?.parentElement
    if (!content) continue

    let host = Array.from(content.children)
      .find(child => child instanceof HTMLElement && child.dataset.taskTimeInsightHost === task.id) as HTMLElement | undefined
    if (!host) {
      host = document.createElement('div')
      host.dataset.taskTimeInsightHost = task.id
      host.className = 'mt-2'
      content.appendChild(host)
    }
    hosts.push({ task, host })
  }
  return hosts
}

function snapshotSignature(snapshot: InsightSnapshot | null) {
  if (!snapshot) return 'empty'
  return JSON.stringify({
    date: snapshot.date,
    summaryConnected: snapshot.summaryHost.isConnected,
    tasks: snapshot.taskHosts.map(({ task, host }) => ({
      id: task.id,
      connected: host.isConnected,
      duration: task.duration_min,
      discarded: task.discarded,
      actual_status: task.actual_status,
      actual_start_time: task.actual_start_time,
      actual_end_time: task.actual_end_time,
      subtasks: (task.subtasks ?? []).map(subtask => ({
        id: subtask.id,
        discarded: subtask.discarded,
        actual_status: subtask.actual_status,
        actual_start_time: subtask.actual_start_time,
        actual_end_time: subtask.actual_end_time,
      })),
    })),
  })
}

function Summary({ tasks }: { tasks: Task[] }) {
  const active = tasks.filter(task => !task.discarded)
  const expectedTotal = active.reduce((sum, task) => sum + getTaskDuration(task), 0)
  const recorded = active
    .map(task => ({ task, actual: taskActualMinutes(task) }))
    .filter((item): item is { task: Task; actual: number } => item.actual !== null)
  const actualTotal = recorded.reduce((sum, item) => sum + item.actual, 0)
  const recordedExpected = recorded.reduce((sum, item) => sum + getTaskDuration(item.task), 0)
  const recordedRatio = recordedExpected > 0 ? Math.round((actualTotal / recordedExpected) * 100) : 0
  const dayRatio = expectedTotal > 0 ? Math.round((actualTotal / expectedTotal) * 100) : 0
  const error = actualTotal - recordedExpected

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface-2)]/35 px-3 py-3">
      <div className="rounded-[14px] border border-[var(--border)] bg-white px-3.5 py-3 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--purple-bg)] text-[var(--purple)]">
            <Gauge size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold">오늘 시간 요약</p>
              <span className="rounded-full bg-[var(--teal-bg)] px-2 py-0.5 text-[9px] font-bold text-[var(--teal-text)]">예상 vs 실제</span>
            </div>
            <p className="mt-0.5 text-[10px] text-[var(--text-3)]">실제 기록이 쌓일수록 시간 예측 정확도를 확인할 수 있습니다.</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          <div className="rounded-[10px] bg-[var(--purple-bg)]/55 px-2.5 py-2">
            <p className="text-[9px] font-semibold text-[var(--purple-text)]">예상 총시간</p>
            <p className="mt-1 text-sm font-black tabular-nums">{formatMinutes(expectedTotal)}</p>
          </div>
          <div className="rounded-[10px] bg-[var(--teal-bg)]/60 px-2.5 py-2">
            <p className="text-[9px] font-semibold text-[var(--teal-text)]">실제 기록</p>
            <p className="mt-1 text-sm font-black tabular-nums">{formatMinutes(actualTotal)}</p>
          </div>
          <div className="rounded-[10px] bg-[var(--surface-2)] px-2.5 py-2">
            <p className="text-[9px] font-semibold text-[var(--text-3)]">기록</p>
            <p className="mt-1 text-sm font-black tabular-nums">{recorded.length}/{active.length}</p>
          </div>
          <div className="rounded-[10px] bg-[var(--surface-2)] px-2.5 py-2">
            <p className="text-[9px] font-semibold text-[var(--text-3)]">예상 오차</p>
            <p className={`mt-1 text-sm font-black tabular-nums ${recorded.length === 0 ? 'text-[var(--text-3)]' : error > 0 ? 'text-[var(--amber-text)]' : 'text-[var(--teal-text)]'}`}>
              {recorded.length > 0 ? signedMinutes(error) : '—'}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2.5">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div className="h-full rounded-full bg-[var(--teal)] transition-all" style={{ width: `${Math.min(100, dayRatio)}%` }} />
          </div>
          <span className="shrink-0 text-[10px] font-bold text-[var(--text-3)] tabular-nums">오늘 {dayRatio}% 기록</span>
          {recorded.length > 0 && <span className="shrink-0 text-[10px] font-bold text-[var(--purple-text)] tabular-nums">기록분 기준 {recordedRatio}%</span>}
        </div>
      </div>
    </div>
  )
}

function TaskInsight({ task }: { task: Task }) {
  const expected = Math.max(1, getTaskDuration(task))
  const actual = taskActualMinutes(task)
  const ratio = taskTimeRatio(task)

  if (task.discarded) {
    return <div className="text-[10px] font-medium text-[var(--text-3)]">시간 집계 제외</div>
  }

  if (actual === null || ratio === null) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-[var(--text-3)]">
        <TimerReset size={11} className="shrink-0" />
        <span>실제 — / 예상 {formatMinutes(expected)}</span>
        <span className="ml-auto rounded-full bg-[var(--surface-2)] px-2 py-0.5 font-semibold">기록 없음</span>
      </div>
    )
  }

  const over = ratio > 100
  return (
    <div className="flex items-center gap-2">
      <Clock3 size={11} className={over ? 'shrink-0 text-[var(--amber)]' : 'shrink-0 text-[var(--teal)]'} />
      <span className="shrink-0 text-[10px] font-semibold text-[var(--text-2)] tabular-nums">실제 {formatMinutes(actual)} / 예상 {formatMinutes(expected)}</span>
      <div className="h-1.5 min-w-[44px] flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div className={`h-full rounded-full transition-all ${over ? 'bg-[var(--amber)]' : 'bg-[var(--teal)]'}`} style={{ width: `${Math.min(100, ratio)}%` }} />
      </div>
      <span className={`shrink-0 text-[10px] font-black tabular-nums ${over ? 'text-[var(--amber-text)]' : 'text-[var(--teal-text)]'}`}>{ratio}%</span>
    </div>
  )
}

/**
 * Adds Option-6-style estimated-vs-actual time feedback to the existing desktop
 * Today task panel without duplicating Planr's task state. The source of truth
 * remains DayEntry in the store/local cache; this component only renders an
 * additional view over the same task records.
 */
export function TaskTimeInsights() {
  const [snapshot, setSnapshot] = useState<InsightSnapshot | null>(null)

  useEffect(() => {
    let lastSignature = ''

    function refresh() {
      if (!window.matchMedia('(min-width: 768px)').matches) {
        if (lastSignature !== 'mobile') {
          lastSignature = 'mobile'
          setSnapshot(null)
        }
        return
      }

      const panel = findTaskPanel()
      if (!panel) {
        if (lastSignature !== 'missing') {
          lastSignature = 'missing'
          setSnapshot(null)
        }
        return
      }

      const days = readDays()
      const date = selectedDate(panel, days)
      const entry = days.find(item => item.date === date)
      if (!entry) {
        if (lastSignature !== `no-entry:${date}`) {
          lastSignature = `no-entry:${date}`
          setSnapshot(null)
        }
        return
      }

      const tasks = flexibleTasks(entry)
      const next: InsightSnapshot = {
        date,
        entry,
        summaryHost: ensureSummaryHost(panel),
        taskHosts: ensureTaskHosts(panel, tasks),
      }
      const signature = snapshotSignature(next)
      if (signature !== lastSignature) {
        lastSignature = signature
        setSnapshot(next)
      }
    }

    refresh()
    const interval = window.setInterval(refresh, REFRESH_MS)
    window.addEventListener('resize', refresh)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('resize', refresh)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  const tasks = useMemo(() => snapshot ? flexibleTasks(snapshot.entry) : [], [snapshot])

  if (!snapshot || !snapshot.summaryHost.isConnected) return null

  return (
    <>
      {createPortal(<Summary tasks={tasks} />, snapshot.summaryHost)}
      {snapshot.taskHosts.map(({ task, host }) => host.isConnected
        ? createPortal(<TaskInsight task={task} />, host, task.id)
        : null)}
    </>
  )
}
