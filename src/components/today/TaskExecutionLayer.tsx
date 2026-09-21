'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock3, Pause, Play, Sparkles, Square, Target, X } from 'lucide-react'
import type { DayEntry, FocusSessionRecord, SubTask, Task, TaskHistoryEvent } from '@/types'
import { formatDate } from '@/lib/dates'
import { getTaskDuration, isFixedTask, timeToMinutes } from '@/lib/plannerTime'
import { isActualOnlyTask } from '@/lib/taskVisibility'

const DAY_STORAGE_KEY = 'planr_days'
const SESSION_STORAGE_KEY = 'planr_task_focus_stopwatch_v1'
const REFRESH_MS = 1200

type FocusTask = Task & {
  actual_duration_min?: number
  actual_sessions?: FocusSessionRecord[]
}

interface ActiveFocusSession {
  date: string
  taskId: string
  text: string
  categoryName: string
  expectedMinutes: number
  firstStartedAt: number
  segmentStartedAt: number | null
  accumulatedMs: number
  segments: Array<{ startedAt: number; endedAt: number }>
  running: boolean
}

interface TaskHost {
  task: FocusTask
  host: HTMLElement
}

interface ExecutionSnapshot {
  date: string
  entry: DayEntry
  taskHosts: TaskHost[]
}

function uid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `focus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

function readSession(): ActiveFocusSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.taskId !== 'string' || typeof parsed.date !== 'string') return null
    return { ...parsed, segments: Array.isArray(parsed.segments) ? parsed.segments : [] } as ActiveFocusSession
  } catch {
    return null
  }
}

function writeSession(session: ActiveFocusSession | null) {
  if (!session) window.localStorage.removeItem(SESSION_STORAGE_KEY)
  else window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

function isVisible(element: Element) {
  if (!(element instanceof HTMLElement)) return false
  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0
}

function findTaskPanel() {
  const marked = Array.from(document.querySelectorAll('[data-today-task-panel]'))
    .find(element => isVisible(element))
  if (marked instanceof HTMLElement) return marked

  const heading = Array.from(document.querySelectorAll('h3'))
    .find(element => element.textContent?.trim() === '오늘 할 일' && isVisible(element))
  if (!(heading instanceof HTMLElement)) return null

  let current: HTMLElement | null = heading.parentElement
  while (current) {
    const classes = typeof current.className === 'string' ? current.className : ''
    if (classes.includes('rounded-[18px]') && classes.includes('flex-col')) return current
    current = current.parentElement
  }
  return null
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
  if (panel.dataset.plannerDate) return panel.dataset.plannerDate
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

function flexibleTasks(entry: DayEntry): FocusTask[] {
  return entry.tasks
    .filter(task => !isActualOnlyTask(task) && !isFixedTask(task)) as FocusTask[]
}

function removeLegacyHosts(panel: HTMLElement) {
  // Older builds injected a day summary card and a block under every task.
  for (const legacy of Array.from(panel.querySelectorAll('[data-task-execution-summary-host], [data-task-time-summary-host], [data-task-execution-host], [data-task-time-insight-host], [data-focus-stopwatch-host]'))) {
    legacy.remove()
  }
}

function ensureTaskHosts(panel: HTMLElement, tasks: FocusTask[]) {
  // Current Today panel renders an inline slot in each task row.
  const slots = new Map(Array.from(panel.querySelectorAll('[data-task-execution-slot]'))
    .filter((node): node is HTMLElement => node instanceof HTMLElement)
    .map(node => [node.dataset.taskExecutionSlot ?? '', node]))
  if (slots.size > 0) {
    removeLegacyHosts(panel)
    return tasks.flatMap(task => {
      const host = slots.get(task.id)
      return host ? [{ task, host }] : []
    })
  }

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

    for (const legacy of Array.from(content.querySelectorAll(`[data-task-time-insight-host="${CSS.escape(task.id)}"], [data-focus-stopwatch-host="${CSS.escape(task.id)}"]`))) {
      legacy.remove()
    }

    let host = Array.from(content.children)
      .find(child => child instanceof HTMLElement && child.dataset.taskExecutionHost === task.id) as HTMLElement | undefined
    if (!host) {
      host = document.createElement('div')
      host.dataset.taskExecutionHost = task.id
      host.className = 'mt-2'
      content.appendChild(host)
    }
    hosts.push({ task, host })
  }
  return hosts
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

function taskActualMinutes(task: FocusTask) {
  if (typeof task.actual_duration_min === 'number' && Number.isFinite(task.actual_duration_min)) {
    return Math.max(0, task.actual_duration_min)
  }
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

function formatMinutes(total: number) {
  const minutes = Math.max(0, Math.round(total))
  if (minutes < 60) return `${minutes}분`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${hours}시간 ${rest}분` : `${hours}시간`
}

function snapshotSignature(snapshot: ExecutionSnapshot | null) {
  if (!snapshot) return 'empty'
  return JSON.stringify({
    date: snapshot.date,
    tasks: snapshot.taskHosts.map(({ task, host }) => ({
      id: task.id,
      connected: host.isConnected,
      text: task.text,
      done: task.done,
      discarded: task.discarded,
      duration: task.duration_min,
      actualStatus: task.actual_status,
      actualStart: task.actual_start_time,
      actualEnd: task.actual_end_time,
      actualDuration: task.actual_duration_min,
      sessions: task.actual_sessions?.length ?? 0,
      subtasks: (task.subtasks ?? []).map(subtask => ({
        id: subtask.id,
        discarded: subtask.discarded,
        actualStatus: subtask.actual_status,
        actualStart: subtask.actual_start_time,
        actualEnd: subtask.actual_end_time,
      })),
    })),
  })
}

function TaskExecution({ task, date, disabled, onStart }: {
  task: FocusTask
  date: string
  disabled: boolean
  onStart: (task: FocusTask, date: string) => void
}) {
  const expected = Math.max(1, getTaskDuration(task))
  const actual = taskActualMinutes(task)
  const ratio = actual === null ? null : Math.round((actual / expected) * 100)

  if (task.discarded) return null

  // Inline, one-line: actual/estimate chip (only once something is recorded) + a small stopwatch button.
  return (
    <>
      {actual !== null && ratio !== null && (
        <span
          className={`inline-flex items-center gap-0.5 rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${ratio > 100 ? 'bg-[var(--amber-bg)] text-[var(--amber-text)]' : 'bg-[var(--teal-bg)] text-[var(--teal-text)]'}`}
          title={`실제 ${formatMinutes(actual)} / 예상 ${formatMinutes(expected)} (${ratio}%)`}
        >
          <Clock3 size={9} />{formatMinutes(actual)}
        </span>
      )}
      {!task.done && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onStart(task, date)}
          aria-label={`${task.text} 스톱워치 시작`}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--purple-bg)] text-[var(--purple)] transition-colors hover:bg-[var(--purple)] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
          title="스톱워치 — 이 할 일에만 집중하며 실제 시간을 잽니다"
        >
          <Play size={8} fill="currentColor" />
        </button>
      )}
    </>
  )
}

function elapsedMs(session: ActiveFocusSession, currentTime: number) {
  return session.accumulatedMs + (session.running && session.segmentStartedAt ? Math.max(0, currentTime - session.segmentStartedAt) : 0)
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':')
}

function wallClock(ms: number) {
  const date = new Date(ms)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function TaskExecutionLayer() {
  const [snapshot, setSnapshot] = useState<ExecutionSnapshot | null>(null)
  const [session, setSession] = useState<ActiveFocusSession | null>(null)
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSession(readSession())
  }, [])

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
      const next: ExecutionSnapshot = {
        date,
        entry,
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
    const onRefresh = () => refresh()
    window.addEventListener('resize', onRefresh)
    window.addEventListener('focus', onRefresh)
    window.addEventListener('planr:focus-stopwatch-saved', onRefresh)
    document.addEventListener('visibilitychange', onRefresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('resize', onRefresh)
      window.removeEventListener('focus', onRefresh)
      window.removeEventListener('planr:focus-stopwatch-saved', onRefresh)
      document.removeEventListener('visibilitychange', onRefresh)
    }
  }, [])

  useEffect(() => {
    if (!session) return
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 250)
    return () => window.clearInterval(interval)
  }, [session])

  useEffect(() => {
    if (!session) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [session])

  function pauseSession() {
    setSession(current => {
      if (!current || !current.running || !current.segmentStartedAt) return current
      const pausedAt = Date.now()
      const next = {
        ...current,
        accumulatedMs: current.accumulatedMs + Math.max(0, pausedAt - current.segmentStartedAt),
        segments: [
          ...(current.segments ?? []),
          ...(pausedAt > current.segmentStartedAt ? [{ startedAt: current.segmentStartedAt, endedAt: pausedAt }] : []),
        ],
        segmentStartedAt: null,
        running: false,
      }
      setCurrentTime(pausedAt)
      writeSession(next)
      return next
    })
  }

  function resumeSession() {
    setSession(current => {
      if (!current || current.running) return current
      const resumedAt = Date.now()
      const next = { ...current, segmentStartedAt: resumedAt, running: true }
      setCurrentTime(resumedAt)
      writeSession(next)
      return next
    })
  }

  useEffect(() => {
    if (!session) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || saving) return
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'BUTTON') return
      event.preventDefault()
      if (session.running) pauseSession()
      else resumeSession()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function startSession(task: FocusTask, date: string) {
    if (session) return
    const startedAt = Date.now()
    const next: ActiveFocusSession = {
      date,
      taskId: task.id,
      text: task.text,
      categoryName: task.category_name,
      expectedMinutes: Math.max(1, getTaskDuration(task)),
      firstStartedAt: startedAt,
      segmentStartedAt: startedAt,
      accumulatedMs: 0,
      segments: [],
      running: true,
    }
    setCurrentTime(startedAt)
    setSession(next)
    writeSession(next)
  }

  function cancelSession() {
    if (saving) return
    writeSession(null)
    setSession(null)
  }

  async function finishSession() {
    if (!session || saving) return
    setSaving(true)
    try {
      const finishedAt = Date.now()
      const finishedSegments = [
        ...(session.segments ?? []),
        ...(session.running && session.segmentStartedAt && finishedAt > session.segmentStartedAt
          ? [{ startedAt: session.segmentStartedAt, endedAt: finishedAt }]
          : []),
      ]
      const activeMinutes = finishedSegments.reduce((sum, segment) => sum + Math.max(0, segment.endedAt - segment.startedAt), 0) / 60_000
      const days = readDays()
      const dayIndex = days.findIndex(entry => entry.date === session.date)
      if (dayIndex < 0) throw new Error('선택한 날짜의 기록을 찾을 수 없습니다.')

      const entry = days[dayIndex]
      const taskIndex = entry.tasks.findIndex(task => task.id === session.taskId)
      if (taskIndex < 0) throw new Error('측정 중인 할 일을 찾을 수 없습니다.')

      const task = entry.tasks[taskIndex] as FocusTask
      const previousMinutes = taskActualMinutes(task) ?? 0
      const totalMinutes = previousMinutes + activeMinutes
      const newSessions: FocusSessionRecord[] = finishedSegments.map(segment => ({
        id: uid(),
        started_at: new Date(segment.startedAt).toISOString(),
        ended_at: new Date(segment.endedAt).toISOString(),
        duration_min: Math.max(0, segment.endedAt - segment.startedAt) / 60_000,
        source: 'stopwatch',
      }))
      const sessions: FocusSessionRecord[] = [...(task.actual_sessions ?? []), ...newSessions]
      const firstSession = sessions[0]
      const lastSession = sessions[sessions.length - 1]
      const historyEvent: TaskHistoryEvent = {
        id: uid(),
        at: new Date(finishedAt).toISOString(),
        kind: 'focus_session',
        before: {
          actual_min: previousMinutes,
          sessions: task.actual_sessions?.length ?? 0,
        },
        after: {
          actual_min: totalMinutes,
          sessions: sessions.length,
          added_sessions: newSessions.map(item => ({ started_at: item.started_at, ended_at: item.ended_at, duration_min: item.duration_min })),
        },
        note: `Focus Mode에서 ${Math.round(activeMinutes)}분 기록`,
      }
      const updatedTask: FocusTask = {
        ...task,
        actual_start_time: firstSession ? wallClock(new Date(firstSession.started_at).getTime()) : wallClock(session.firstStartedAt),
        actual_end_time: lastSession ? wallClock(new Date(lastSession.ended_at).getTime()) : wallClock(finishedAt),
        actual_status: 'recorded',
        actual_duration_min: totalMinutes,
        actual_sessions: sessions,
        history: [...(task.history ?? []), historyEvent].slice(-160),
        updated_at: Date.now(),
      }
      const updatedEntry: DayEntry = {
        ...entry,
        tasks: entry.tasks.map(item => item.id === session.taskId ? updatedTask : item),
      }
      const updatedDays = days.map((item, index) => index === dayIndex ? updatedEntry : item)

      // Commit the stopwatch result locally first. Focus recording must never be
      // blocked by a transient Supabase/auth failure: the main store owns cloud
      // persistence and already has dirty-entity retry semantics.
      window.localStorage.setItem(DAY_STORAGE_KEY, JSON.stringify(updatedDays))
      writeSession(null)
      setSession(null)
      window.dispatchEvent(new CustomEvent('planr:focus-stopwatch-saved', {
        detail: {
          entry: updatedEntry,
          date: session.date,
          taskId: session.taskId,
          durationMin: activeMinutes,
        },
      }))
    } catch (error) {
      console.error('[Planr] focus stopwatch local save failed:', error)
      window.alert('집중 시간을 브라우저에 저장하지 못했습니다. 저장 공간 또는 브라우저 상태를 확인한 뒤 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  const elapsed = session ? elapsedMs(session, currentTime) : 0
  const elapsedMinutes = elapsed / 60_000
  const progress = session ? Math.min(100, (elapsedMinutes / session.expectedMinutes) * 100) : 0
  const circleRadius = 138
  const circumference = 2 * Math.PI * circleRadius
  const dashOffset = circumference * (1 - progress / 100)

  if (!snapshot && !session) return null

  return (
    <>
      {snapshot?.taskHosts.map(({ task, host }) => host.isConnected
        ? createPortal(
            <TaskExecution task={task} date={snapshot.date} disabled={Boolean(session)} onStart={startSession} />,
            host,
            task.id,
          )
        : null)}

      {session && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-[#F8F6F1]/88 px-5 py-8 backdrop-blur-[10px]">
          <div className="relative w-full max-w-[760px] rounded-[32px] border border-[var(--purple)]/25 bg-white px-7 py-8 shadow-[0_35px_100px_rgba(66,45,115,0.24)] md:px-12 md:py-10">
            <div className="mx-auto max-w-[610px]">
              <div className="mb-7 flex items-center justify-center gap-2 text-sm font-black tracking-[0.14em] text-[var(--purple)]">
                <Target size={17} /> FOCUS MODE
              </div>

              <section className="rounded-[22px] border border-[var(--border)] bg-white px-5 py-5 text-center shadow-sm md:px-8">
                <p className="text-[11px] font-bold text-[var(--purple)]">현재 목표</p>
                <h2 className="mt-2 text-xl font-black tracking-tight text-[var(--text)] md:text-2xl">{session.text}</h2>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-[var(--border)] pt-4 text-xs font-semibold text-[var(--text-3)]">
                  <span className="inline-flex items-center gap-1.5"><Clock3 size={13} /> 예상 {formatMinutes(session.expectedMinutes)}</span>
                  <span className="hidden h-4 w-px bg-[var(--border)] sm:block" />
                  <span className="text-[var(--purple-text)]">{session.categoryName}</span>
                </div>
              </section>

              <div className="relative mx-auto mt-8 h-[330px] w-[330px] max-w-full">
                <svg viewBox="0 0 320 320" className="h-full w-full -rotate-90" aria-hidden="true">
                  <circle cx="160" cy="160" r={circleRadius} fill="none" stroke="var(--purple-bg)" strokeWidth="12" />
                  <circle
                    cx="160"
                    cy="160"
                    r={circleRadius}
                    fill="none"
                    stroke="var(--purple)"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    className="transition-[stroke-dashoffset] duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-[var(--purple)]">
                    <span className={`h-2 w-2 rounded-full ${session.running ? 'bg-[var(--purple)] animate-pulse' : 'bg-[var(--amber)]'}`} />
                    {session.running ? '진행 중' : '일시정지'}
                  </p>
                  <p className="font-mono text-[48px] font-black leading-none tracking-[-0.06em] text-[var(--text)] tabular-nums md:text-[58px]">{formatElapsed(elapsed)}</p>
                  <p className="mt-5 rounded-full bg-[var(--purple-bg)] px-3 py-1.5 text-xs font-bold text-[var(--purple-text)]">
                    실제 진행 {formatMinutes(elapsedMinutes)} · 예상 {formatMinutes(session.expectedMinutes)}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={session.running ? pauseSession : resumeSession}
                  className="flex items-center justify-center gap-2 rounded-[13px] bg-[var(--purple)] px-4 py-3.5 text-sm font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {session.running ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
                  {session.running ? '일시정지' : '계속 진행'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={finishSession}
                  className="flex items-center justify-center gap-2 rounded-[13px] border border-[var(--purple)]/30 bg-white px-4 py-3.5 text-sm font-bold text-[var(--purple-text)] hover:bg-[var(--purple-bg)] disabled:opacity-50"
                >
                  <Square size={15} fill="currentColor" /> {saving ? '저장 중...' : '종료 후 기록'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={cancelSession}
                  className="flex items-center justify-center gap-2 rounded-[13px] bg-[var(--red-bg)] px-4 py-3.5 text-sm font-bold text-[var(--red)] hover:opacity-80 disabled:opacity-50"
                >
                  <X size={17} /> 포기
                </button>
              </div>

              <div className="mt-7 flex items-center justify-center gap-2 text-center text-xs font-semibold text-[var(--purple-text)]">
                <Sparkles size={14} /> 지금은 이 목표 하나만 남겨둡니다. Space로 일시정지·재개할 수 있어요.
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
