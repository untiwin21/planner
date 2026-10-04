'use client'
import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, LogOut } from 'lucide-react'
import { addWeeks, subWeeks, parseISO } from 'date-fns'
import { getWeekDays, formatDate, formatMonth } from '@/lib/dates'
import { usePlanrStore } from '@/hooks/usePlanrStore'
import { WeekOverview } from '@/components/weekly/WeekOverview'
import { PlannerAssistantBridge } from '@/components/assistant/PlannerAssistantBridge'
import { Card } from '@/components/ui'
import { WeeklySummary } from '@/components/review/WeeklySummary'
import clsx from 'clsx'
import { useUserId } from '@/context/UserContext'
import { supabase } from '@/lib/supabase'
import { signOut } from '@/lib/auth'
import { DataPanel } from '@/components/settings/DataPanel'
import { MobileLayout } from '@/components/mobile/MobileLayout'
import { TodayDashboard } from '@/components/today/TodayDashboard'
import { MonthlyGoalCalendar } from '@/components/weekly/MonthlyGoalCalendar'
import { ShortGoalEditModal } from '@/components/weekly/ShortGoalEditModal'

export default function Home() {
  const userId = useUserId()
  const [user, setUser] = useState<any>(null)
  const [weekBase, setWeekBase] = useState(new Date())
  const [monthBase, setMonthBase] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [view, setView] = useState<'today' | 'week'>('today')

  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [qaTaskText, setQaTaskText] = useState('')
  const [qaGoalTitle, setQaGoalTitle] = useState('')
  const [qaGoalFrom, setQaGoalFrom] = useState(formatDate(new Date()))
  const [qaGoalTo, setQaGoalTo] = useState(formatDate(new Date()))
  const [qaGoalLongId, setQaGoalLongId] = useState('')


  const { syncReady, ...store } = usePlanrStore(userId)
  const weekDays = useMemo(() => getWeekDays(weekBase), [weekBase])
  const selectedEntry = store.getDay(selectedDate)
  const editingGoal = editingGoalId ? store.goals.find(g => g.id === editingGoalId) ?? null : null
  useEffect(() => {
    if (supabase) {
      supabase.auth.getUser().then(({ data: { user } }) => setUser(user))
    }
  }, [])

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

  return (
    <>
    <PlannerAssistantBridge userId={userId} syncReady={syncReady} />
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
        updateRoutineLog={store.updateRoutineLog}
        addRoutine={store.addRoutine}
        updateRoutine={store.updateRoutine}
        setRoutineStatus={store.setRoutineStatus}
        deleteRoutine={store.deleteRoutine}
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
              <button onClick={() => { setView('today'); setSelectedDate(formatDate(new Date())) }}
                className={clsx('px-3 h-7 rounded-[8px] text-sm font-medium transition-all',
                  view === 'today' ? 'bg-white text-[var(--text)] shadow-sm' : 'text-[var(--text-3)] hover:text-[var(--text-2)]')}>
                플래너
              </button>
              <button onClick={() => setView('week')}
                className={clsx('px-3 h-7 rounded-[8px] text-sm font-medium transition-all',
                  view === 'week' ? 'bg-white text-[var(--text)] shadow-sm' : 'text-[var(--text-3)] hover:text-[var(--text-2)]')}>
                목표·계획
              </button>
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

        <div className="grid grid-cols-1 gap-5">
          {/* Main content */}
          <div className="flex flex-col gap-4 min-w-0">
            {view === 'today' ? (
              <>
                  <TodayDashboard
                    weekOverview={<WeekOverview days={store.days} goals={store.goals} selectedDate={selectedDate} onSelectDate={date => { setSelectedDate(date) }} />}
                    date={selectedDate}
                    entry={selectedEntry}
                    categories={store.categories}
                    goals={store.goals}
                    longGoals={store.longGoals}
                    onDateChange={date => { setSelectedDate(date) }}
                    onToggleTask={taskId => store.toggleTask(selectedDate, taskId)}
                    onAddTask={(categoryId, text, schedule) => store.addTask(selectedDate, categoryId, text, schedule)}
                    onCarryTask={(targetDate, categoryId, text, schedule) => store.addTask(targetDate, categoryId, text, schedule)}
                    onUpdateTask={(taskId, patch) => store.updateTask(selectedDate, taskId, patch)}
                    onDeleteTask={taskId => store.deleteTask(selectedDate, taskId)}
                    onMetaChange={patch => store.updateMeta(selectedDate, patch)}
                    onAddCategory={store.addGlobalCategory}
                    onDeleteCategory={store.deleteGlobalCategory}
                    onUpdateCategory={store.updateGlobalCategory}
                    onReorderCategory={store.reorderCategory}
                    onReorderTask={(categoryId, draggedId, targetId) => store.reorderDayTasks(selectedDate, categoryId, draggedId, targetId)}
                    routines={store.routines}
                    routineLogs={store.logs}
                    onToggleRoutine={store.toggleRoutineLog}
                    onUpdateRoutineLog={store.updateRoutineLog}
                    onAddRoutine={store.addRoutine}
                    onUpdateRoutine={store.updateRoutine}
                    onSetRoutineStatus={store.setRoutineStatus}
                    onDeleteRoutine={store.deleteRoutine}
                  />
              </>
            ) : (
              <>
                <Card className="p-5">
                  <WeeklySummary weekDays={weekDays} days={store.days} routines={store.routines} logs={store.logs} />
                </Card>
                <MonthlyGoalCalendar
                  monthBase={monthBase}
                  goals={store.goals}
                  days={store.days}
                  selectedDate={selectedDate}
                  onMonthChange={setMonthBase}
                  onSelectDate={date => { setSelectedDate(date) }}
                  onAddGoal={store.addGoal}
                  onUpdateGoal={store.updateGoal}
                  onEditGoal={setEditingGoalId}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <ShortGoalEditModal
        goal={editingGoal}
        onClose={() => setEditingGoalId(null)}
        onSave={store.updateGoal}
      />

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
