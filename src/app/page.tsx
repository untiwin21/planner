'use client'
import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, LogOut, Timer } from 'lucide-react'
import { addWeeks, subWeeks, parseISO, startOfWeek as dfStartOfWeek, format } from 'date-fns'
import { getWeekDays, formatDate, formatMonth, isGoalActive } from '@/lib/dates'
import { tasksProgress } from '@/lib/taskProgress'
import { usePlanrStore } from '@/hooks/usePlanrStore'
import { DayCard } from '@/components/weekly/DayCard'
import { GoalSpanRow } from '@/components/weekly/GoalSpanRow'
import { GoalDetail } from '@/components/goals/GoalDetail'
import { GoalHierarchyView } from '@/components/goals/GoalHierarchyView'
import { RoutineSidebar } from '@/components/routine/RoutineSidebar'
import { RightSidebar } from '@/components/layout/RightSidebar'
import { WeeklyReview } from '@/components/review/WeeklyReview'
import { JournalView } from '@/components/journal/JournalView'
import { WeeklyPrompt } from '@/components/system/WeeklyPrompt'
import { FocusTimer } from '@/components/system/FocusTimer'
import { Card } from '@/components/ui'
import type { JournalEntry, ShortGoal, Task } from '@/types'
import { SCHEDULE_CAT_ID, DEADLINE_CAT_ID } from '@/types'
import clsx from 'clsx'
import { useUserId } from '@/context/UserContext'
import { supabase } from '@/lib/supabase'
import { signOut } from '@/lib/auth'
import { DataPanel } from '@/components/settings/DataPanel'
import { MobileLayout } from '@/components/mobile/MobileLayout'
import { TodayDashboard } from '@/components/today/TodayDashboard'
import { WeeklyScheduleEditor } from '@/components/weekly/WeeklyScheduleEditor'
import { MonthlyGoalCalendar } from '@/components/weekly/MonthlyGoalCalendar'

function packGoalsIntoRows(goals: ShortGoal[], weekDays: Date[]) {
  const weekStart = formatDate(weekDays[0])
  const weekEnd = formatDate(weekDays[6])
  const weekGoals = goals
    .filter(g => g.date_from <= weekEnd && g.date_to >= weekStart)
    .sort((a, b) => a.date_from.localeCompare(b.date_from))
  const rows: ShortGoal[][] = []
  for (const goal of weekGoals) {
    const clampedFrom = goal.date_from < weekStart ? weekStart : goal.date_from
    let placed = false
    for (const row of rows) {
      const last = row[row.length - 1]
      const lastTo = last.date_to > weekEnd ? weekEnd : last.date_to
      if (clampedFrom > lastTo) { row.push(goal); placed = true; break }
    }
    if (!placed) rows.push([goal])
  }
  return rows
}

function getWeekKey(date: Date): string {
  const ws = dfStartOfWeek(date, { weekStartsOn: 1 })
  return format(ws, "RRRR-'W'II")
}

export default function Home() {
  const userId = useUserId()
  const [user, setUser] = useState<any>(null)
  const [weekBase, setWeekBase] = useState(new Date())
  const [monthBase, setMonthBase] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [newGoalFrom, setNewGoalFrom] = useState('')
  const [newGoalTo, setNewGoalTo] = useState('')
  const [newGoalTitle, setNewGoalTitle] = useState('')
  const [newGoalLongId, setNewGoalLongId] = useState('')
  const [view, setView] = useState<'today' | 'week' | 'review' | 'journal'>('today')
  const [showCalendar, setShowCalendar] = useState(true)
  const [showFocusTimer, setShowFocusTimer] = useState(false)

  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [qaTaskText, setQaTaskText] = useState('')
  const [qaGoalTitle, setQaGoalTitle] = useState('')
  const [qaGoalFrom, setQaGoalFrom] = useState(formatDate(new Date()))
  const [qaGoalTo, setQaGoalTo] = useState(formatDate(new Date()))
  const [qaGoalLongId, setQaGoalLongId] = useState('')

  const weekKey = useMemo(() => getWeekKey(weekBase), [weekBase])

  const [showBig3Modal, setShowBig3Modal] = useState(false)

  const { syncReady, ...store } = usePlanrStore(userId)
  const weekDays = useMemo(() => getWeekDays(weekBase), [weekBase])
  const selectedEntry = store.getDay(selectedDate)
  const selectedGoal = selectedGoalId ? store.goals.find(g => g.id === selectedGoalId) : null
  const goalRows = useMemo(() => packGoalsIntoRows(store.goals, weekDays), [store.goals, weekDays])
  const big3SyncKey = `__big3__:${weekKey}`
  const mantraSyncKey = `__mantra__:${weekKey}`
  const journalSyncKey = `__journal__:${weekKey}`
  const weekBig3 = useMemo(() => {
    try {
      const value = JSON.parse(store.getWeeklyReview(big3SyncKey) || '[]')
      return Array.isArray(value) ? value as string[] : []
    } catch { return [] }
  }, [store.weeklyReviews, big3SyncKey])
  const weekMantra = store.getWeeklyReview(mantraSyncKey)
  const weeklyJournalEntries = useMemo(() => {
    try {
      const value = JSON.parse(store.getWeeklyReview(journalSyncKey) || '[]')
      return Array.isArray(value) ? value as JournalEntry[] : []
    } catch { return [] }
  }, [store.weeklyReviews, journalSyncKey])

  useEffect(() => {
    if (supabase) {
      supabase.auth.getUser().then(({ data: { user } }) => setUser(user))
    }
  }, [])

  function saveBig3(texts: string[]) {
    store.updateWeeklyReview(big3SyncKey, JSON.stringify(texts))
  }
  function saveMantra(text: string) {
    store.updateWeeklyReview(mantraSyncKey, text)
  }

  // Migrate meaningful browser-only data from earlier versions once, then use
  // Supabase-backed weekly records on every device.
  useEffect(() => {
    if (!syncReady || typeof window === 'undefined') return
    if (!store.getWeeklyReview(big3SyncKey)) {
      const legacyBig3 = localStorage.getItem(`planr_week_big3_v2_${weekKey}`)
      if (legacyBig3) store.updateWeeklyReview(big3SyncKey, legacyBig3)
    }
    if (!store.getWeeklyReview(mantraSyncKey)) {
      const legacyMantra = localStorage.getItem(`planr_week_mantra_${weekKey}`)
      if (legacyMantra) store.updateWeeklyReview(mantraSyncKey, legacyMantra)
    }
    if (!store.getWeeklyReview(journalSyncKey)) {
      const legacyJournal = localStorage.getItem(`planr_weekly_review_${weekKey}_journal`)
      if (legacyJournal) store.updateWeeklyReview(journalSyncKey, legacyJournal)
    }
  // The week keys and server snapshot are the only inputs; store methods are intentionally omitted.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncReady, weekKey, big3SyncKey, mantraSyncKey, journalSyncKey, store.weeklyReviews])

  const todayShortGoals = useMemo(
    () => store.goals.filter(g => isGoalActive(g, new Date())),
    [store.goals],
  )
  const todayGoalRoutines = todayShortGoals[0]?.routines ?? []
  const todayGoalLabel = todayShortGoals[0]?.title

  // Top bar stats (subtask-aware) — excludes schedule/deadline, includes linked goal tasks/subtasks.
  const weekStats = useMemo(() => {
    let taskTotal = 0, taskDone = 0
    for (const d of weekDays) {
      const ds = formatDate(d)
      const entry = store.days.find(e => e.date === ds)
      if (!entry) continue
      const workTasks = entry.tasks.filter(t => t.category_id !== SCHEDULE_CAT_ID && t.category_id !== DEADLINE_CAT_ID)
      const linkedIds = new Set(entry.meta?.linkedGoalTaskIds ?? [])
      const linkedSubIds = new Set(entry.meta?.linkedGoalSubtaskIds ?? [])
      const activeGoals = store.goals.filter(g => g.date_from <= ds && g.date_to >= ds)
      const linkedTasks: Task[] = []
      for (const g of activeGoals) {
        for (const t of g.tasks) {
          if (linkedIds.has(t.id)) linkedTasks.push(t)
          for (const s of t.subtasks ?? []) {
            if (linkedSubIds.has(s.id)) {
              linkedTasks.push({
                id: s.id, text: s.text, done: s.done,
                day_id: t.day_id, goal_id: t.goal_id,
                category_id: t.category_id, category_name: t.category_name, category_color: t.category_color,
              })
            }
          }
        }
      }
      const p = tasksProgress([...workTasks, ...linkedTasks])
      taskTotal += p.total
      taskDone += p.done
    }
    const taskRate = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : null
    const activeRoutines = store.routines.filter(r => r.status === 'active')
    let routineDoneDays = 0
    if (activeRoutines.length > 0) {
      for (const d of weekDays) {
        const ds = formatDate(d)
        if (activeRoutines.every(r => store.logs.find(l => l.routine_id === r.id && l.date === ds && l.done))) routineDoneDays++
      }
    }
    const routineRate = activeRoutines.length > 0 ? Math.round((routineDoneDays / 7) * 100) : null
    const goalCount = store.goals.filter(g => {
      const ws = formatDate(weekDays[0]), we = formatDate(weekDays[6])
      return g.date_from <= we && g.date_to >= ws
    }).length
    return { taskRate, routineRate, goalCount }
  }, [weekDays, store.days, store.routines, store.logs, store.goals])

  function handleCreateGoal() {
    if (!newGoalTitle.trim() || !newGoalFrom || !newGoalTo) return
    store.addGoal({
      title: newGoalTitle, date_from: newGoalFrom, date_to: newGoalTo, note: '',
      tasks: [], categories: [], routines: [],
      ...(newGoalLongId ? { long_goal_id: newGoalLongId } : {}),
    })
    setNewGoalTitle(''); setNewGoalFrom(''); setNewGoalTo(''); setNewGoalLongId(''); setShowGoalForm(false)
  }

  function handleQuickAddTask() {
    if (!qaTaskText.trim()) return
    store.quickAddTask(formatDate(new Date()), qaTaskText.trim())
    setQaTaskText('')
    setShowQuickAdd(false)
  }

  function handleQuickAddGoal() {
    if (!qaGoalTitle.trim() || !qaGoalFrom || !qaGoalTo) return
    store.addGoal({
      title: qaGoalTitle.trim(), date_from: qaGoalFrom, date_to: qaGoalTo, note: '',
      tasks: [], categories: [], routines: [],
      ...(qaGoalLongId ? { long_goal_id: qaGoalLongId } : {}),
    })
    setQaGoalTitle('')
    setQaGoalFrom(formatDate(new Date()))
    setQaGoalTo(formatDate(new Date()))
    setQaGoalLongId('')
    setShowQuickAdd(false)
  }

  function handleHierarchySelectGoal(id: string | null) {
    setSelectedGoalId(id)
    setView('week')
    if (id) {
      const goal = store.goals.find(g => g.id === id)
      if (goal) {
        const goalStart = parseISO(goal.date_from)
        const ws = dfStartOfWeek(goalStart, { weekStartsOn: 1 })
        setWeekBase(ws)
      }
    }
  }

  // Big 3 mantra sentence display
  const big3Summary = weekBig3.filter(t => t.trim()).length > 0
    ? weekBig3.filter(t => t.trim()).join(' · ')
    : ''

  return (
    <>
    <div className="md:hidden">
      <MobileLayout
        days={store.days}
        goals={store.goals}
        longGoals={store.longGoals}
        categories={store.categories}
        routines={store.routines}
        logs={store.logs}
        getDay={store.getDay}
        toggleTask={store.toggleTask}
        addTask={store.addTask}
        updateTask={store.updateTask}
        deleteTask={store.deleteTask}
        updateMeta={store.updateMeta}
        toggleRoutineLog={store.toggleRoutineLog}
        toggleGoalTask={store.toggleGoalTask}
        addGoalTask={store.addGoalTask}
        deleteGoalTask={store.deleteGoalTask}
        addGoal={store.addGoal}
        deleteGoal={store.deleteGoal}
        linkGoalTask={store.linkGoalTask}
        unlinkGoalTask={store.unlinkGoalTask}
        getWeeklyReview={store.getWeeklyReview}
        updateWeeklyReview={store.updateWeeklyReview}
        addCategory={store.addGlobalCategory}
        deleteCategory={store.deleteGlobalCategory}
        updateGoal={store.updateGoal}
      />
    </div>

    <div className="hidden md:block min-h-screen bg-[var(--bg)] relative">
      <div className="w-full px-6 py-7">

        {/* Top bar */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Planr</h1>
              <p className="text-sm text-[var(--text-3)] mt-0.5">{formatMonth(view === 'today' ? parseISO(selectedDate) : weekBase)}</p>
            </div>
            {!syncReady && <p className="text-sm text-[var(--text-3)]">동기화 중...</p>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 mr-2 bg-[var(--surface-2)] rounded-[10px] p-0.5">
              <button onClick={() => { setView('today'); setSelectedDate(formatDate(new Date())); setSelectedGoalId(null) }}
                className={clsx('px-3 h-7 rounded-[8px] text-sm font-medium transition-all',
                  view === 'today' ? 'bg-white text-[var(--text)] shadow-sm' : 'text-[var(--text-3)] hover:text-[var(--text-2)]')}>
                오늘
              </button>
              <button onClick={() => setView('week')}
                className={clsx('px-3 h-7 rounded-[8px] text-sm font-medium transition-all',
                  view === 'week' ? 'bg-white text-[var(--text)] shadow-sm' : 'text-[var(--text-3)] hover:text-[var(--text-2)]')}>
                주간
              </button>
              <button onClick={() => setView('review')}
                className={clsx('px-3 h-7 rounded-[8px] text-sm font-medium transition-all',
                  view === 'review' ? 'bg-white text-[var(--text)] shadow-sm' : 'text-[var(--text-3)] hover:text-[var(--text-2)]')}>
                주간 회고
              </button>
              <button onClick={() => setView('journal')}
                className={clsx('px-3 h-7 rounded-[8px] text-sm font-medium transition-all',
                  view === 'journal' ? 'bg-white text-[var(--text)] shadow-sm' : 'text-[var(--text-3)] hover:text-[var(--text-2)]')}>
                기록
              </button>
            </div>

            {/* Focus timer button */}
            <div className="relative">
              <button onClick={() => setShowFocusTimer(v => !v)}
                className="px-2.5 h-8 rounded-[8px] text-sm font-medium hover:bg-white border border-transparent hover:border-[var(--border)] transition-all text-[var(--text-2)] flex items-center gap-1">
                <Timer size={14} /> 집중
              </button>
              {showFocusTimer && (
                <div className="absolute top-full right-0 mt-1 z-30">
                  <FocusTimer onClose={() => setShowFocusTimer(false)} />
                </div>
              )}
            </div>

            {view === 'today' ? (
              selectedDate !== formatDate(new Date()) && (
                <button onClick={() => setSelectedDate(formatDate(new Date()))}
                  className="px-3 h-8 rounded-[8px] text-sm font-medium hover:bg-white border border-transparent hover:border-[var(--border)] transition-all text-[var(--text-2)]">
                  오늘로
                </button>
              )
            ) : (
              <>
                <button onClick={() => setWeekBase(subWeeks(weekBase, 1))}
                  className="w-8 h-8 rounded-[8px] flex items-center justify-center hover:bg-white border border-transparent hover:border-[var(--border)] transition-all">
                  <ChevronLeft size={16} />
                </button>
                <button onClick={() => setWeekBase(new Date())}
                  className="px-3 h-8 rounded-[8px] text-sm font-medium hover:bg-white border border-transparent hover:border-[var(--border)] transition-all text-[var(--text-2)]">
                  이번 주
                </button>
                <button onClick={() => setWeekBase(addWeeks(weekBase, 1))}
                  className="w-8 h-8 rounded-[8px] flex items-center justify-center hover:bg-white border border-transparent hover:border-[var(--border)] transition-all">
                  <ChevronRight size={16} />
                </button>
              </>
            )}
            {user && (
              <div className="flex items-center gap-2 ml-2">
                <p className="text-sm text-[var(--text-3)]">{user.email}</p>
                <button onClick={signOut}
                  className="w-8 h-8 rounded-[8px] flex items-center justify-center hover:bg-white border border-transparent hover:border-[var(--border)] transition-all">
                  <LogOut size={16} />
                </button>
                <DataPanel />
              </div>
            )}
          </div>
        </div>

        {/* Stats row */}
        {view !== 'today' && (
          <div className="flex items-center gap-4 mb-5 text-xs text-[var(--text-3)]">
            {weekStats.taskRate !== null && <span>할일 {weekStats.taskRate}%</span>}
            {weekStats.routineRate !== null && <span>루틴 {weekStats.routineRate}%</span>}
            {weekStats.goalCount > 0 && <span>목표 {weekStats.goalCount}개</span>}
          </div>
        )}

        {/* 2-column layout */}
        <div className="grid gap-5" style={{ gridTemplateColumns: '280px 1fr' }}>

          {/* Left sidebar */}
          <div className="flex flex-col gap-4 min-w-0">
            <GoalHierarchyView
              longGoals={store.longGoals}
              getLongGoalProgress={store.getLongGoalProgress}
              onAddLongGoal={store.addLongGoal}
              onDeleteLongGoal={store.deleteLongGoal}
            />

            <div className="bg-white border border-[var(--border)] rounded-[16px] p-4">
              <button
                onClick={() => setShowCalendar(v => !v)}
                className="flex items-center gap-1 text-sm font-semibold w-full text-left"
              >
                <span>달력 보기</span>
                <span className="text-[var(--text-3)] text-xs ml-auto">{showCalendar ? '▲' : '▼'}</span>
              </button>
              {showCalendar && (
                <div className="mt-3">
                  <RightSidebar
                    longGoals={store.longGoals}
                    shortGoals={store.goals}
                    selectedDate={selectedDate}
                    onSelectDate={date => { setSelectedDate(date); setSelectedGoalId(null) }}
                    onAddLongGoal={store.addLongGoal}
                    onDeleteLongGoal={store.deleteLongGoal}
                    calendarOnly
                  />
                </div>
              )}
            </div>

            <RoutineSidebar
              routines={store.routines}
              logs={store.logs}
              goalRoutines={todayGoalRoutines}
              goalLabel={todayGoalLabel}
              selectedDate={selectedDate}
              onToggleLog={store.toggleRoutineLog}
              onAddRoutine={store.addRoutine}
              onSetStatus={store.setRoutineStatus}
              onUpdateName={store.updateRoutineName}
              onUpdateRoutine={store.updateRoutine}
              onReorderRoutine={store.reorderRoutine}
              onDeleteRoutine={store.deleteRoutine}
            />
          </div>

          {/* Main content */}
          <div className="flex flex-col gap-4 min-w-0">
            {view === 'today' ? (
              <TodayDashboard
                date={selectedDate}
                entry={selectedEntry}
                categories={store.categories}
                onDateChange={date => { setSelectedDate(date); setSelectedGoalId(null) }}
                onToggleTask={taskId => store.toggleTask(selectedDate, taskId)}
                onAddTask={(categoryId, text, schedule) => store.addTask(selectedDate, categoryId, text, schedule)}
                onUpdateTask={(taskId, patch) => store.updateTask(selectedDate, taskId, patch)}
                onDeleteTask={taskId => store.deleteTask(selectedDate, taskId)}
                onMetaChange={patch => store.updateMeta(selectedDate, patch)}
                onAddCategory={store.addGlobalCategory}
                onDeleteCategory={store.deleteGlobalCategory}
              />
            ) : view === 'journal' ? (
              <Card className="p-5">
                <JournalView
                  days={store.days}
                  goals={store.goals}
                  onUpdateDayNote={(date, noteId, title, body) => store.updateDayNote(date, noteId, title, body)}
                  onDeleteDayNote={(date, noteId) => store.deleteDayNote(date, noteId)}
                  onUpdateGoalNote={(goalId, noteId, text) => store.updateGoalNote(goalId, noteId, text)}
                  onDeleteGoalNote={(goalId, noteId) => store.deleteGoalNote(goalId, noteId)}
                  weeklyReviews={store.weeklyReviews}
                  onUpdateWeeklyReview={store.updateWeeklyReview}
                />
              </Card>
            ) : view === 'review' ? (
              <Card className="p-5">
                <WeeklyReview
                  weekDays={weekDays}
                  days={store.days}
                  routines={store.routines}
                  logs={store.logs}
                  journalEntries={weeklyJournalEntries}
                  onJournalEntriesChange={entries => store.updateWeeklyReview(journalSyncKey, JSON.stringify(entries))}
                />
              </Card>
            ) : (
              <>
                {/* Weekly prompt */}
                <WeeklyPrompt
                  weekKey={weekKey}
                  hasBig3={weekBig3.some(item => item.trim().length > 0)}
                  hasJournal={weeklyJournalEntries.length > 0}
                  onGoToBig3={() => setShowBig3Modal(true)}
                  onGoToReview={() => setView('review')}
                />

                {/* Weekly Big 3 — Mantra Sentence */}
                <button
                  onClick={() => setShowBig3Modal(true)}
                  className="bg-white border border-[var(--border)] rounded-[12px] px-4 py-3 text-left hover:border-[var(--purple)] hover:shadow-sm transition-all group w-full"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-[var(--purple)]">이번 주 Big 3</span>
                    <span className="text-[10px] text-[var(--text-3)] opacity-0 group-hover:opacity-100 transition-opacity">클릭하여 편집</span>
                  </div>
                  {weekMantra ? (
                    <p className="text-sm text-[var(--text)] italic leading-relaxed">&ldquo;{weekMantra}&rdquo;</p>
                  ) : big3Summary ? (
                    <p className="text-sm text-[var(--text-2)]">{big3Summary}</p>
                  ) : (
                    <p className="text-sm text-[var(--text-3)] italic">이번 주의 다짐과 Big 3를 설정해보세요</p>
                  )}
                  {big3Summary && weekMantra && (
                    <div className="flex gap-2 mt-1.5">
                      {weekBig3.filter(t => t.trim()).map((t, i) => (
                        <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--purple-bg)] text-[var(--purple-text)] font-medium truncate max-w-[140px]">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </button>

                {/* Big 3 Modal */}
                {showBig3Modal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowBig3Modal(false)}>
                    <div className="bg-white rounded-[20px] shadow-xl w-full max-w-md p-6 mx-4" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-5">
                        <h2 className="text-lg font-bold">이번 주 다짐 & Big 3</h2>
                        <button onClick={() => setShowBig3Modal(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--surface-2)]">
                          <X size={18} />
                        </button>
                      </div>

                      <div className="mb-5">
                        <label className="block text-xs font-semibold text-[var(--text-2)] mb-2">이번 주 다짐 (한 문장)</label>
                        <input
                          value={weekMantra}
                          onChange={e => saveMantra(e.target.value)}
                          placeholder="예: 이번 주는 집중력을 높이고 건강을 챙기자"
                          className="w-full px-3 py-2.5 rounded-[10px] text-sm bg-[var(--surface-2)] border border-transparent outline-none focus:border-[var(--purple)] focus:bg-white"
                        />
                      </div>

                      <div className="mb-4">
                        <label className="block text-xs font-semibold text-[var(--text-2)] mb-2">Big 3 (가장 중요한 3가지)</label>
                        <div className="flex flex-col gap-2">
                          {[0, 1, 2].map(i => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                                style={{ background: 'var(--purple)' }}>
                                {i + 1}
                              </span>
                              <input
                                value={weekBig3[i] ?? ''}
                                onChange={e => {
                                  const next = [...weekBig3]
                                  while (next.length <= i) next.push('')
                                  next[i] = e.target.value
                                  saveBig3(next)
                                }}
                                placeholder={`Big ${i + 1}...`}
                                className="flex-1 px-3 py-2 rounded-[8px] text-sm bg-[var(--surface-2)] border border-transparent outline-none focus:border-[var(--purple)] focus:bg-white"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      <button onClick={() => setShowBig3Modal(false)}
                        className="w-full py-2 rounded-[10px] text-sm font-medium text-white hover:opacity-90 transition-opacity"
                        style={{ background: 'var(--purple)' }}>
                        완료
                      </button>
                    </div>
                  </div>
                )}

                {/* Weekly grid */}
                <div>
                  <div className="grid grid-cols-7 gap-2">
                    {weekDays.map(date => (
                      <DayCard key={formatDate(date)} date={date}
                        entry={store.days.find(d => d.date === formatDate(date))}
                        goals={store.goals}
                        isSelected={selectedDate === formatDate(date) && !selectedGoalId}
                        onClick={() => { setSelectedDate(formatDate(date)); setSelectedGoalId(null) }}
                      />
                    ))}
                  </div>
                  <GoalSpanRow weekDays={weekDays} goalRows={goalRows} selectedGoalId={selectedGoalId}
                    onSelectGoal={id => setSelectedGoalId(prev => prev === id ? null : id)} />
                  <div className="mt-2 flex justify-end">
                    <button onClick={() => setShowGoalForm(v => !v)}
                      className="flex items-center gap-1 text-[13px] text-[var(--text-3)] hover:text-[var(--text-2)] px-2 py-1 rounded-[6px] hover:bg-white transition-all">
                      <Plus size={11} /> 단기 목표 추가
                    </button>
                  </div>
                  {showGoalForm && (
                    <div className="mt-2 p-4 rounded-[14px] bg-white border border-[var(--border)] flex flex-col gap-2.5">
                      <input value={newGoalTitle} onChange={e => setNewGoalTitle(e.target.value)} placeholder="목표 제목" autoFocus
                        className="w-full px-3 py-2 rounded-[10px] text-sm bg-[var(--surface-2)] outline-none" />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-[var(--text-3)] mb-1 block">시작일</label>
                          <input type="date" value={newGoalFrom} onChange={e => setNewGoalFrom(e.target.value)} className="w-full px-2 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none" />
                        </div>
                        <div>
                          <label className="text-[11px] text-[var(--text-3)] mb-1 block">종료일</label>
                          <input type="date" value={newGoalTo} onChange={e => setNewGoalTo(e.target.value)} className="w-full px-2 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none" />
                        </div>
                      </div>
                      {store.longGoals.length > 0 && (
                        <div>
                          <label className="text-[11px] text-[var(--text-3)] mb-1 block">장기 목표 연결</label>
                          <select value={newGoalLongId} onChange={e => setNewGoalLongId(e.target.value)}
                            className="w-full px-2 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none">
                            <option value="">연결 없음</option>
                            {store.longGoals.map(lg => (
                              <option key={lg.id} value={lg.id}>{lg.title}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button onClick={handleCreateGoal} className="flex-1 py-1.5 rounded-[8px] text-sm bg-[var(--teal)] text-white font-medium">만들기</button>
                        <button onClick={() => setShowGoalForm(false)} className="px-3 py-1.5 rounded-[8px] text-sm text-[var(--text-2)] hover:bg-[var(--border)]">취소</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Weekly input is intentionally limited to schedules and deadlines. */}
                <Card className="p-5">
                  {selectedGoal ? (
                    <GoalDetail
                      goal={selectedGoal}
                      categories={store.categories}
                      allRoutines={store.routines}
                      onUpdate={patch => store.updateGoal(selectedGoal.id, patch)}
                      onDelete={() => { store.deleteGoal(selectedGoal.id); setSelectedGoalId(null) }}
                      onToggleTask={taskId => store.toggleGoalTask(selectedGoal.id, taskId)}
                      onAddTask={(catId, text) => store.addGoalTask(selectedGoal.id, catId, text)}
                      onDeleteTask={taskId => store.deleteGoalTask(selectedGoal.id, taskId)}
                      onUpdateTask={(taskId, patch) => store.updateGoalTask(selectedGoal.id, taskId, patch)}
                      onAddRoutine={name => store.addRoutine(name)}
                      onAddNote={text => store.addGoalNote(selectedGoal.id, text)}
                      onUpdateNote={(noteId, text) => store.updateGoalNote(selectedGoal.id, noteId, text)}
                      onDeleteNote={noteId => store.deleteGoalNote(selectedGoal.id, noteId)}
                      onReorderTasks={(catId, dId, tId) => store.reorderGoalTasks(selectedGoal.id, catId, dId, tId)}
                    />
                  ) : (
                    <WeeklyScheduleEditor
                      entry={selectedEntry}
                      onToggleTask={taskId => store.toggleTask(selectedDate, taskId)}
                      onAddTask={(catId, text, schedule) => store.addTask(selectedDate, catId, text, schedule)}
                      onDeleteTask={taskId => store.deleteTask(selectedDate, taskId)}
                      onUpdateTask={(taskId, patch) => store.updateTask(selectedDate, taskId, patch)}
                    />
                  )}
                </Card>

                <MonthlyGoalCalendar
                  monthBase={monthBase}
                  goals={store.goals}
                  selectedDate={selectedDate}
                  onMonthChange={setMonthBase}
                  onSelectDate={date => { setSelectedDate(date); setSelectedGoalId(null) }}
                  onAddGoal={store.addGoal}
                  onUpdateGoal={store.updateGoal}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Quick Add FAB */}
      <div className="fixed bottom-6 right-6 z-20 flex flex-col items-end gap-2">
        {showQuickAdd && (
          <div className="w-72 bg-white border border-[var(--border)] rounded-[16px] shadow-lg p-4 flex flex-col gap-3 mb-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">빠른 추가</span>
              <button onClick={() => setShowQuickAdd(false)}
                className="w-6 h-6 flex items-center justify-center text-[var(--text-3)] hover:bg-[var(--surface-2)] rounded-[6px]">
                <X size={14} />
              </button>
            </div>
            <div>
              <p className="text-[13px] text-[var(--text-3)] mb-1.5">할 일 (오늘)</p>
              <div className="flex gap-2">
                <input value={qaTaskText} onChange={e => setQaTaskText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleQuickAddTask() }}
                  placeholder="할 일 입력..." autoFocus
                  className="flex-1 px-2 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none focus:ring-1 focus:ring-[var(--purple)]" />
                <button onClick={handleQuickAddTask}
                  className="px-3 py-1.5 rounded-[8px] text-sm font-medium text-white"
                  style={{ background: 'var(--purple)' }}>
                  추가
                </button>
              </div>
            </div>
            <div className="border-t border-[var(--border)]" />
            <div>
              <p className="text-[13px] text-[var(--text-3)] mb-1.5">단기 목표</p>
              <input value={qaGoalTitle} onChange={e => setQaGoalTitle(e.target.value)}
                placeholder="목표 제목"
                className="w-full px-2 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none focus:ring-1 focus:ring-[var(--teal)] mb-2" />
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input type="date" value={qaGoalFrom} onChange={e => setQaGoalFrom(e.target.value)}
                  className="px-2 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none" />
                <input type="date" value={qaGoalTo} onChange={e => setQaGoalTo(e.target.value)}
                  className="px-2 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none" />
              </div>
              {store.longGoals.length > 0 && (
                <select value={qaGoalLongId} onChange={e => setQaGoalLongId(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none mb-2">
                  <option value="">장기 목표 연결 없음</option>
                  {store.longGoals.map(lg => (
                    <option key={lg.id} value={lg.id}>{lg.title}</option>
                  ))}
                </select>
              )}
              <button onClick={handleQuickAddGoal}
                className="w-full py-1.5 rounded-[8px] text-sm font-medium text-white"
                style={{ background: 'var(--teal)' }}>
                만들기
              </button>
            </div>
          </div>
        )}
        <button onClick={() => setShowQuickAdd(v => !v)}
          className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
          style={{ background: 'var(--purple)' }} title="빠른 추가">
          <Plus size={22} />
        </button>
      </div>
    </div>
    </>
  )
}
