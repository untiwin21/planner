'use client'
import { useState, useCallback, useEffect } from 'react'
import type { DayEntry, ShortGoal, Routine, RoutineLog, Category, Task, DayMeta, LongGoal, RoutineStatus, NoteEntry, JournalEntry } from '@/types'
import { SCHEDULE_CAT_ID, DEADLINE_CAT_ID } from '@/types'
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
  categories: 'planr_categories',
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

const DEFAULT_META: DayMeta = { sleep: null, condition: null, focus: null, top3: [], notes: [] }
const DEADLINE_CATEGORY: Category = { id: DEADLINE_CAT_ID, name: '데드라인', color: 'red' }
const SCHEDULE_CATEGORY: Category = { id: SCHEDULE_CAT_ID, name: '일정', color: 'blue' }

export function usePlanrStore(userId: string) {
  const [syncReady, setSyncReady] = useState(false)
  const [days, setDaysRaw] = useState<DayEntry[]>(() => load(STORAGE_KEYS.days, []))
  const [goals, setGoalsRaw] = useState<ShortGoal[]>(() => load(STORAGE_KEYS.goals, []))
  const [routines, setRoutinesRaw] = useState<Routine[]>(() => load(STORAGE_KEYS.routines, []))
  const [logs, setLogsRaw] = useState<RoutineLog[]>(() => load(STORAGE_KEYS.logs, []))
  const [longGoals, setLongGoalsRaw] = useState<LongGoal[]>(() => load(STORAGE_KEYS.longGoals, []))
  const [weeklyReviews, setWeeklyReviewsRaw] = useState<Record<string, string>>(() => load(STORAGE_KEYS.weeklyReviews, {}))
  const [categories, setCategoriesRaw] = useState<Category[]>(() => load(STORAGE_KEYS.categories, []))

  useEffect(() => {
    if (!userId) { setSyncReady(true); return }
    async function sync() {
      try {
        const remoteData = await fetchAll(userId)

        // ── Days: merge remote + local (never discard local tasks) ──────────
        setDaysRaw(prev => {
          if (remoteData.days.length === 0) return prev  // remote empty → keep local
          const localMap = new Map(prev.map(d => [d.date, d]))
          const remoteDates = new Set(remoteData.days.map((d: DayEntry) => d.date))
          // Merge each remote day with local counterpart
          const merged = remoteData.days.map((rem: DayEntry) => {
            const loc = localMap.get(rem.date)
            if (!loc) return rem
            // Union tasks by id (remote wins on conflict, local-only tasks preserved)
            const remoteTaskIds = new Set(rem.tasks.map((t: Task) => t.id))
            const localOnlyTasks = loc.tasks.filter((t: Task) => !remoteTaskIds.has(t.id))
            // Union notes by id
            const remNotes = rem.meta?.notes ?? []
            const locNotes = loc.meta?.notes ?? []
            const remNoteIds = new Set(remNotes.map((n: any) => n.id))
            const localOnlyNotes = locNotes.filter((n: any) => !remNoteIds.has(n.id))
            return {
              ...rem,
              tasks: [...rem.tasks, ...localOnlyTasks],
              meta: { ...rem.meta, notes: [...remNotes, ...localOnlyNotes] },
            }
          })
          // Append local-only days not yet in remote
          const localOnly = prev.filter(d => !remoteDates.has(d.date))
          return [...merged, ...localOnly]
        })

        // ── Goals: same merge strategy ───────────────────────────────────────
        setGoalsRaw(prev => {
          if (remoteData.goals.length === 0) return prev
          const localMap = new Map(prev.map(g => [g.id, g]))
          const remoteIds = new Set(remoteData.goals.map((g: ShortGoal) => g.id))
          const merged = remoteData.goals.map((rem: ShortGoal) => {
            const loc = localMap.get(rem.id)
            if (!loc) return rem
            const remTaskIds = new Set(rem.tasks.map((t: Task) => t.id))
            const localOnlyTasks = loc.tasks.filter((t: Task) => !remTaskIds.has(t.id))
            const remNoteIds = new Set((rem.notes ?? []).map((n: any) => n.id))
            const localOnlyNotes = (loc.notes ?? []).filter((n: any) => !remNoteIds.has(n.id))
            return {
              ...rem,
              tasks: [...rem.tasks, ...localOnlyTasks],
              notes: [...(rem.notes ?? []), ...localOnlyNotes],
            }
          })
          const localOnly = prev.filter(g => !remoteIds.has(g.id))
          return [...merged, ...localOnly]
        })

        if (remoteData.routines.length > 0)  setRoutinesRaw(remoteData.routines)
        if (remoteData.logs.length > 0)      setLogsRaw(remoteData.logs)
        if (remoteData.longGoals.length > 0) setLongGoalsRaw(remoteData.longGoals)
        if (Object.keys(remoteData.weeklyReviews).length > 0) setWeeklyReviewsRaw(remoteData.weeklyReviews)
        save(STORAGE_KEYS.lastSync, new Date().toISOString())
      } catch (e) {
        console.error('Sync failed, falling back to local data', e)
      } finally {
        setSyncReady(true)
      }
    }
    sync()
  }, [userId])

  // ── Setters with auto-persist ──────────────────────────────────────────────
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
  const setCategories = useCallback((v: Category[] | ((p: Category[]) => Category[])) => {
    setCategoriesRaw(prev => { const next = typeof v === 'function' ? v(prev) : v; save(STORAGE_KEYS.categories, next); return next })
  }, [])

  // ── DAY ENTRY ──────────────────────────────────────────────────────────────
  function getDay(date: string): DayEntry {
    const stored = days.find(d => d.date === date)
    if (stored) {
      let cats = stored.categories
      if (!cats.find(c => c.id === DEADLINE_CAT_ID)) cats = [DEADLINE_CATEGORY, ...cats]
      if (!cats.find(c => c.id === SCHEDULE_CAT_ID)) cats = [...cats, SCHEDULE_CATEGORY]
      if (cats === stored.categories) return stored
      return { ...stored, categories: cats }
    }
    return { id: uid(), date, note: '', tasks: [], categories: [DEADLINE_CATEGORY, SCHEDULE_CATEGORY], meta: DEFAULT_META }
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
    // Schedule cat lives in entry.categories; all others come from global categories
    const category =
      entry.categories.find(c => c.id === categoryId) ||
      categories.find(c => c.id === categoryId)
    if (!category) return
    const task: Task = {
      id: uid(), text, done: false,
      category_id: categoryId, day_id: entry.id,
      category_name: category.name, category_color: category.color,
      ...(time ? { time } : {}),
    }
    upsertDay({ ...entry, tasks: [...entry.tasks, task] })
    if (userId) upsertTask(userId, task, date)
  }

  function deleteTask(date: string, taskId: string) {
    const entry = getDay(date)
    upsertDay({ ...entry, tasks: entry.tasks.filter(t => t.id !== taskId) })
    if (userId) deleteTaskSync(userId, taskId)
  }

  function updateTask(date: string, taskId: string, patch: Partial<Task>) {
    const entry = getDay(date)
    const task = entry.tasks.find(t => t.id === taskId)
    if (!task) return
    const updated = { ...task, ...patch }
    upsertDay({ ...entry, tasks: entry.tasks.map(t => t.id === taskId ? updated : t) })
    if (userId) upsertTask(userId, updated, date)
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

  // ── DAY NOTES (journal) ───────────────────────────────────────────────────
  function addDayNote(date: string, title: string, body: string) {
    const entry = getDay(date)
    const note: JournalEntry = { id: uid(), title, body, createdAt: new Date().toISOString() }
    const updatedEntry = { ...entry, meta: { ...entry.meta, notes: [note, ...(entry.meta.notes ?? [])] } }
    upsertDay(updatedEntry)
    if (userId) upsertDayEntry(userId, updatedEntry)
  }

  function updateDayNote(date: string, noteId: string, title: string, body: string) {
    const entry = getDay(date)
    const notes = (entry.meta.notes ?? []).map(n => n.id === noteId ? { ...n, title, body } : n)
    const updatedEntry = { ...entry, meta: { ...entry.meta, notes } }
    upsertDay(updatedEntry)
    if (userId) upsertDayEntry(userId, updatedEntry)
  }

  function deleteDayNote(date: string, noteId: string) {
    const entry = getDay(date)
    const notes = (entry.meta.notes ?? []).filter(n => n.id !== noteId)
    const updatedEntry = { ...entry, meta: { ...entry.meta, notes } }
    upsertDay(updatedEntry)
    if (userId) upsertDayEntry(userId, updatedEntry)
  }

  // ── GLOBAL CATEGORIES ─────────────────────────────────────────────────────
  function addGlobalCategory(cat: Omit<Category, 'id'>) {
    const newCat: Category = { ...cat, id: uid() }
    setCategories(prev => [...prev, newCat])
  }

  function deleteGlobalCategory(id: string) {
    setCategories(prev => prev.filter(c => c.id !== id))
  }

  function updateGlobalCategory(id: string, patch: Partial<Omit<Category, 'id'>>) {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  // ── SHORT GOALS ────────────────────────────────────────────────────────────
  function addGoal(g: Omit<ShortGoal, 'id'>) {
    const newGoal = { ...g, id: uid() }
    setGoals(prev => [...prev, newGoal])
    if (userId) upsertShortGoal(userId, newGoal)
  }
  function updateGoal(id: string, patch: Partial<ShortGoal>) {
    let updatedGoal: ShortGoal | undefined
    setGoals(prev => prev.map(g => { if (g.id === id) { updatedGoal = { ...g, ...patch }; return updatedGoal } return g }))
    if (userId && updatedGoal) upsertShortGoal(userId, updatedGoal)
  }
  function deleteGoal(id: string) {
    setGoals(prev => prev.filter(g => g.id !== id))
    if (userId) deleteShortGoalSync(userId, id)
  }
  function toggleGoalTask(goalId: string, taskId: string) {
    let updatedGoal: ShortGoal | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      const tasks = g.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t)
      updatedGoal = { ...g, tasks }
      return updatedGoal
    }))
    // Embed the full goal (including updated tasks) so tasks sync reliably
    if (userId && updatedGoal) upsertShortGoal(userId, updatedGoal)
  }
  function addGoalTask(goalId: string, categoryId: string, text: string) {
    let updatedGoal: ShortGoal | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      // look in per-goal categories first, then global categories
      const category =
        g.categories.find((c: Category) => c.id === categoryId) ||
        categories.find(c => c.id === categoryId)
      if (!category) return g
      const newTask: Task = { id: uid(), text, done: false, category_id: categoryId, day_id: goalId, goal_id: goalId, category_name: category.name, category_color: category.color }
      updatedGoal = { ...g, tasks: [...g.tasks, newTask] }
      return updatedGoal
    }))
    // Embed the full goal so tasks sync reliably
    if (userId && updatedGoal) upsertShortGoal(userId, updatedGoal)
  }

  function deleteGoalTask(goalId: string, taskId: string) {
    let updatedGoal: ShortGoal | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      updatedGoal = { ...g, tasks: g.tasks.filter(t => t.id !== taskId) }
      return updatedGoal
    }))
    if (userId && updatedGoal) upsertShortGoal(userId, updatedGoal)
    if (userId) deleteTaskSync(userId, taskId)
  }

  function updateGoalTask(goalId: string, taskId: string, patch: Partial<Task>) {
    let updatedGoal: ShortGoal | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      const task = g.tasks.find(t => t.id === taskId)
      if (!task) return g
      const updated = { ...task, ...patch }
      updatedGoal = { ...g, tasks: g.tasks.map(t => t.id === taskId ? updated : t) }
      return updatedGoal
    }))
    // Embed the full goal so tasks sync reliably
    if (userId && updatedGoal) upsertShortGoal(userId, updatedGoal)
  }

  // ── GOAL NOTES ─────────────────────────────────────────────────────────────
  function addGoalNote(goalId: string, text: string) {
    const newNote: NoteEntry = { id: uid(), text: text.trim(), createdAt: new Date().toISOString() }
    let updatedGoal: ShortGoal | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      updatedGoal = { ...g, notes: [newNote, ...(g.notes ?? [])] }
      return updatedGoal
    }))
    if (userId && updatedGoal) upsertShortGoal(userId, updatedGoal)
  }

  function updateGoalNote(goalId: string, noteId: string, text: string) {
    let updatedGoal: ShortGoal | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      updatedGoal = { ...g, notes: (g.notes ?? []).map(n => n.id === noteId ? { ...n, text } : n) }
      return updatedGoal
    }))
    if (userId && updatedGoal) upsertShortGoal(userId, updatedGoal)
  }

  function deleteGoalNote(goalId: string, noteId: string) {
    let updatedGoal: ShortGoal | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      updatedGoal = { ...g, notes: (g.notes ?? []).filter(n => n.id !== noteId) }
      return updatedGoal
    }))
    if (userId && updatedGoal) upsertShortGoal(userId, updatedGoal)
  }

  // ── LONG GOALS ─────────────────────────────────────────────────────────────
  function addLongGoal(g: Omit<LongGoal, 'id'>) {
    const newGoal = { ...g, id: uid() }
    setLongGoals(prev => [...prev, newGoal])
    if (userId) upsertLongGoal(userId, newGoal)
  }
  function updateLongGoal(id: string, patch: Partial<LongGoal>) {
    let updatedGoal: LongGoal | undefined
    setLongGoals(prev => prev.map(g => { if (g.id === id) { updatedGoal = { ...g, ...patch }; return updatedGoal } return g }))
    if (userId && updatedGoal) upsertLongGoal(userId, updatedGoal)
  }
  function deleteLongGoal(id: string) {
    setLongGoals(prev => prev.filter(g => g.id !== id))
    if (userId) deleteLongGoalSync(userId, id)
  }

  // ── QUICK ADD ──────────────────────────────────────────────────────────────
  function quickAddTask(date: string, text: string) {
    const entry = getDay(date)
    const targetCat = categories[0] // use first global category
    if (targetCat) {
      const task: Task = { id: uid(), text, done: false, category_id: targetCat.id, day_id: entry.id, category_name: targetCat.name, category_color: targetCat.color }
      upsertDay({ ...entry, tasks: [...entry.tasks, task] })
      if (userId) upsertTask(userId, task, date)
    } else {
      // Fallback: create a default category on-the-fly
      const catId = uid()
      const newCat: Category = { id: catId, name: '할 일', color: 'purple' }
      setCategories(prev => [...prev, newCat])
      const task: Task = { id: uid(), text, done: false, category_id: catId, day_id: entry.id, category_name: newCat.name, category_color: newCat.color }
      upsertDay({ ...entry, tasks: [...entry.tasks, task] })
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
    setRoutines(prev => prev.map(r => { if (r.id === id) { updatedRoutine = { ...r, status }; return updatedRoutine } return r }))
    if (userId && updatedRoutine) upsertRoutine(userId, updatedRoutine)
  }
  function updateRoutineName(id: string, name: string) {
    let updatedRoutine: Routine | undefined
    setRoutines(prev => prev.map(r => { if (r.id === id) { updatedRoutine = { ...r, name }; return updatedRoutine } return r }))
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

  // ── TASK REORDER ───────────────────────────────────────────────────────────
  function reorderDayTasks(date: string, categoryId: string, draggedId: string, targetId: string) {
    let updatedEntry: DayEntry | undefined
    setDays(prev => {
      const d = prev.find(day => day.date === date)
      if (!d) return prev
      const catTasks = d.tasks.filter(t => t.category_id === categoryId)
      const rest = d.tasks.filter(t => t.category_id !== categoryId)
      const dragIdx = catTasks.findIndex(t => t.id === draggedId)
      const dropIdx = catTasks.findIndex(t => t.id === targetId)
      if (dragIdx < 0 || dropIdx < 0) return prev
      const reordered = [...catTasks]
      const [moved] = reordered.splice(dragIdx, 1)
      reordered.splice(dropIdx, 0, moved)
      updatedEntry = { ...d, tasks: [...rest, ...reordered] }
      return prev.map(day => day.date === date ? updatedEntry! : day)
    })
    if (userId && updatedEntry) upsertDayEntry(userId, updatedEntry)
  }

  function reorderGoalTasks(goalId: string, categoryId: string, draggedId: string, targetId: string) {
    let updatedGoal: ShortGoal | undefined
    setGoals(prev => {
      const g = prev.find(goal => goal.id === goalId)
      if (!g) return prev
      const catTasks = g.tasks.filter(t => t.category_id === categoryId)
      const rest = g.tasks.filter(t => t.category_id !== categoryId)
      const dragIdx = catTasks.findIndex(t => t.id === draggedId)
      const dropIdx = catTasks.findIndex(t => t.id === targetId)
      if (dragIdx < 0 || dropIdx < 0) return prev
      const reordered = [...catTasks]
      const [moved] = reordered.splice(dragIdx, 1)
      reordered.splice(dropIdx, 0, moved)
      updatedGoal = { ...g, tasks: [...rest, ...reordered] }
      return prev.map(goal => goal.id === goalId ? updatedGoal! : goal)
    })
    if (userId && updatedGoal) upsertShortGoal(userId, updatedGoal)
  }

  // ── GOAL TASK LINKING ──────────────────────────────────────────────────────
  // Link a short-goal task to a day so it appears in the day's category section
  function linkGoalTask(date: string, goalTaskId: string) {
    const entry = getDay(date)
    const linked = entry.meta.linkedGoalTaskIds ?? []
    if (linked.includes(goalTaskId)) return
    const updated = { ...entry, meta: { ...entry.meta, linkedGoalTaskIds: [...linked, goalTaskId] } }
    upsertDay(updated)
  }
  function unlinkGoalTask(date: string, goalTaskId: string) {
    const entry = getDay(date)
    const linked = (entry.meta.linkedGoalTaskIds ?? []).filter((id: string) => id !== goalTaskId)
    const updated = { ...entry, meta: { ...entry.meta, linkedGoalTaskIds: linked } }
    upsertDay(updated)
  }

  // ── WEEKLY REVIEW ──────────────────────────────────────────────────────────
  function getWeeklyReview(weekKey: string): string { return weeklyReviews[weekKey] || '' }
  function updateWeeklyReview(weekKey: string, content: string) {
    setWeeklyReviews(prev => ({ ...prev, [weekKey]: content }))
    if (userId) upsertWeeklyReview(userId, weekKey, content)
  }

  return {
    syncReady,
    days, goals, routines, logs, longGoals, weeklyReviews, categories,
    getDay, upsertDay, toggleTask, addTask, deleteTask, updateTask, updateNote, updateMeta,
    addDayNote, updateDayNote, deleteDayNote,
    addGoal, updateGoal, deleteGoal, toggleGoalTask, addGoalTask, deleteGoalTask, updateGoalTask,
    addGoalNote, updateGoalNote, deleteGoalNote,
    addLongGoal, updateLongGoal, deleteLongGoal,
    addGlobalCategory, deleteGlobalCategory, updateGlobalCategory,
    addRoutine, setRoutineStatus, updateRoutineName, deleteRoutine, toggleRoutineLog, isRoutineDone,
    quickAddTask,
    reorderDayTasks, reorderGoalTasks,
    linkGoalTask, unlinkGoalTask,
    getWeeklyReview, updateWeeklyReview,
  }
}
