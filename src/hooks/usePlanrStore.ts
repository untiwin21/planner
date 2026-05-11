'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import type { DayEntry, ShortGoal, Routine, RoutineLog, Category, Task, DayMeta, LongGoal, RoutineStatus, NoteEntry, JournalEntry, RoutinePeriod } from '@/types'
import { tasksProgress } from '@/lib/taskProgress'
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

function derivePeriod(time?: string): RoutinePeriod {
  if (!time) return 'anytime'
  const h = parseInt(time.split(':')[0], 10)
  if (h >= 5 && h < 12) return 'morning'
  if (h >= 12 && h < 18) return 'afternoon'
  return 'evening'
}

export function usePlanrStore(userId: string) {
  const [syncReady, setSyncReady] = useState(false)
  // Global pending-write counter: periodic sync is blocked while any Supabase write is in flight.
  // This eliminates the race condition where sync reads stale remote state before a local write lands.
  const pendingWrites = useRef(0)
  function trackWrite(promise: Promise<void>) {
    pendingWrites.current++
    promise.finally(() => { pendingWrites.current = Math.max(0, pendingWrites.current - 1) })
  }
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

        // ── Merge helpers (pure functions) ────────────────────────────────────
        function mergeDaysList(local: DayEntry[], remote: DayEntry[]): DayEntry[] {
          if (remote.length === 0) return local
          const localMap = new Map(local.map(d => [d.date, d]))
          const remoteDates = new Set(remote.map((d: DayEntry) => d.date))
          const merged = remote.map((rem: DayEntry) => {
            const loc = localMap.get(rem.date)
            if (!loc) return rem
            const remoteTaskIds = new Set(rem.tasks.map((t: Task) => t.id))
            const localOnlyTasks = loc.tasks.filter((t: Task) => !remoteTaskIds.has(t.id))
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
          const localOnly = local.filter(d => !remoteDates.has(d.date))
          return [...merged, ...localOnly]
        }

        function mergeGoalsList(local: ShortGoal[], remote: ShortGoal[]): ShortGoal[] {
          if (remote.length === 0) return local
          const localMap = new Map(local.map(g => [g.id, g]))
          const remoteIds = new Set(remote.map((g: ShortGoal) => g.id))
          const merged = remote.map((rem: ShortGoal) => {
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
          const localOnly = local.filter(g => !remoteIds.has(g.id))
          return [...merged, ...localOnly]
        }

        // ── Compute merged result using current local state ───────────────────
        // (days/goals are stable at effect-creation time = initial localStorage values)
        const mergedDays = mergeDaysList(days, remoteData.days)
        const mergedGoals = mergeGoalsList(goals, remoteData.goals)

        setDaysRaw(() => { save(STORAGE_KEYS.days, mergedDays); return mergedDays })
        setGoalsRaw(() => { save(STORAGE_KEYS.goals, mergedGoals); return mergedGoals })

        if (remoteData.routines.length > 0)  setRoutinesRaw(remoteData.routines)
        if (remoteData.logs.length > 0)      setLogsRaw(remoteData.logs)
        if (remoteData.longGoals.length > 0) setLongGoalsRaw(remoteData.longGoals)
        if (Object.keys(remoteData.weeklyReviews).length > 0) setWeeklyReviewsRaw(remoteData.weeklyReviews)

        // ── Restore categories on new/other devices ─────────────────────────
        // Try loading from Supabase first (synced via __categories__ key),
        // then fall back to reconstructing from task data.
        const localCats = load<Category[]>(STORAGE_KEYS.categories, [])
        const remoteCatsJson = remoteData.weeklyReviews['__categories__']
        if (remoteCatsJson) {
          try {
            const remoteCats: Category[] = JSON.parse(remoteCatsJson)
            if (remoteCats.length > 0) {
              // Merge: keep all remote categories, add any local-only ones
              const remoteCatIds = new Set(remoteCats.map(c => c.id))
              const localOnly = localCats.filter(c => !remoteCatIds.has(c.id))
              const merged = [...remoteCats, ...localOnly]
              setCategoriesRaw(() => { save(STORAGE_KEYS.categories, merged); return merged })
            }
          } catch { /* ignore parse errors */ }
        } else if (localCats.length === 0) {
          // Fallback: reconstruct from task data
          const catMap = new Map<string, Category>()
          for (const day of mergedDays) {
            for (const task of day.tasks) {
              if (task.category_id !== SCHEDULE_CAT_ID && task.category_id !== DEADLINE_CAT_ID && !catMap.has(task.category_id)) {
                catMap.set(task.category_id, { id: task.category_id, name: task.category_name, color: task.category_color })
              }
            }
          }
          for (const goal of mergedGoals) {
            for (const task of goal.tasks) {
              if (task.category_id !== SCHEDULE_CAT_ID && task.category_id !== DEADLINE_CAT_ID && !catMap.has(task.category_id)) {
                catMap.set(task.category_id, { id: task.category_id, name: task.category_name, color: task.category_color })
              }
            }
          }
          if (catMap.size > 0) {
            const derived = Array.from(catMap.values())
            setCategoriesRaw(() => { save(STORAGE_KEYS.categories, derived); return derived })
          }
        }

        // ── One-time backfill: re-push ALL data in new embedded format ────────
        // Existing Supabase rows have no meta._tasks / short_goals.tasks yet.
        // This runs once per device, migrating all local tasks into the parent records.
        const BACKFILL_KEY = 'planr_backfill_v1'
        if (!localStorage.getItem(BACKFILL_KEY)) {
          console.log('[Planr] 백필 동기화 시작...')
          await Promise.all([
            ...mergedDays.map(d => upsertDayEntry(userId, d)),
            ...mergedGoals.map(g => upsertShortGoal(userId, g)),
          ])
          localStorage.setItem(BACKFILL_KEY, '1')
          console.log('[Planr] 백필 동기화 완료.')
        }

        save(STORAGE_KEYS.lastSync, new Date().toISOString())
      } catch (e) {
        console.error('Sync failed, falling back to local data', e)
      } finally {
        setSyncReady(true)
      }
    }
    sync()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // ── Periodic sync (every 30s) for cross-device updates ─────────────────────
  useEffect(() => {
    if (!userId) return
    const interval = setInterval(async () => {
      try {
        // Skip sync while any Supabase write is still in flight
        if (pendingWrites.current > 0) return
        const remoteData = await fetchAll(userId)
        if (remoteData.days.length > 0) {
          setDaysRaw(prev => {
            const localMap = new Map(prev.map(d => [d.date, d]))
            const remoteMap = new Map(remoteData.days.map((d: DayEntry) => [d.date, d]))
            // Merge: remote wins for task done states
            const merged = prev.map(d => {
              const remote = remoteMap.get(d.date)
              if (!remote) return d
              // Merge tasks: update done/subtask states from remote
              const remoteTasks = new Map(remote.tasks.map((t: Task) => [t.id, t]))
              const mergedTasks = d.tasks.map(t => {
                const rt = remoteTasks.get(t.id)
                if (!rt) return t
                return { ...t, done: rt.done, subtasks: rt.subtasks }
              })
              // Add remote-only tasks
              const localTaskIds = new Set(d.tasks.map(t => t.id))
              const remoteOnlyTasks = remote.tasks.filter((t: Task) => !localTaskIds.has(t.id))
              return { ...d, tasks: [...mergedTasks, ...remoteOnlyTasks], meta: { ...d.meta, ...remote.meta } }
            })
            // Add remote-only days
            const localDates = new Set(prev.map(d => d.date))
            const remoteOnlyDays = remoteData.days.filter((d: DayEntry) => !localDates.has(d.date))
            const result = [...merged, ...remoteOnlyDays]
            save(STORAGE_KEYS.days, result)
            return result
          })
        }
        // Sync goal task states
        if (remoteData.goals.length > 0) {
          setGoalsRaw(prev => {
            const remoteGoalMap = new Map(remoteData.goals.map((g: ShortGoal) => [g.id, g]))
            const merged = prev.map(g => {
              const rg = remoteGoalMap.get(g.id)
              if (!rg) return g
              const remoteTaskMap = new Map(rg.tasks.map((t: Task) => [t.id, t]))
              const mergedTasks = g.tasks.map(t => {
                const rt = remoteTaskMap.get(t.id)
                if (!rt) return t
                return { ...t, done: rt.done, subtasks: rt.subtasks }
              })
              const localTaskIds = new Set(g.tasks.map(t => t.id))
              const remoteOnlyTasks = rg.tasks.filter((t: Task) => !localTaskIds.has(t.id))
              return { ...g, tasks: [...mergedTasks, ...remoteOnlyTasks] }
            })
            const localIds = new Set(prev.map(g => g.id))
            const remoteOnlyGoals = remoteData.goals.filter((g: ShortGoal) => !localIds.has(g.id))
            const result = [...merged, ...remoteOnlyGoals]
            save(STORAGE_KEYS.goals, result)
            return result
          })
        }
        // Sync routine logs
        if (remoteData.logs.length > 0) {
          setLogsRaw(prev => {
            const key = (l: RoutineLog) => `${l.routine_id}_${l.date}`
            const localMap = new Map(prev.map(l => [key(l), l]))
            for (const rl of remoteData.logs) {
              const k = key(rl)
              localMap.set(k, rl) // remote wins
            }
            const result = Array.from(localMap.values())
            save(STORAGE_KEYS.logs, result)
            return result
          })
        }
      } catch (e) {
        // Silent fail for periodic sync
      }
    }, 30000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setCategoriesRaw(prev => {
      const next = typeof v === 'function' ? v(prev) : v
      save(STORAGE_KEYS.categories, next)
      // Sync categories to Supabase via special weekly_review key
      if (userId) trackWrite(upsertWeeklyReview(userId, '__categories__', JSON.stringify(next)))
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

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
    if (userId) trackWrite(upsertDayEntry(userId, entry))
  }

  function toggleTask(date: string, taskId: string) {
    const entry = getDay(date)
    const task = entry.tasks.find(t => t.id === taskId)
    if (task) {
      const updatedTask = { ...task, done: !task.done }
      upsertDay({ ...entry, tasks: entry.tasks.map(t => t.id === taskId ? updatedTask : t) })
      if (userId) trackWrite(upsertTask(userId, updatedTask, date))
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
    if (userId) trackWrite(upsertTask(userId, task, date))
  }

  function deleteTask(date: string, taskId: string) {
    const entry = getDay(date)
    upsertDay({ ...entry, tasks: entry.tasks.filter(t => t.id !== taskId) })
    if (userId) trackWrite(deleteTaskSync(userId, taskId))
  }

  function updateTask(date: string, taskId: string, patch: Partial<Task>) {
    const entry = getDay(date)
    const task = entry.tasks.find(t => t.id === taskId)
    if (!task) return
    const updated = { ...task, ...patch }
    upsertDay({ ...entry, tasks: entry.tasks.map(t => t.id === taskId ? updated : t) })
    if (userId) trackWrite(upsertTask(userId, updated, date))
  }

  function updateNote(date: string, note: string) {
    const updatedEntry = { ...getDay(date), note }
    upsertDay(updatedEntry)
    if (userId) trackWrite(upsertDayEntry(userId, updatedEntry))
  }

  function updateMeta(date: string, patch: Partial<DayMeta>) {
    const entry = getDay(date)
    const updatedEntry = { ...entry, meta: { ...entry.meta, ...patch } }
    upsertDay(updatedEntry)
    if (userId) trackWrite(upsertDayEntry(userId, updatedEntry))
  }

  // ── DAY NOTES (journal) ───────────────────────────────────────────────────
  function addDayNote(date: string, title: string, body: string) {
    const entry = getDay(date)
    const note: JournalEntry = { id: uid(), title, body, createdAt: new Date().toISOString() }
    const updatedEntry = { ...entry, meta: { ...entry.meta, notes: [note, ...(entry.meta.notes ?? [])] } }
    upsertDay(updatedEntry)
    if (userId) trackWrite(upsertDayEntry(userId, updatedEntry))
  }

  function updateDayNote(date: string, noteId: string, title: string, body: string) {
    const entry = getDay(date)
    const notes = (entry.meta.notes ?? []).map(n => n.id === noteId ? { ...n, title, body } : n)
    const updatedEntry = { ...entry, meta: { ...entry.meta, notes } }
    upsertDay(updatedEntry)
    if (userId) trackWrite(upsertDayEntry(userId, updatedEntry))
  }

  function deleteDayNote(date: string, noteId: string) {
    const entry = getDay(date)
    const notes = (entry.meta.notes ?? []).filter(n => n.id !== noteId)
    const updatedEntry = { ...entry, meta: { ...entry.meta, notes } }
    upsertDay(updatedEntry)
    if (userId) trackWrite(upsertDayEntry(userId, updatedEntry))
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

  function reorderCategory(draggedId: string, targetId: string) {
    setCategories(prev => {
      const dragIdx = prev.findIndex(c => c.id === draggedId)
      const dropIdx = prev.findIndex(c => c.id === targetId)
      if (dragIdx < 0 || dropIdx < 0) return prev
      const reordered = [...prev]
      const [moved] = reordered.splice(dragIdx, 1)
      reordered.splice(dropIdx, 0, moved)
      return reordered
    })
  }

  // ── SHORT GOALS ────────────────────────────────────────────────────────────
  function addGoal(g: Omit<ShortGoal, 'id'>) {
    const newGoal = { ...g, id: uid() }
    setGoals(prev => [...prev, newGoal])
    if (userId) trackWrite(upsertShortGoal(userId, newGoal))
  }
  function updateGoal(id: string, patch: Partial<ShortGoal>) {
    let updatedGoal: ShortGoal | undefined
    setGoals(prev => prev.map(g => { if (g.id === id) { updatedGoal = { ...g, ...patch }; return updatedGoal } return g }))
    if (userId && updatedGoal) trackWrite(upsertShortGoal(userId, updatedGoal))
  }
  function deleteGoal(id: string) {
    setGoals(prev => prev.filter(g => g.id !== id))
    if (userId) trackWrite(deleteShortGoalSync(userId, id))
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
    if (userId && updatedGoal) trackWrite(upsertShortGoal(userId, updatedGoal))
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
    if (userId && updatedGoal) trackWrite(upsertShortGoal(userId, updatedGoal))
  }

  function deleteGoalTask(goalId: string, taskId: string) {
    let updatedGoal: ShortGoal | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      updatedGoal = { ...g, tasks: g.tasks.filter(t => t.id !== taskId) }
      return updatedGoal
    }))
    if (userId && updatedGoal) trackWrite(upsertShortGoal(userId, updatedGoal))
    if (userId) trackWrite(deleteTaskSync(userId, taskId))
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
    if (userId && updatedGoal) trackWrite(upsertShortGoal(userId, updatedGoal))
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
    if (userId && updatedGoal) trackWrite(upsertShortGoal(userId, updatedGoal))
  }

  function updateGoalNote(goalId: string, noteId: string, text: string) {
    let updatedGoal: ShortGoal | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      updatedGoal = { ...g, notes: (g.notes ?? []).map(n => n.id === noteId ? { ...n, text } : n) }
      return updatedGoal
    }))
    if (userId && updatedGoal) trackWrite(upsertShortGoal(userId, updatedGoal))
  }

  function deleteGoalNote(goalId: string, noteId: string) {
    let updatedGoal: ShortGoal | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      updatedGoal = { ...g, notes: (g.notes ?? []).filter(n => n.id !== noteId) }
      return updatedGoal
    }))
    if (userId && updatedGoal) trackWrite(upsertShortGoal(userId, updatedGoal))
  }

  // ── LONG GOALS ─────────────────────────────────────────────────────────────
  function addLongGoal(g: Omit<LongGoal, 'id'>) {
    const newGoal = { ...g, id: uid() }
    setLongGoals(prev => [...prev, newGoal])
    if (userId) trackWrite(upsertLongGoal(userId, newGoal))
  }
  function updateLongGoal(id: string, patch: Partial<LongGoal>) {
    let updatedGoal: LongGoal | undefined
    setLongGoals(prev => prev.map(g => { if (g.id === id) { updatedGoal = { ...g, ...patch }; return updatedGoal } return g }))
    if (userId && updatedGoal) trackWrite(upsertLongGoal(userId, updatedGoal))
  }
  function deleteLongGoal(id: string) {
    setLongGoals(prev => prev.filter(g => g.id !== id))
    if (userId) trackWrite(deleteLongGoalSync(userId, id))
  }

  // ── QUICK ADD ──────────────────────────────────────────────────────────────
  function quickAddTask(date: string, text: string) {
    const entry = getDay(date)
    const targetCat = categories[0] // use first global category
    if (targetCat) {
      const task: Task = { id: uid(), text, done: false, category_id: targetCat.id, day_id: entry.id, category_name: targetCat.name, category_color: targetCat.color }
      upsertDay({ ...entry, tasks: [...entry.tasks, task] })
      if (userId) trackWrite(upsertTask(userId, task, date))
    } else {
      // Fallback: create a default category on-the-fly
      const catId = uid()
      const newCat: Category = { id: catId, name: '할 일', color: 'purple' }
      setCategories(prev => [...prev, newCat])
      const task: Task = { id: uid(), text, done: false, category_id: catId, day_id: entry.id, category_name: newCat.name, category_color: newCat.color }
      upsertDay({ ...entry, tasks: [...entry.tasks, task] })
      if (userId) trackWrite(upsertTask(userId, task, date))
    }
  }

  // ── ROUTINES ───────────────────────────────────────────────────────────────
  function addRoutine(name: string, time?: string, period?: RoutinePeriod) {
    const derivedPeriod = period ?? derivePeriod(time)
    const newRoutine: Routine = { id: uid(), name, status: 'active' as RoutineStatus, created_at: formatDate(new Date()), time, order: 0, period: derivedPeriod }
    setRoutines(prev => [...prev, newRoutine])
    if (userId) trackWrite(upsertRoutine(userId, newRoutine))
  }
  function setRoutineStatus(id: string, status: RoutineStatus) {
    let updatedRoutine: Routine | undefined
    setRoutines(prev => prev.map(r => { if (r.id === id) { updatedRoutine = { ...r, status }; return updatedRoutine } return r }))
    if (userId && updatedRoutine) trackWrite(upsertRoutine(userId, updatedRoutine))
  }
  function updateRoutineName(id: string, name: string) {
    let updatedRoutine: Routine | undefined
    setRoutines(prev => prev.map(r => { if (r.id === id) { updatedRoutine = { ...r, name }; return updatedRoutine } return r }))
    if (userId && updatedRoutine) trackWrite(upsertRoutine(userId, updatedRoutine))
  }
  function updateRoutine(id: string, patch: Partial<Omit<Routine, 'id'>>) {
    if (patch.time !== undefined && !patch.period) {
      patch = { ...patch, period: derivePeriod(patch.time) }
    }
    let updatedRoutine: Routine | undefined
    setRoutines(prev => prev.map(r => { if (r.id === id) { updatedRoutine = { ...r, ...patch }; return updatedRoutine } return r }))
    if (userId && updatedRoutine) trackWrite(upsertRoutine(userId, updatedRoutine))
  }
  function reorderRoutine(id: string, direction: 'up' | 'down') {
    setRoutines(prev => {
      const routine = prev.find(r => r.id === id)
      if (!routine) return prev
      const period = routine.period ?? 'anytime'
      const inPeriod = prev.filter(r => (r.period ?? 'anytime') === period).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      const idx = inPeriod.findIndex(r => r.id === id)
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= inPeriod.length) return prev
      const reordered = [...inPeriod]
      ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]
      const orderMap = new Map<string, number>()
      reordered.forEach((r, i) => orderMap.set(r.id, i))
      const next = prev.map(r => orderMap.has(r.id) ? { ...r, order: orderMap.get(r.id)! } : r)
      next.filter(r => orderMap.has(r.id)).forEach(r => { if (userId) trackWrite(upsertRoutine(userId, r)) })
      return next
    })
  }
  function deleteRoutine(id: string) {
    setRoutines(prev => prev.filter(r => r.id !== id))
    setLogs(prev => prev.filter(l => l.routine_id !== id))
    if (userId) trackWrite(deleteRoutineSync(userId, id))
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
    if (userId && updatedLog) trackWrite(upsertRoutineLog(userId, updatedLog))
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
    if (userId && updatedEntry) trackWrite(upsertDayEntry(userId, updatedEntry))
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
    if (userId && updatedGoal) trackWrite(upsertShortGoal(userId, updatedGoal))
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

  // ── SUBTASK LINKING ───────────────────────────────────────────────────────
  function linkGoalSubtask(date: string, subtaskId: string) {
    const entry = getDay(date)
    const linked = entry.meta.linkedGoalSubtaskIds ?? []
    if (linked.includes(subtaskId)) return
    const updated = { ...entry, meta: { ...entry.meta, linkedGoalSubtaskIds: [...linked, subtaskId] } }
    upsertDay(updated)
  }
  function unlinkGoalSubtask(date: string, subtaskId: string) {
    const entry = getDay(date)
    const linked = (entry.meta.linkedGoalSubtaskIds ?? []).filter((id: string) => id !== subtaskId)
    const updated = { ...entry, meta: { ...entry.meta, linkedGoalSubtaskIds: linked } }
    upsertDay(updated)
  }
  function toggleGoalSubtask(goalId: string, taskId: string, subtaskId: string) {
    let updatedGoal: ShortGoal | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      const tasks = g.tasks.map(t => {
        if (t.id !== taskId) return t
        const subtasks = (t.subtasks ?? []).map(s => s.id === subtaskId ? { ...s, done: !s.done } : s)
        return { ...t, subtasks }
      })
      updatedGoal = { ...g, tasks }
      return updatedGoal
    }))
    if (userId && updatedGoal) trackWrite(upsertShortGoal(userId, updatedGoal))
  }

  // ── LONG GOAL PROGRESS ─────────────────────────────────────────────────────
  function getLongGoalProgress(longGoalId: string): { done: number; total: number; pct: number } {
    const linked = goals.filter(g => g.long_goal_id === longGoalId)
    let total = 0, done = 0
    for (const g of linked) {
      const p = tasksProgress(g.tasks)
      total += p.total
      done += p.done
    }
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
  }

  // ── WEEKLY REVIEW ──────────────────────────────────────────────────────────
  function getWeeklyReview(weekKey: string): string { return weeklyReviews[weekKey] || '' }
  function updateWeeklyReview(weekKey: string, content: string) {
    setWeeklyReviews(prev => ({ ...prev, [weekKey]: content }))
    if (userId) trackWrite(upsertWeeklyReview(userId, weekKey, content))
  }

  return {
    syncReady,
    days, goals, routines, logs, longGoals, weeklyReviews, categories,
    getDay, upsertDay, toggleTask, addTask, deleteTask, updateTask, updateNote, updateMeta,
    addDayNote, updateDayNote, deleteDayNote,
    addGoal, updateGoal, deleteGoal, toggleGoalTask, addGoalTask, deleteGoalTask, updateGoalTask,
    addGoalNote, updateGoalNote, deleteGoalNote,
    addLongGoal, updateLongGoal, deleteLongGoal,
    addGlobalCategory, deleteGlobalCategory, updateGlobalCategory, reorderCategory,
    addRoutine, setRoutineStatus, updateRoutineName, updateRoutine, reorderRoutine, deleteRoutine, toggleRoutineLog, isRoutineDone,
    quickAddTask,
    reorderDayTasks, reorderGoalTasks,
    linkGoalTask, unlinkGoalTask,
    linkGoalSubtask, unlinkGoalSubtask, toggleGoalSubtask,
    getLongGoalProgress,
    getWeeklyReview, updateWeeklyReview,
  }
}
