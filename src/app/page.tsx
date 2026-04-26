'use client'
import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, LogOut } from 'lucide-react'
import { addWeeks, subWeeks, parseISO } from 'date-fns'
import { getWeekDays, formatDate, formatMonth, isGoalActive } from '@/lib/dates'
import { usePlanrStore } from '@/hooks/usePlanrStore'
import { DayCard } from '@/components/weekly/DayCard'
import { DayDetail } from '@/components/weekly/DayDetail'
import { GoalSpanRow } from '@/components/weekly/GoalSpanRow'
import { GoalDetail } from '@/components/goals/GoalDetail'
import { RoutineSidebar } from '@/components/routine/RoutineSidebar'
import { RightSidebar } from '@/components/layout/RightSidebar'
import { CategoryPanel } from '@/components/layout/CategoryPanel'
import { WeeklyReview } from '@/components/review/WeeklyReview'
import { Card } from '@/components/ui'
import type { ShortGoal } from '@/types'
import clsx from 'clsx'
import { useUserId } from '@/context/UserContext'
import { supabase } from '@/lib/supabase'
import { signOut } from '@/lib/auth'
import { DataPanel } from '@/components/settings/DataPanel'

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

export default function Home() {
  const userId = useUserId()
  const [user, setUser] = useState<any>(null)
  const [weekBase, setWeekBase] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [newGoalFrom, setNewGoalFrom] = useState('')
  const [newGoalTo, setNewGoalTo] = useState('')
  const [newGoalTitle, setNewGoalTitle] = useState('')
  const [view, setView] = useState<'week' | 'review'>('week')

  // Quick Add state
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [qaTaskText, setQaTaskText] = useState('')
  const [qaGoalTitle, setQaGoalTitle] = useState('')
  const [qaGoalFrom, setQaGoalFrom] = useState(formatDate(new Date()))
  const [qaGoalTo, setQaGoalTo] = useState(formatDate(new Date()))

  const { syncReady, ...store } = usePlanrStore(userId)
  const weekDays = useMemo(() => getWeekDays(weekBase), [weekBase])
  const selectedEntry = store.getDay(selectedDate)
  const selectedGoal = selectedGoalId ? store.goals.find(g => g.id === selectedGoalId) : null
  const goalRows = useMemo(() => packGoalsIntoRows(store.goals, weekDays), [store.goals, weekDays])

  useEffect(() => {
    if (supabase) {
      supabase.auth.getUser().then(({ data: { user } }) => setUser(user))
    }
  }, [])

  // Today's active short goals
  const todayShortGoals = useMemo(
    () => store.goals.filter(g => isGoalActive(g, new Date())),
    [store.goals],
  )
  const todayGoalRoutines = todayShortGoals[0]?.routines ?? []
  const todayGoalLabel = todayShortGoals[0]?.title

  function handleCreateGoal() {
    if (!newGoalTitle.trim() || !newGoalFrom || !newGoalTo) return
    store.addGoal({ title: newGoalTitle, date_from: newGoalFrom, date_to: newGoalTo, note: '', tasks: [], categories: [], routines: [] })
    setNewGoalTitle(''); setNewGoalFrom(''); setNewGoalTo(''); setShowGoalForm(false)
  }

  function handleQuickAddTask() {
    if (!qaTaskText.trim()) return
    store.quickAddTask(formatDate(new Date()), qaTaskText.trim())
    setQaTaskText('')
    setShowQuickAdd(false)
  }

  function handleQuickAddGoal() {
    if (!qaGoalTitle.trim() || !qaGoalFrom || !qaGoalTo) return
    store.addGoal({ title: qaGoalTitle.trim(), date_from: qaGoalFrom, date_to: qaGoalTo, note: '', tasks: [], categories: [], routines: [] })
    setQaGoalTitle('')
    setQaGoalFrom(formatDate(new Date()))
    setQaGoalTo(formatDate(new Date()))
    setShowQuickAdd(false)
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] relative">
      <div className="max-w-[1600px] mx-auto px-6 py-7">

        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Planr</h1>
              <p className="text-sm text-[var(--text-3)] mt-0.5">{formatMonth(weekBase)}</p>
            </div>
            {!syncReady && <p className="text-sm text-[var(--text-3)]">동기화 중...</p>}
          </div>
          <div className="flex items-center gap-2">
            {/* View tabs */}
            <div className="flex items-center gap-1 mr-2 bg-[var(--surface-2)] rounded-[10px] p-0.5">
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
            </div>
            {/* Week navigation */}
            <button onClick={() => setWeekBase(subWeeks(weekBase, 1))}
              className="w-8 h-8 rounded-[8px] flex items-center justify-center hover:bg-white border border-transparent hover:border-[var(--border)] transition-all">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => setWeekBase(new Date())}
              className="px-3 h-8 rounded-[8px] text-sm font-medium hover:bg-white border border-transparent hover:border-[var(--border)] transition-all text-[var(--text-2)]">
              오늘
            </button>
            <button onClick={() => setWeekBase(addWeeks(weekBase, 1))}
              className="w-8 h-8 rounded-[8px] flex items-center justify-center hover:bg-white border border-transparent hover:border-[var(--border)] transition-all">
              <ChevronRight size={16} />
            </button>
            {/* User menu */}
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

        {/* 2-column layout: left sidebar | main content */}
        <div className="grid gap-5" style={{ gridTemplateColumns: '280px 1fr' }}>

          {/* ── Left sidebar ── */}
          <div className="flex flex-col gap-4 min-w-0">

            {/* 1. Mini Calendar + Long Goals */}
            <RightSidebar
              longGoals={store.longGoals}
              shortGoals={store.goals}
              selectedDate={selectedDate}
              onSelectDate={date => { setSelectedDate(date); setSelectedGoalId(null) }}
              onAddLongGoal={store.addLongGoal}
              onDeleteLongGoal={store.deleteLongGoal}
            />

            {/* 2. 오늘의 단기 목표 — always visible */}
            <div className="bg-white border border-[var(--border)] rounded-[16px] p-4">
              <h3 className="text-sm font-semibold mb-2">오늘의 단기 목표</h3>
              {todayShortGoals.length === 0 ? (
                <p className="text-xs text-[var(--text-3)]">오늘 진행 중인 단기 목표가 없습니다.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {todayShortGoals.map(g => {
                    const total = g.tasks.length
                    const done = g.tasks.filter(t => t.done).length
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0
                    const isActive = selectedGoalId === g.id
                    return (
                      <button key={g.id}
                        onClick={() => { setSelectedGoalId(prev => prev === g.id ? null : g.id); setView('week') }}
                        className={clsx('w-full text-left p-2.5 rounded-[10px] transition-all',
                          isActive ? 'bg-[var(--teal-bg)] ring-1 ring-[var(--teal)]' : 'hover:bg-[var(--surface-2)]')}>
                        <p className={clsx('text-xs font-semibold truncate mb-1.5',
                          isActive ? 'text-[var(--teal-text)]' : 'text-[var(--text)]')}>
                          {g.title}
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1 rounded-full bg-[var(--border)]">
                            <div className="h-full rounded-full transition-all duration-300"
                              style={{ width: `${pct}%`, background: 'var(--teal)' }} />
                          </div>
                          <span className="text-[10px] text-[var(--text-3)] flex-shrink-0 tabular-nums">
                            {done}/{total}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 3. 카테고리 관리 */}
            <CategoryPanel
              categories={store.categories}
              onAdd={store.addGlobalCategory}
              onDelete={store.deleteGlobalCategory}
            />

            {/* 4. 오늘 루틴 + 루틴 히스토리 */}
            <RoutineSidebar
              routines={store.routines}
              logs={store.logs}
              goalRoutines={todayGoalRoutines}
              goalLabel={todayGoalLabel}
              onToggleLog={store.toggleRoutineLog}
              onAddRoutine={store.addRoutine}
              onSetStatus={store.setRoutineStatus}
              onUpdateName={store.updateRoutineName}
              onDeleteRoutine={store.deleteRoutine}
            />
          </div>

          {/* ── Main content ── */}
          <div className="flex flex-col gap-4 min-w-0">
            {view === 'review' ? (
              <Card className="p-5">
                <WeeklyReview
                  weekDays={weekDays}
                  days={store.days}
                  goals={store.goals}
                  routines={store.routines}
                  logs={store.logs}
                />
              </Card>
            ) : (
              <>
                {/* Weekly grid */}
                <div>
                  <div className="grid grid-cols-7 gap-2">
                    {weekDays.map(date => (
                      <DayCard key={formatDate(date)} date={date}
                        entry={store.days.find(d => d.date === formatDate(date))}
                        isSelected={selectedDate === formatDate(date) && !selectedGoalId}
                        onClick={() => { setSelectedDate(formatDate(date)); setSelectedGoalId(null) }}
                      />
                    ))}
                  </div>
                  <GoalSpanRow weekDays={weekDays} goalRows={goalRows} selectedGoalId={selectedGoalId}
                    onSelectGoal={id => setSelectedGoalId(prev => prev === id ? null : id)} />
                  <div className="mt-2 flex justify-end">
                    <button onClick={() => setShowGoalForm(v => !v)}
                      className="flex items-center gap-1 text-[11px] text-[var(--text-3)] hover:text-[var(--text-2)] px-2 py-1 rounded-[6px] hover:bg-white transition-all">
                      <Plus size={11} /> 단기 목표 추가
                    </button>
                  </div>
                  {showGoalForm && (
                    <div className="mt-2 p-4 rounded-[14px] bg-white border border-[var(--border)] flex flex-col gap-2.5">
                      <input value={newGoalTitle} onChange={e => setNewGoalTitle(e.target.value)} placeholder="목표 제목" autoFocus
                        className="w-full px-3 py-2 rounded-[10px] text-sm bg-[var(--surface-2)] outline-none" />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-[var(--text-3)] mb-1 block">시작일</label>
                          <input type="date" value={newGoalFrom} onChange={e => setNewGoalFrom(e.target.value)} className="w-full px-2 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none" />
                        </div>
                        <div>
                          <label className="text-[10px] text-[var(--text-3)] mb-1 block">종료일</label>
                          <input type="date" value={newGoalTo} onChange={e => setNewGoalTo(e.target.value)} className="w-full px-2 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleCreateGoal} className="flex-1 py-1.5 rounded-[8px] text-sm bg-[var(--teal)] text-white font-medium">만들기</button>
                        <button onClick={() => setShowGoalForm(false)} className="px-3 py-1.5 rounded-[8px] text-sm text-[var(--text-2)] hover:bg-[var(--border)]">취소</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Detail panel */}
                <Card className="p-5">
                  {selectedGoal ? (
                    <GoalDetail goal={selectedGoal} allRoutines={store.routines}
                      onUpdate={patch => store.updateGoal(selectedGoal.id, patch)}
                      onDelete={() => { store.deleteGoal(selectedGoal.id); setSelectedGoalId(null) }}
                      onToggleTask={taskId => store.toggleGoalTask(selectedGoal.id, taskId)}
                      onAddTask={(catId, text) => store.addGoalTask(selectedGoal.id, catId, text)}
                      onAddRoutine={name => store.addRoutine(name)} />
                  ) : (
                    <DayDetail
                      date={parseISO(selectedDate)}
                      entry={selectedEntry}
                      categories={store.categories}
                      onNoteChange={note => store.updateNote(selectedDate, note)}
                      onToggleTask={taskId => store.toggleTask(selectedDate, taskId)}
                      onAddTask={(catId, text, time) => store.addTask(selectedDate, catId, text, time)}
                      onDeleteTask={taskId => store.deleteTask(selectedDate, taskId)}
                      onMetaChange={patch => store.updateMeta(selectedDate, patch)}
                    />
                  )}
                </Card>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick Add FAB ── */}
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
            {/* Task quick-add */}
            <div>
              <p className="text-[11px] text-[var(--text-3)] mb-1.5">할 일 (오늘)</p>
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
            {/* Goal quick-add */}
            <div>
              <p className="text-[11px] text-[var(--text-3)] mb-1.5">단기 목표</p>
              <input value={qaGoalTitle} onChange={e => setQaGoalTitle(e.target.value)}
                placeholder="목표 제목"
                className="w-full px-2 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none focus:ring-1 focus:ring-[var(--teal)] mb-2" />
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input type="date" value={qaGoalFrom} onChange={e => setQaGoalFrom(e.target.value)}
                  className="px-2 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none" />
                <input type="date" value={qaGoalTo} onChange={e => setQaGoalTo(e.target.value)}
                  className="px-2 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none" />
              </div>
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
  )
}
