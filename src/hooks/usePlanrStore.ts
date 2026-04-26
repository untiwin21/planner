'use client'
import { useState, useCallback, useEffect } from 'react'
import type { DayEntry, ShortGoal, Routine, RoutineLog, Category, Task, DayMeta, LongGoal, RoutineStatus } from '@/types'
import { SCHEDULE_CAT_ID } from '@/types'
import { formatDate } from '@/lib/dates'
import {
  fetchAll,
  upsertDayEntry,
  upsertTask,
  deleteTask as deleteTaskSync,
  upsertRoutine,
  deleteRoutine as deleteRoutineSync,
  upsertRoutineLog,
  upsertShortGoal,
  deleteShortGoal as deleteShortGoalSync,
  upsertLongGoal,
  deleteLongGoal as deleteLongGoalSync,
  upsertWeeklyReview,
} from '@/lib/syncService'

const STORAGE_KEYS = {
  days: 'planr_days',
  goals: 'planr_goals',
  routines: 'planr_routines',
  logs: 'planr_routine_logs',
  longGoals: 'planr_long_goals',
  weeklyReviews: 'planr_weekly_reviews',
  lastSync: 'planr_last_sync',
}

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback }
  catch { return fallback }
}

function save(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

function uid() { return Math.random().toString(36).slice(2, 10) }

const DEFAULT_META: DayMeta = { sleep: null, condition: null, focus: null, top3: [] }

const SCHEDULE_CATEGORY: Category = { id: SCHEDULE_CAT_ID, name: '일정', color: 'blue' }

export function usePlanrStore(userId: string) {
  const [syncReady, setSyncReady] = useState(false)
  const [days, setDaysRaw] = useState<DayEntry[]>(() => load(STORAGE_KEYS.days, []))
  const [goals, setGoalsRaw] = useState<ShortGoal[]>(() => load(STORAGE_KEYS.goals, []))
  const [routines, setRoutinesRaw] = useState<Routine[]>(() => load(STORAGE_KEYS.routines, []))
  const [logs, setLogsRaw] = useState<RoutineLog[]>(() => load(STORAGE_KEYS.logs, []))
  const [longGoals, setLongGoalsRaw] = useState<LongGoal[]>(() => load(STORAGE_KEYS.longGoals, []))
  const [weeklyReviews, setWeeklyReviewsRaw] = useState<Record<string, string>>(() => load(STORAGE_KEYS.weeklyReviews, {}))

  useEffect(() => {
    if (!userId) {
      setSyncReady(true)
      return
    }

    async function sync() {
      try {
        const remoteData = await fetchAll(userId)
        // A real implementation would have a more sophisticated merge strategy
        setDaysRaw(remoteData.days)
        setGoalsRaw(remoteData.goals)
        setRoutinesRaw(remoteData.routines)
        setLogsRaw(remoteData.logs)
        setLongGoalsRaw(remoteData.longGoals)
        setWeeklyReviewsRaw(remoteData.weeklyReviews)
        save(STORAGE_KEYS.lastSync, new Date().toISOString())
      } catch (e) {
        console.error("Sync failed, falling back to local data", e)
      } finally {
        setSyncReady(true)
      }
    }

    sync()
  }, [userId])


  const setDays = useCallback((v: DayEntry[] | ((p: DayEntry[]) => DayEntry[])) => {
    setDaysRaw(prev => { const next = typeof v === 'function' ? v(prev) : v; save(STORAGE_KEYS.days, next); return next })
  }, [])
  const setGoals = useCallback((v: ShortGoal[] | ((p: ShortGoal[]) => ShortGoal[])) => {
    setGoalsRaw(prev => { const next = typeof v === 'function' ? v(prev) : v; save(STORAGE_KEYS.goals, next); return next })
  }, [])
  const setRoutines = useCallback((v: Routine[] | ((p: Routine[]) => Routine[])) => {
    setRoutinesRaw(prev => { const next = typeof v === 'function' ? v(prev) : v; save(STORAGE_KEYS.routines, next); return next })
  }, [])
  const setLogs = useCallback((v: RoutineLog[] | ((p: RoutineLog[]) => RoutineLog[])) => {
    setLogsRaw(prev => { const next = typeof v === 'function' ? v(prev) : v; save(STORAGE_KEYS.logs, next); return next })
  }, [])
  const setLongGoals = useCallback((v: LongGoal[] | ((p: LongGoal[]) => LongGoal[])) => {
    setLongGoalsRaw(prev => { const next = typeof v === 'function' ? v(prev) : v; save(STORAGE_KEYS.longGoals, next); return next })
  }, [])
  const setWeeklyReviews = useCallback((v: Record<string, string> | ((p: Record<string, string>) => Record<string, string>)) => {
    setWeeklyReviewsRaw(prev => { const next = typeof v === 'function' ? v(prev) : v; save(STORAGE_KEYS.weeklyReviews, next); return next })
  }, [])

  // ── DAY ENTRY ──────────────────────────────────────────────────────────────
  function getDay(date: string): DayEntry {
    const stored = days.find(d => d.date === date)
    if (stored) {
      // Ensure schedule category always exists
      const hasSched = stored.categories.find(c => c.id === SCHEDULE_CAT_ID)
      if (!hasSched) return { ...stored, categories: [SCHEDULE_CATEGORY, ...stored.categories] }
      return stored
    }
    return { id: uid(), date, note: '', tasks: [], categories: [SCHEDULE_CATEGORY], meta: DEFAULT_META }
  }

  function upsertDay(entry: DayEntry) {
    setDays(prev => {
      const idx = prev.findIndex(d => d.date === entry.date)
      if (idx >= 0) { const n = [...prev]; n[idx] = entry; return n }
      return [...prev, entry]
    })
    if (userId) upsertDayEntry(userId, entry)
  }

  function toggleTask(date: string, taskId: string) {
    const entry = getDay(date)
    const task = entry.tasks.find(t => t.id === taskId)
    if (task) {
      const updatedTask = { ...task, done: !task.done }
      upsertDay({ ...entry, tasks: entry.tasks.map(t => t.id === taskId ? updatedTask : t) })
      if (userId) upsertTask(userId, updatedTask, date)
    }
  }

  function addTask(date: string, categoryId: string, text: string, time?: string) {
    const entry = getDay(date)
    const category = entry.categories.find(c => c.id === categoryId)
    if (!category) return
    const task: Task = { id: uid(), text, done: false, category_id: categoryId, day_id: entry.id, category_name: category.name, category_color: category.color, ...(time ? { time } : {}) }
    upsertDay({ ...entry, tasks: [...entry.tasks, task] })
    if (userId) upsertTask(userId, task, date)
  }

  function deleteTask(date: string, taskId: string) {
    const entry = getDay(date)
    upsertDay({ ...entry, tasks: entry.tasks.filter(t => t.id !== taskId) })
    if (userId) deleteTaskSync(userId, taskId)
  }

  function upsertCategory(date: string, cat: Omit<Category, 'id'> & { id?: string }) {
    if (cat.id === SCHEDULE_CAT_ID) return // schedule cat is immutable
    const entry = getDay(date)
    const id = cat.id ?? uid()
    const full: Category = { ...cat, id }
    const exists = entry.categories.find(c => c.id === id)
    const categories = exists
      ? entry.categories.map(c => c.id === id ? full : c)
      : [...entry.categories, full]
    upsertDay({ ...entry, categories })
  }

  function updateNote(date: string, note: string) {
    const updatedEntry = { ...getDay(date), note }
    upsertDay(updatedEntry)
    if (userId) upsertDayEntry(userId, updatedEntry)
  }

  function updateMeta(date: string, patch: Partial<DayMeta>) {
    const entry = getDay(date)
    const updatedEntry = { ...entry, meta: { ...entry.meta, ...patch } }
    upsertDay(updatedEntry)
    if (userId) upsertDayEntry(userId, updatedEntry)
  }

  // ── SHORT GOALS ────────────────────────────────────────────────────────────
  function addGoal(g: Omit<ShortGoal, 'id'>) {
    const newGoal = { ...g, id: uid() }
    setGoals(prev => [...prev, newGoal])
    if (userId) upsertShortGoal(userId, newGoal)
  }
  function updateGoal(id: string, patch: Partial<ShortGoal>) {
    let updatedGoal: ShortGoal | undefined;
    setGoals(prev => prev.map(g => {
      if (g.id === id) {
        updatedGoal = { ...g, ...patch }
        return updatedGoal
      }
      return g
    }))
    if (userId && updatedGoal) upsertShortGoal(userId, updatedGoal)
  }
  function deleteGoal(id: string) {
    setGoals(prev => prev.filter(g => g.id !== id))
    if (userId) deleteShortGoalSync(userId, id)
  }
  function toggleGoalTask(goalId: string, taskId: string) {
    let updatedGoal: ShortGoal | undefined;
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      const tasks = g.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t)
      updatedGoal = { ...g, tasks }
      return updatedGoal
    }))
    if (userId && updatedGoal) {
      const task = updatedGoal.tasks.find(t => t.id === taskId)
      if (task) upsertTask(userId, { ...task, goal_id: goalId }, goalId)
    }
  }
  function addGoalTask(goalId: string, categoryId: string, text: string) {
    let updatedGoal: ShortGoal | undefined;
    let newTask: Task | undefined;
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      const category = g.categories.find(c => c.id === categoryId)
      if (!category) return g
      newTask = { id: uid(), text, done: false, category_id: categoryId, day_id: goalId, goal_id: goalId, category_name: category.name, category_color: category.color }
      updatedGoal = { ...g, tasks: [...g.tasks, newTask] }
      return updatedGoal
    }))
    if (userId && updatedGoal && newTask) {
      upsertTask(userId, newTask, goalId)
    }
  }

  // ── LONG GOALS ─────────────────────────────────────────────────────────────
  function addLongGoal(g: Omit<LongGoal, 'id'>) {
    const newGoal = { ...g, id: uid() }
    setLongGoals(prev => [...prev, newGoal])
    if (userId) upsertLongGoal(userId, newGoal)
  }
  function updateLongGoal(id: string, patch: Partial<LongGoal>) {
    let updatedGoal: LongGoal | undefined;
    setLongGoals(prev => prev.map(g => {
      if (g.id === id) {
        updatedGoal = { ...g, ...patch }
        return updatedGoal
      }
      return g
    }))
    if (userId && updatedGoal) upsertLongGoal(userId, updatedGoal)
  }
  function deleteLongGoal(id: string) {
    setLongGoals(prev => prev.filter(g => g.id !== id))
    if (userId) deleteLongGoalSync(userId, id)
  }

  // ── QUICK ADD ──────────────────────────────────────────────────────────────
  function quickAddTask(date: string, text: string) {
    const entry = getDay(date)
    const nonScheduleCat = entry.categories.find(c => c.id !== SCHEDULE_CAT_ID)
    if (nonScheduleCat) {
      const task: Task = { id: uid(), text, done: false, category_id: nonScheduleCat.id, day_id: entry.id, category_name: nonScheduleCat.name, category_color: nonScheduleCat.color }
      upsertDay({ ...entry, tasks: [...entry.tasks, task] })
      if (userId) upsertTask(userId, task, date)
    } else {
      const catId = uid()
      const newCat: Category = { id: catId, name: '할 일', color: 'purple' }
      const task: Task = { id: uid(), text, done: false, category_id: catId, day_id: entry.id, category_name: newCat.name, category_color: newCat.color }
      upsertDay({ ...entry, categories: [...entry.categories, newCat], tasks: [...entry.tasks, task] })
      if (userId) upsertTask(userId, task, date)
    }
  }

  // ── ROUTINES ───────────────────────────────────────────────────────────────
  function addRoutine(name: string) {
    const newRoutine = { id: uid(), name, status: 'active' as RoutineStatus, created_at: formatDate(new Date()) }
    setRoutines(prev => [...prev, newRoutine])
    if (userId) upsertRoutine(userId, newRoutine)
  }
  function setRoutineStatus(id: string, status: RoutineStatus) {
    let updatedRoutine: Routine | undefined
    setRoutines(prev => prev.map(r => {
      if (r.id === id) {
        updatedRoutine = { ...r, status }
        return updatedRoutine
      }
      return r
    }))
    if (userId && updatedRoutine) upsertRoutine(userId, updatedRoutine)
  }
  function updateRoutineName(id: string, name: string) {
    let updatedRoutine: Routine | undefined
    setRoutines(prev => prev.map(r => {
      if (r.id === id) {
        updatedRoutine = { ...r, name }
        return updatedRoutine
      }
      return r
    }))
    if (userId && updatedRoutine) upsertRoutine(userId, updatedRoutine)
  }
  function deleteRoutine(id: string) {
    setRoutines(prev => prev.filter(r => r.id !== id))
    setLogs(prev => prev.filter(l => l.routine_id !== id))
    if (userId) deleteRoutineSync(userId, id)
  }
  function toggleRoutineLog(routineId: string, date: string) {
    let updatedLog: RoutineLog | undefined
    setLogs(prev => {
      const exists = prev.find(l => l.routine_id === routineId && l.date === date)
      if (exists) {
        updatedLog = { ...exists, done: !exists.done }
        return prev.map(l => l.id === exists.id ? updatedLog! : l)
      }
      updatedLog = { id: uid(), routine_id: routineId, date, done: true }
      return [...prev, updatedLog]
    })
    if (userId && updatedLog) upsertRoutineLog(userId, updatedLog)
  }
  function isRoutineDone(routineId: string, date: string): boolean {
    return logs.find(l => l.routine_id === routineId && l.date === date)?.done ?? false
  }
  
  // ── WEEKLY REVIEW ──────────────────────────────────────────────────────────
  function getWeeklyReview(weekKey: string): string {
    return weeklyReviews[weekKey] || ''
  }

  function updateWeeklyReview(weekKey: string, content: string) {
    setWeeklyReviews(prev => ({...prev, [weekKey]: content}))
    if(userId) upsertWeeklyReview(userId, weekKey, content)
  }

  return {
    syncReady,
    days, goals, routines, logs, longGoals, weeklyReviews,
    getDay, upsertDay, toggleTask, addTask, deleteTask, upsertCategory, updateNote, updateMeta,
    addGoal, updateGoal, deleteGoal, toggleGoalTask, addGoalTask,
    addLongGoal, updateLongGoal, deleteLongGoal,
    addRoutine, setRoutineStatus, updateRoutineName, deleteRoutine, toggleRoutineLog, isRoutineDone,
    quickAddTask,
    getWeeklyReview, updateWeeklyReview
  }
}
