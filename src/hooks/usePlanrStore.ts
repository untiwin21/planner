'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import type { DayEntry, ShortGoal, Routine, RoutineLog, Category, Task, DayMeta, LongGoal, RoutineStatus, NoteEntry, JournalEntry, RoutinePeriod, TaskScheduleInput } from '@/types'
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
  dirtyGoals: 'planr_dirty_goals',
  dirtyDays: 'planr_dirty_days',
  categoriesUpdatedAt: 'planr_categories_updated_at',
  dirtyCategories: 'planr_dirty_categories',
  dirtyRoutines: 'planr_dirty_routines',
  dirtyRoutineLogs: 'planr_dirty_routine_logs',
  dirtyLongGoals: 'planr_dirty_long_goals',
  dirtyWeeklyReviews: 'planr_dirty_weekly_reviews',
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
function now() { return Date.now() }

const DEFAULT_META: DayMeta = { sleep: null, condition: null, focus: null, top3: [], notes: [] }
const DEADLINE_CATEGORY: Category = { id: DEADLINE_CAT_ID, name: '데드라인', color: 'red' }
const SCHEDULE_CATEGORY: Category = { id: SCHEDULE_CAT_ID, name: '일정', color: 'blue' }
const DEFAULT_CATEGORY: Category = { id: 'general', name: '일반', color: 'purple' }

interface CategorySnapshot {
  items: Category[]
  updated_at: number
}

function parseCategorySnapshot(raw?: string): CategorySnapshot | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    // Backwards compatibility with the old bare Category[] payload.
    if (Array.isArray(parsed)) return { items: parsed, updated_at: 0 }
    if (Array.isArray(parsed?.items)) {
      return { items: parsed.items, updated_at: Number(parsed.updated_at) || 0 }
    }
  } catch { /* ignore malformed legacy data */ }
  return null
}

function serializeCategories(items: Category[], updatedAt: number): string {
  return JSON.stringify({ items, updated_at: updatedAt } satisfies CategorySnapshot)
}

function derivePeriod(time?: string): RoutinePeriod {
  if (!time) return 'anytime'
  const h = parseInt(time.split(':')[0], 10)
  if (h >= 5 && h < 12) return 'morning'
  if (h >= 12 && h < 18) return 'afternoon'
  return 'evening'
}

// ── LWW merge primitives ─────────────────────────────────────────────────────
// Tasks and tombstones: union by id, newer updated_at wins. Tie → remote.
function mergeTasksLWW(local: Task[], remote: Task[]): Task[] {
  const map = new Map<string, Task>()
  for (const lt of local) map.set(lt.id, lt)
  for (const rt of remote) {
    const lt = map.get(rt.id)
    if (!lt) { map.set(rt.id, rt); continue }
    const lTime = lt.updated_at ?? 0
    const rTime = rt.updated_at ?? 0
    if (rTime >= lTime) map.set(rt.id, rt)
  }
  return Array.from(map.values())
}

// Goal-level merge: tasks merged independently by LWW; other fields take whichever
// goal has the newer updated_at. Notes inside `notes` ride with the goal-level timestamp
// (acceptable since they are short and rarely conflict).
function mergeGoal(loc: ShortGoal, rem: ShortGoal): ShortGoal {
  const records = mergeTasksLWW(
    [...(loc.tasks ?? []), ...(loc.task_tombstones ?? [])],
    [...(rem.tasks ?? []), ...(rem.task_tombstones ?? [])],
  )
  const tasks = records.filter(task => !task.deleted_at)
  const taskTombstones = records.filter(task => !!task.deleted_at)
  const lTime = loc.updated_at ?? 0
  const rTime = rem.updated_at ?? 0
  const base = rTime >= lTime ? rem : loc
  return { ...base, tasks, task_tombstones: taskTombstones }
}

function mergeDay(loc: DayEntry, rem: DayEntry): DayEntry {
  const records = mergeTasksLWW(
    [...(loc.tasks ?? []), ...(loc.task_tombstones ?? [])],
    [...(rem.tasks ?? []), ...(rem.task_tombstones ?? [])],
  )
  const tasks = records.filter(task => !task.deleted_at)
  const taskTombstones = records.filter(task => !!task.deleted_at)
  const lTime = loc.meta?.updated_at ?? 0
  const rTime = rem.meta?.updated_at ?? 0
  const baseMeta = rTime >= lTime ? rem.meta : loc.meta
  const baseEntry = rTime >= lTime ? rem : loc
  return { ...baseEntry, meta: baseMeta, tasks, task_tombstones: taskTombstones }
}

function daySyncSignature(entry: DayEntry): string {
  return JSON.stringify({
    id: entry.id,
    date: entry.date,
    note: entry.note,
    meta: entry.meta,
    tasks: entry.tasks,
    task_tombstones: entry.task_tombstones ?? [],
  })
}

function goalSyncSignature(goal: ShortGoal): string {
  return JSON.stringify({
    ...goal,
    task_tombstones: goal.task_tombstones ?? [],
  })
}

export function usePlanrStore(userId: string) {
  const [syncReady, setSyncReady] = useState(false)
  // Pending-write counter: blocks periodic sync while any Supabase write is in flight.
  const pendingWrites = useRef(0)
  // Per-entity dirty tracking: protects entities being deleted (where merge has no way to
  // distinguish "deleted locally, write in-flight" from "exists remotely, should re-add").
  // Persisted so dirty state survives reload (offline edit → reload → still protected).
  const dirtyGoalIds = useRef<Set<string>>(new Set(load<string[]>(STORAGE_KEYS.dirtyGoals, [])))
  const dirtyDayDates = useRef<Set<string>>(new Set(load<string[]>(STORAGE_KEYS.dirtyDays, [])))
  const dirtyRoutineIds = useRef<Set<string>>(new Set(load<string[]>(STORAGE_KEYS.dirtyRoutines, [])))
  const dirtyRoutineLogKeys = useRef<Set<string>>(new Set(load<string[]>(STORAGE_KEYS.dirtyRoutineLogs, [])))
  const dirtyLongGoalIds = useRef<Set<string>>(new Set(load<string[]>(STORAGE_KEYS.dirtyLongGoals, [])))
  const dirtyWeeklyReviewKeys = useRef<Set<string>>(new Set(load<string[]>(STORAGE_KEYS.dirtyWeeklyReviews, [])))
  const writeVersions = useRef<Map<string, number>>(new Map())
  const keyedPendingWrites = useRef<Map<string, number>>(new Map())
  const categoriesUpdatedAt = useRef(load<number>(STORAGE_KEYS.categoriesUpdatedAt, 0))
  const categoriesDirty = useRef(load<boolean>(STORAGE_KEYS.dirtyCategories, false))
  function persistDirtyGoals() { save(STORAGE_KEYS.dirtyGoals, Array.from(dirtyGoalIds.current)) }
  function persistDirtyDays() { save(STORAGE_KEYS.dirtyDays, Array.from(dirtyDayDates.current)) }
  function persistDirtyRoutines() { save(STORAGE_KEYS.dirtyRoutines, Array.from(dirtyRoutineIds.current)) }
  function persistDirtyRoutineLogs() { save(STORAGE_KEYS.dirtyRoutineLogs, Array.from(dirtyRoutineLogKeys.current)) }
  function persistDirtyLongGoals() { save(STORAGE_KEYS.dirtyLongGoals, Array.from(dirtyLongGoalIds.current)) }
  function persistDirtyWeeklyReviews() { save(STORAGE_KEYS.dirtyWeeklyReviews, Array.from(dirtyWeeklyReviewKeys.current)) }
  function markGoalDirty(id: string) { dirtyGoalIds.current.add(id); persistDirtyGoals() }
  function markDayDirty(date: string) { dirtyDayDates.current.add(date); persistDirtyDays() }
  function clearGoalDirty(id: string) { dirtyGoalIds.current.delete(id); persistDirtyGoals() }
  function clearDayDirty(date: string) { dirtyDayDates.current.delete(date); persistDirtyDays() }
  function markRoutineDirty(id: string) { dirtyRoutineIds.current.add(id); persistDirtyRoutines() }
  function clearRoutineDirty(id: string) { dirtyRoutineIds.current.delete(id); persistDirtyRoutines() }
  function routineLogKey(log: Pick<RoutineLog, 'routine_id' | 'date'>) { return `${log.routine_id}_${log.date}` }
  function markRoutineLogDirty(key: string) { dirtyRoutineLogKeys.current.add(key); persistDirtyRoutineLogs() }
  function clearRoutineLogDirty(key: string) { dirtyRoutineLogKeys.current.delete(key); persistDirtyRoutineLogs() }
  function markLongGoalDirty(id: string) { dirtyLongGoalIds.current.add(id); persistDirtyLongGoals() }
  function clearLongGoalDirty(id: string) { dirtyLongGoalIds.current.delete(id); persistDirtyLongGoals() }
  function markWeeklyReviewDirty(key: string) { dirtyWeeklyReviewKeys.current.add(key); persistDirtyWeeklyReviews() }
  function clearWeeklyReviewDirty(key: string) { dirtyWeeklyReviewKeys.current.delete(key); persistDirtyWeeklyReviews() }
  function trackWrite(promise: Promise<void>, onSuccess?: () => void, writeKey?: string) {
    const version = writeKey ? (writeVersions.current.get(writeKey) ?? 0) + 1 : 0
    if (writeKey) {
      writeVersions.current.set(writeKey, version)
      keyedPendingWrites.current.set(writeKey, (keyedPendingWrites.current.get(writeKey) ?? 0) + 1)
    }
    pendingWrites.current++
    let succeeded = false
    promise.then(
      () => { succeeded = true },
      (err) => { console.warn('[Planr] Supabase write failed, keeping dirty:', err) },
    ).finally(() => {
      pendingWrites.current = Math.max(0, pendingWrites.current - 1)
      if (!writeKey) {
        if (succeeded) onSuccess?.()
        return
      }
      const remaining = Math.max(0, (keyedPendingWrites.current.get(writeKey) ?? 1) - 1)
      if (remaining === 0) keyedPendingWrites.current.delete(writeKey)
      else keyedPendingWrites.current.set(writeKey, remaining)
      // Clear a dirty flag only after the newest write for this entity is the
      // last one to settle. Out-of-order requests otherwise leave stale server data.
      if (succeeded && remaining === 0 && writeVersions.current.get(writeKey) === version) onSuccess?.()
    })
  }
  const [days, setDaysRaw] = useState<DayEntry[]>(() => load(STORAGE_KEYS.days, []))
  const [goals, setGoalsRaw] = useState<ShortGoal[]>(() => load(STORAGE_KEYS.goals, []))
  const [routines, setRoutinesRaw] = useState<Routine[]>(() => load(STORAGE_KEYS.routines, []))
  const [logs, setLogsRaw] = useState<RoutineLog[]>(() => load(STORAGE_KEYS.logs, []))
  const [longGoals, setLongGoalsRaw] = useState<LongGoal[]>(() => load(STORAGE_KEYS.longGoals, []))
  const [weeklyReviews, setWeeklyReviewsRaw] = useState<Record<string, string>>(() => load(STORAGE_KEYS.weeklyReviews, {}))
  const [categories, setCategoriesRaw] = useState<Category[]>(() => {
    const cached = load<Category[]>(STORAGE_KEYS.categories, [])
    return cached.length > 0 ? cached : [DEFAULT_CATEGORY]
  })

  // Refs that mirror state — used by sync/retry logic that runs outside render cycles
  // and needs the latest committed state without going through a setState callback.
  const daysRef = useRef(days)
  const goalsRef = useRef(goals)
  const categoriesRef = useRef(categories)
  const routinesRef = useRef(routines)
  const logsRef = useRef(logs)
  const longGoalsRef = useRef(longGoals)
  const weeklyReviewsRef = useRef(weeklyReviews)
  daysRef.current = days
  goalsRef.current = goals
  categoriesRef.current = categories
  routinesRef.current = routines
  logsRef.current = logs
  longGoalsRef.current = longGoals
  weeklyReviewsRef.current = weeklyReviews

  function retryAuxiliaryWrites() {
    if (!userId) return
    for (const id of Array.from(dirtyRoutineIds.current)) {
      const routine = routinesRef.current.find(item => item.id === id)
      const request = routine ? upsertRoutine(userId, routine) : deleteRoutineSync(userId, id)
      trackWrite(request, () => clearRoutineDirty(id), `routine:${id}`)
    }
    for (const key of Array.from(dirtyRoutineLogKeys.current)) {
      const log = logsRef.current.find(item => routineLogKey(item) === key)
      if (log) trackWrite(upsertRoutineLog(userId, log), () => clearRoutineLogDirty(key), `routine-log:${key}`)
      else clearRoutineLogDirty(key)
    }
    for (const id of Array.from(dirtyLongGoalIds.current)) {
      const goal = longGoalsRef.current.find(item => item.id === id)
      const request = goal ? upsertLongGoal(userId, goal) : deleteLongGoalSync(userId, id)
      trackWrite(request, () => clearLongGoalDirty(id), `long-goal:${id}`)
    }
    for (const key of Array.from(dirtyWeeklyReviewKeys.current)) {
      const content = weeklyReviewsRef.current[key]
      if (content !== undefined) trackWrite(upsertWeeklyReview(userId, key, content), () => clearWeeklyReviewDirty(key), `weekly:${key}`)
      else clearWeeklyReviewDirty(key)
    }
  }

  function persistCategorySnapshot(items: Category[], updatedAt: number) {
    save(STORAGE_KEYS.categories, items)
    save(STORAGE_KEYS.categoriesUpdatedAt, updatedAt)
    categoriesUpdatedAt.current = updatedAt
  }

  function pushCategories(items: Category[], updatedAt: number) {
    if (!userId) return
    categoriesDirty.current = true
    save(STORAGE_KEYS.dirtyCategories, true)
    trackWrite(
      upsertWeeklyReview(userId, '__categories__', serializeCategories(items, updatedAt)),
      () => {
        // An older request may finish after a newer edit. Only the latest
        // successful snapshot is allowed to clear the retry flag.
        if (categoriesUpdatedAt.current === updatedAt) {
          categoriesDirty.current = false
          save(STORAGE_KEYS.dirtyCategories, false)
        }
      },
      'categories',
    )
  }

  useEffect(() => {
    if (!userId) { setSyncReady(true); return }
    async function sync() {
      try {
        try {
          const { supabase: sb } = await import('@/lib/supabase')
          if (sb) {
            const db = sb as any
            const { error: testErr } = await db.from('short_goals').select('tasks').limit(1)
            if (testErr && (testErr.code === '42703' || testErr.message?.includes('column'))) {
              console.error('[Planr] ❌ short_goals.tasks 컬럼이 없습니다!')
            }
          }
        } catch { /* ignore */ }

        const remoteData = await fetchAll(userId)

        // ── Days merge: LWW per-task, dirty days keep local entirely ──────────
        function mergeDaysList(local: DayEntry[], remote: DayEntry[]): DayEntry[] {
          const localMap = new Map(local.map(d => [d.date, d]))
          const remoteMap = new Map(remote.map(d => [d.date, d]))
          const allDates = new Set<string>([...localMap.keys(), ...remoteMap.keys()])
          const result: DayEntry[] = []
          for (const date of allDates) {
            const loc = localMap.get(date)
            const rem = remoteMap.get(date)
            if (!loc) { result.push(rem!); continue }
            if (!rem) { result.push(loc); continue }
            if (dirtyDayDates.current.has(date)) { result.push(loc); continue }
            result.push(mergeDay(loc, rem))
          }
          return result
        }

        // ── Goals merge: LWW per-task, dirty goals keep local entirely ───────
        function mergeGoalsList(local: ShortGoal[], remote: ShortGoal[]): ShortGoal[] {
          const localMap = new Map(local.map(g => [g.id, g]))
          const remoteMap = new Map(remote.map(g => [g.id, g]))
          const allIds = new Set<string>([...localMap.keys(), ...remoteMap.keys()])
          const result: ShortGoal[] = []
          for (const id of allIds) {
            const loc = localMap.get(id)
            const rem = remoteMap.get(id)
            if (!loc) { result.push(rem!); continue }
            if (!rem) { result.push(loc); continue }
            if (dirtyGoalIds.current.has(id)) { result.push(loc); continue }
            result.push(mergeGoal(loc, rem))
          }
          return result
        }

        // CRITICAL: must merge with LATEST state via `prev`, not the captured `days`/`goals`
        // from useEffect closure. Otherwise a user toggle during sync window is lost:
        //   1. sync starts, captures stale `goals`
        //   2. user toggles task → state updates, dirty marked
        //   3. mergeGoalsList(stale, remote) uses stale `loc` for dirty check → toggle absent
        //   4. setGoalsRaw(() => merged) replaces state, toggle lost
        // Using `prev` makes the merge see the user's in-flight changes.
        let mergedDays: DayEntry[] = []
        let mergedGoals: ShortGoal[] = []
        setDaysRaw(prev => {
          mergedDays = mergeDaysList(prev, remoteData.days)
          save(STORAGE_KEYS.days, mergedDays)
          return mergedDays
        })
        setGoalsRaw(prev => {
          mergedGoals = mergeGoalsList(prev, remoteData.goals)
          save(STORAGE_KEYS.goals, mergedGoals)
          return mergedGoals
        })

        // Routines: LWW by updated_at
        if (remoteData.routines.length > 0) {
          setRoutinesRaw(prev => {
            const map = new Map<string, Routine>(prev.map(r => [r.id, r]))
            for (const rr of remoteData.routines) {
              if (dirtyRoutineIds.current.has(rr.id)) continue
              const lr = map.get(rr.id)
              if (!lr) { map.set(rr.id, rr); continue }
              if ((rr.updated_at ?? 0) >= (lr.updated_at ?? 0)) map.set(rr.id, rr)
            }
            const merged = Array.from(map.values())
            save(STORAGE_KEYS.routines, merged)
            return merged
          })
        }
        // Routine logs: LWW by updated_at, keyed by (routine_id, date)
        if (remoteData.logs.length > 0) {
          setLogsRaw(prev => {
            const key = (l: RoutineLog) => `${l.routine_id}_${l.date}`
            const map = new Map<string, RoutineLog>(prev.map(l => [key(l), l]))
            for (const rl of remoteData.logs) {
              const k = key(rl)
              if (dirtyRoutineLogKeys.current.has(k)) continue
              const ll = map.get(k)
              if (!ll) { map.set(k, rl); continue }
              if ((rl.updated_at ?? 0) >= (ll.updated_at ?? 0)) map.set(k, rl)
            }
            const merged = Array.from(map.values())
            save(STORAGE_KEYS.logs, merged)
            return merged
          })
        }
        // Long goals: remote wins for shared IDs (no per-entity timestamps yet)
        if (remoteData.longGoals.length > 0) {
          setLongGoalsRaw(prev => {
            const remoteIds = new Set(remoteData.longGoals.map((g: LongGoal) => g.id))
            const localOnly = prev.filter(g => !remoteIds.has(g.id))
            const localById = new Map(prev.map(goal => [goal.id, goal]))
            const merged = [
              ...remoteData.longGoals.map(remoteGoal => {
                const localGoal = localById.get(remoteGoal.id)
                if (dirtyLongGoalIds.current.has(remoteGoal.id) && localGoal) return localGoal
                return (remoteGoal.updated_at ?? 0) >= (localGoal?.updated_at ?? 0) ? remoteGoal : (localGoal ?? remoteGoal)
              }),
              ...localOnly,
            ]
            save(STORAGE_KEYS.longGoals, merged)
            return merged
          })
        }
        if (Object.keys(remoteData.weeklyReviews).length > 0) {
          setWeeklyReviewsRaw(prev => {
            const merged = { ...prev }
            for (const [key, content] of Object.entries(remoteData.weeklyReviews)) {
              if (!dirtyWeeklyReviewKeys.current.has(key)) merged[key] = content
            }
            save(STORAGE_KEYS.weeklyReviews, merged)
            return merged
          })
        }

        // ── Categories sync ─────────────────────────────────────────────────
        const localCats = load<Category[]>(STORAGE_KEYS.categories, [])
        const remoteSnapshot = parseCategorySnapshot(remoteData.weeklyReviews['__categories__'])
        if (remoteSnapshot && (!categoriesDirty.current || remoteSnapshot.updated_at >= categoriesUpdatedAt.current)) {
          // The server snapshot is authoritative, including deletions and order.
          setCategoriesRaw(() => {
            persistCategorySnapshot(remoteSnapshot.items, remoteSnapshot.updated_at)
            return remoteSnapshot.items
          })
          categoriesDirty.current = false
          save(STORAGE_KEYS.dirtyCategories, false)
        } else if (remoteSnapshot && categoriesDirty.current) {
          // A failed/offline local edit is newer; retry it instead of losing it.
          pushCategories(localCats, categoriesUpdatedAt.current)
        } else if (localCats.length === 0) {
          const catMap = new Map<string, Category>()
          // State updater callbacks may be deferred. Include the latest refs and
          // fetched rows directly so legacy categories are never skipped.
          const categoryDays = [...daysRef.current, ...remoteData.days]
          const categoryGoals = [...goalsRef.current, ...remoteData.goals]
          for (const day of categoryDays) {
            for (const task of day.tasks) {
              if (task.category_id !== SCHEDULE_CAT_ID && task.category_id !== DEADLINE_CAT_ID && !catMap.has(task.category_id)) {
                catMap.set(task.category_id, { id: task.category_id, name: task.category_name, color: task.category_color })
              }
            }
          }
          for (const goal of categoryGoals) {
            for (const task of goal.tasks) {
              if (task.category_id !== SCHEDULE_CAT_ID && task.category_id !== DEADLINE_CAT_ID && !catMap.has(task.category_id)) {
                catMap.set(task.category_id, { id: task.category_id, name: task.category_name, color: task.category_color })
              }
            }
          }
          if (catMap.size > 0) {
            const derived = Array.from(catMap.values())
            const updatedAt = now()
            setCategoriesRaw(() => {
              persistCategorySnapshot(derived, updatedAt)
              return derived
            })
            pushCategories(derived, updatedAt)
          }
        } else {
          // First synced visit after the old local-only implementation.
          const updatedAt = categoriesUpdatedAt.current || now()
          persistCategorySnapshot(localCats, updatedAt)
          pushCategories(localCats, updatedAt)
        }

        // ── One-time backfill ────────────────────────────────────────────────
        const BACKFILL_KEY = `planr_backfill_v2_${userId}`
        if (!localStorage.getItem(BACKFILL_KEY)) {
          console.log('[Planr] 백필 동기화 시작...')
          const remoteRoutineIds = new Set(remoteData.routines.map(item => item.id))
          const remoteLogKeys = new Set(remoteData.logs.map(item => routineLogKey(item)))
          const remoteLongGoalIds = new Set(remoteData.longGoals.map(item => item.id))
          const daysForBackfill = mergedDays.length > 0 ? mergedDays : mergeDaysList(daysRef.current, remoteData.days)
          const goalsForBackfill = mergedGoals.length > 0 ? mergedGoals : mergeGoalsList(goalsRef.current, remoteData.goals)
          const results = await Promise.allSettled([
            ...daysForBackfill.map(d => upsertDayEntry(userId, d)),
            ...goalsForBackfill.map(g => upsertShortGoal(userId, g)),
            ...routinesRef.current.filter(item => !remoteRoutineIds.has(item.id)).map(item => upsertRoutine(userId, item)),
            ...logsRef.current.filter(item => !remoteLogKeys.has(routineLogKey(item))).map(item => upsertRoutineLog(userId, item)),
            ...longGoalsRef.current.filter(item => !remoteLongGoalIds.has(item.id)).map(item => upsertLongGoal(userId, item)),
            ...Object.entries(weeklyReviewsRef.current)
              .filter(([key]) => remoteData.weeklyReviews[key] === undefined)
              .map(([key, content]) => upsertWeeklyReview(userId, key, content)),
          ])
          const failures = results.filter(r => r.status === 'rejected').length
          if (failures === 0) {
            localStorage.setItem(BACKFILL_KEY, '1')
            console.log('[Planr] 백필 동기화 완료.')
          }
        }

        // ── Retry dirty entities (failed writes from previous session) ──────
        // Deferred via setTimeout so React commits the merge setState first, ensuring
        // refs reflect the merged state. Without the defer, refs may still hold the
        // pre-merge state and `goal.find(...)` could miss entities or use stale done states.
        setTimeout(() => {
          for (const goalId of Array.from(dirtyGoalIds.current)) {
            const goal = goalsRef.current.find(g => g.id === goalId)
            if (goal) trackWrite(upsertShortGoal(userId, goal), () => clearGoalDirty(goalId), `goal:${goalId}`)
            else trackWrite(deleteShortGoalSync(userId, goalId), () => clearGoalDirty(goalId), `goal:${goalId}`)
          }
          for (const date of Array.from(dirtyDayDates.current)) {
            const day = daysRef.current.find(d => d.date === date)
            if (day) trackWrite(upsertDayEntry(userId, day), () => clearDayDirty(date), `day:${date}`)
            else clearDayDirty(date)
          }
          retryAuxiliaryWrites()
        }, 0)

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

  // ── Periodic sync (every 30s) + focus/visibility triggers ──────────────────
  // Cross-device done-state updates flow because per-task updated_at picks the newer
  // copy. In-flight local writes are protected via the pendingWrites guard, so the
  // window where remote could be stale-vs-local is closed.
  // Focus/visibility triggers run sync immediately when user returns to the tab,
  // so switching devices and coming back doesn't require waiting up to 30s.
  useEffect(() => {
    if (!userId) return
    let syncing = false
    async function runSync() {
      if (syncing) return
      syncing = true
      try {
        if (pendingWrites.current > 0) return

        // Retry any entities that failed to write previously (dirty flag still set).
        // Without this, a single failed write never reaches Supabase until reload,
        // and other devices never see the change.
        if (dirtyGoalIds.current.size > 0) {
          for (const goalId of Array.from(dirtyGoalIds.current)) {
            const goal = goalsRef.current.find(g => g.id === goalId)
            if (goal) trackWrite(upsertShortGoal(userId, goal), () => clearGoalDirty(goalId), `goal:${goalId}`)
            else trackWrite(deleteShortGoalSync(userId, goalId), () => clearGoalDirty(goalId), `goal:${goalId}`)
          }
        }
        if (dirtyDayDates.current.size > 0) {
          for (const date of Array.from(dirtyDayDates.current)) {
            const day = daysRef.current.find(d => d.date === date)
            if (day) trackWrite(upsertDayEntry(userId, day), () => clearDayDirty(date), `day:${date}`)
            else clearDayDirty(date)
          }
        }
        retryAuxiliaryWrites()

        const remoteData = await fetchAll(userId)
        const backfillKey = `planr_backfill_v2_${userId}`
        let backfillComplete = localStorage.getItem(backfillKey) === '1'
        if (!backfillComplete) {
          let missingLocalRecords = 0
          const remoteDayDates = new Set(remoteData.days.map(item => item.date))
          const remoteGoalIds = new Set(remoteData.goals.map(item => item.id))
          const remoteRoutineIds = new Set(remoteData.routines.map(item => item.id))
          const remoteLogKeys = new Set(remoteData.logs.map(item => routineLogKey(item)))
          const remoteLongGoalIds = new Set(remoteData.longGoals.map(item => item.id))
          for (const day of daysRef.current) {
            if (!remoteDayDates.has(day.date)) { markDayDirty(day.date); missingLocalRecords++ }
          }
          for (const goal of goalsRef.current) {
            if (!remoteGoalIds.has(goal.id)) { markGoalDirty(goal.id); missingLocalRecords++ }
          }
          for (const routine of routinesRef.current) {
            if (!remoteRoutineIds.has(routine.id)) { markRoutineDirty(routine.id); missingLocalRecords++ }
          }
          for (const log of logsRef.current) {
            const key = routineLogKey(log)
            if (!remoteLogKeys.has(key)) { markRoutineLogDirty(key); missingLocalRecords++ }
          }
          for (const goal of longGoalsRef.current) {
            if (!remoteLongGoalIds.has(goal.id)) { markLongGoalDirty(goal.id); missingLocalRecords++ }
          }
          for (const key of Object.keys(weeklyReviewsRef.current)) {
            if (remoteData.weeklyReviews[key] === undefined) { markWeeklyReviewDirty(key); missingLocalRecords++ }
          }
          if (missingLocalRecords === 0) {
            localStorage.setItem(backfillKey, '1')
            backfillComplete = true
          }
        }

        // ── Days ─────────────────────────────────────────────────────────────
        const remoteDaysByDate = new Map(remoteData.days.map(item => [item.date, item]))
        const dayRepairs: DayEntry[] = []
        for (const localDay of daysRef.current) {
          const remoteDay = remoteDaysByDate.get(localDay.date)
          if (!remoteDay || dirtyDayDates.current.has(localDay.date)) continue
          const merged = mergeDay(localDay, remoteDay)
          if (daySyncSignature(merged) !== daySyncSignature(remoteDay)) dayRepairs.push(merged)
        }
        if (remoteData.days.length > 0) {
          setDaysRaw(prev => {
            const localMap = new Map(prev.map(d => [d.date, d]))
            const remoteMap = new Map(remoteData.days.map((d: DayEntry) => [d.date, d]))
            const allDates = new Set<string>([...localMap.keys(), ...remoteMap.keys()])
            const result: DayEntry[] = []
            for (const date of allDates) {
              const loc = localMap.get(date)
              const rem = remoteMap.get(date)
              if (!loc) { result.push(rem!); continue }
              if (!rem) { result.push(loc); continue }
              if (dirtyDayDates.current.has(date)) { result.push(loc); continue }
              result.push(mergeDay(loc, rem))
            }
            save(STORAGE_KEYS.days, result)
            return result
          })
        }
        for (const repairedDay of dayRepairs) {
          markDayDirty(repairedDay.date)
          trackWrite(
            upsertDayEntry(userId, repairedDay),
            () => clearDayDirty(repairedDay.date),
            `day:${repairedDay.date}`,
          )
        }

        // ── Goals ────────────────────────────────────────────────────────────
        const remoteGoalsById = new Map(remoteData.goals.map(item => [item.id, item]))
        const goalRepairs: ShortGoal[] = []
        for (const localGoal of goalsRef.current) {
          const remoteGoal = remoteGoalsById.get(localGoal.id)
          if (!remoteGoal || dirtyGoalIds.current.has(localGoal.id)) continue
          const merged = mergeGoal(localGoal, remoteGoal)
          if (goalSyncSignature(merged) !== goalSyncSignature(remoteGoal)) goalRepairs.push(merged)
        }
        setGoalsRaw(prev => {
            const localMap = new Map(prev.map(g => [g.id, g]))
            const remoteMap = new Map(remoteData.goals.map((g: ShortGoal) => [g.id, g]))
            const allIds = new Set<string>([...localMap.keys(), ...remoteMap.keys()])
            const result: ShortGoal[] = []
            for (const id of allIds) {
              const loc = localMap.get(id)
              const rem = remoteMap.get(id)
              if (!loc) { result.push(rem!); continue }
              // After the one-time backfill, a missing server row represents a
              // deletion on another device. Only unsent local edits survive it.
              if (!rem) {
                if (dirtyGoalIds.current.has(id) || !backfillComplete) result.push(loc)
                continue
              }
              if (dirtyGoalIds.current.has(id)) { result.push(loc); continue }
              result.push(mergeGoal(loc, rem))
            }
            save(STORAGE_KEYS.goals, result)
            return result
        })
        for (const repairedGoal of goalRepairs) {
          markGoalDirty(repairedGoal.id)
          trackWrite(
            upsertShortGoal(userId, repairedGoal),
            () => clearGoalDirty(repairedGoal.id),
            `goal:${repairedGoal.id}`,
          )
        }

        // ── Routines ─────────────────────────────────────────────────────────
        setRoutinesRaw(prev => {
            const map = new Map<string, Routine>(
              prev.filter(r => dirtyRoutineIds.current.has(r.id) || !backfillComplete).map(r => [r.id, r]),
            )
            for (const rr of remoteData.routines) {
              if (dirtyRoutineIds.current.has(rr.id) && map.has(rr.id)) continue
              const lr = map.get(rr.id)
              if (!lr) { map.set(rr.id, rr); continue }
              if ((rr.updated_at ?? 0) >= (lr.updated_at ?? 0)) map.set(rr.id, rr)
            }
            const merged = Array.from(map.values())
            save(STORAGE_KEYS.routines, merged)
            return merged
        })

        // ── Routine logs ─────────────────────────────────────────────────────
        setLogsRaw(prev => {
            const key = (l: RoutineLog) => `${l.routine_id}_${l.date}`
            const map = new Map<string, RoutineLog>(
              prev.filter(l => dirtyRoutineLogKeys.current.has(key(l)) || !backfillComplete).map(l => [key(l), l]),
            )
            for (const rl of remoteData.logs) {
              const k = key(rl)
              if (dirtyRoutineLogKeys.current.has(k) && map.has(k)) continue
              const ll = map.get(k)
              if (!ll) { map.set(k, rl); continue }
              if ((rl.updated_at ?? 0) >= (ll.updated_at ?? 0)) map.set(k, rl)
            }
            const merged = Array.from(map.values())
            save(STORAGE_KEYS.logs, merged)
            return merged
        })

        // Long goals: server rows are canonical; dirty local-only rows are
        // retained until their write/delete retry succeeds.
        setLongGoalsRaw(prev => {
          const localById = new Map(prev.map(goal => [goal.id, goal]))
          const merged = remoteData.longGoals.map(remoteGoal => {
            const localGoal = localById.get(remoteGoal.id)
            if (dirtyLongGoalIds.current.has(remoteGoal.id) && localGoal) return localGoal
            return (remoteGoal.updated_at ?? 0) >= (localGoal?.updated_at ?? 0) ? remoteGoal : (localGoal ?? remoteGoal)
          })
          for (const localGoal of prev) {
            if ((dirtyLongGoalIds.current.has(localGoal.id) || !backfillComplete) && !merged.some(goal => goal.id === localGoal.id)) {
              merged.push(localGoal)
            }
          }
          save(STORAGE_KEYS.longGoals, merged)
          return merged
        })

        // Preferences/reviews are server-backed too (Big 3, mantra, journal).
        setWeeklyReviewsRaw(prev => {
          const merged = { ...remoteData.weeklyReviews }
          const localKeysToKeep = backfillComplete ? dirtyWeeklyReviewKeys.current : new Set(Object.keys(prev))
          for (const key of localKeysToKeep) {
            if (prev[key] !== undefined) merged[key] = prev[key]
          }
          save(STORAGE_KEYS.weeklyReviews, merged)
          return merged
        })

        // Categories use a timestamped canonical snapshot. Unlike the previous
        // union merge, deletions now propagate instead of being resurrected.
        const remoteSnapshot = parseCategorySnapshot(remoteData.weeklyReviews['__categories__'])
        if (remoteSnapshot) {
          if (categoriesDirty.current && categoriesUpdatedAt.current > remoteSnapshot.updated_at) {
            pushCategories(categoriesRef.current, categoriesUpdatedAt.current)
          } else if (remoteSnapshot.updated_at >= categoriesUpdatedAt.current) {
            setCategoriesRaw(prev => {
              persistCategorySnapshot(remoteSnapshot.items, remoteSnapshot.updated_at)
              if (JSON.stringify(remoteSnapshot.items) === JSON.stringify(prev)) return prev
              return remoteSnapshot.items
            })
            categoriesDirty.current = false
            save(STORAGE_KEYS.dirtyCategories, false)
          }
        }
      } catch {
        // Silent fail for periodic sync
      } finally {
        syncing = false
      }
    }
    const interval = setInterval(runSync, 15000)
    // Sync immediately when user returns to the tab (no waiting up to 30s)
    function onVisible() { if (document.visibilityState === 'visible') runSync() }
    function onFocus() { runSync() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // ── Setters with auto-persist ──────────────────────────────────────────────
  const setDays = useCallback((v: DayEntry[] | ((p: DayEntry[]) => DayEntry[])) => {
    setDaysRaw(prev => { const next = typeof v === 'function' ? v(prev) : v; save(STORAGE_KEYS.days, next); return next })
  }, [])
  const setGoals = useCallback((v: ShortGoal[] | ((p: ShortGoal[]) => ShortGoal[])) => {
    setGoalsRaw(prev => { const next = typeof v === 'function' ? v(prev) : v; goalsRef.current = next; save(STORAGE_KEYS.goals, next); return next })
  }, [])
  const setRoutines = useCallback((v: Routine[] | ((p: Routine[]) => Routine[])) => {
    setRoutinesRaw(prev => { const next = typeof v === 'function' ? v(prev) : v; save(STORAGE_KEYS.routines, next); return next })
  }, [])
  const setLogs = useCallback((v: RoutineLog[] | ((p: RoutineLog[]) => RoutineLog[])) => {
    setLogsRaw(prev => { const next = typeof v === 'function' ? v(prev) : v; logsRef.current = next; save(STORAGE_KEYS.logs, next); return next })
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
      const updatedAt = now()
      persistCategorySnapshot(next, updatedAt)
      pushCategories(next, updatedAt)
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

  // Internal: update a day entry locally + persist to Supabase. Stamps meta.updated_at
  // unless the caller already provided a fresh one (e.g. task-only mutations bump task.updated_at
  // and pass `bumpMeta: false` to avoid clobbering a concurrent meta edit on another device).
  function upsertDay(entry: DayEntry, opts: { bumpMeta?: boolean } = {}) {
    const bump = opts.bumpMeta ?? true
    const finalEntry = bump
      ? { ...entry, meta: { ...entry.meta, updated_at: now() } }
      : entry
    setDays(prev => {
      const idx = prev.findIndex(d => d.date === finalEntry.date)
      if (idx >= 0) { const n = [...prev]; n[idx] = finalEntry; return n }
      return [...prev, finalEntry]
    })
    if (userId) {
      markDayDirty(finalEntry.date)
      trackWrite(upsertDayEntry(userId, finalEntry), () => clearDayDirty(finalEntry.date), `day:${finalEntry.date}`)
    }
  }

  function toggleTask(date: string, taskId: string) {
    const entry = getDay(date)
    const task = entry.tasks.find(t => t.id === taskId)
    if (!task) return
    const nextDone = !task.done
    const updatedTask: Task = {
      ...task,
      done: nextDone,
      ...(nextDone && task.progress_target
        ? { progress_current: task.progress_target }
        : !nextDone
          ? { progress_current: undefined, progress_target: undefined, progress_unit: undefined }
          : {}),
      updated_at: now(),
    }
    // Task-only mutation: don't bump meta.updated_at so concurrent meta edits aren't clobbered.
    upsertDay({ ...entry, tasks: entry.tasks.map(t => t.id === taskId ? updatedTask : t) }, { bumpMeta: false })
    if (userId) trackWrite(upsertTask(userId, updatedTask, date))
  }

  function addTask(date: string, categoryId: string, text: string, schedule?: string | TaskScheduleInput) {
    const entry = getDay(date)
    const category =
      entry.categories.find(c => c.id === categoryId) ||
      categories.find(c => c.id === categoryId)
    if (!category) return
    const scheduleFields: TaskScheduleInput = typeof schedule === 'string'
      ? { start_time: schedule, fixed: categoryId === SCHEDULE_CAT_ID }
      : (schedule ?? {})
    const legacyTime = scheduleFields.start_time
    const task: Task = {
      id: uid(), text, done: false,
      category_id: categoryId, day_id: entry.id,
      category_name: category.name, category_color: category.color,
      updated_at: now(),
      ...scheduleFields,
      ...(legacyTime ? { time: legacyTime } : {}),
      ...(categoryId === SCHEDULE_CAT_ID ? { fixed: true } : {}),
    }
    upsertDay({ ...entry, tasks: [...entry.tasks, task] }, { bumpMeta: false })
    if (userId) trackWrite(upsertTask(userId, task, date))
  }

  function deleteTask(date: string, taskId: string) {
    const entry = getDay(date)
    const task = entry.tasks.find(item => item.id === taskId)
    if (!task) return
    const deletedAt = now()
    const tombstone: Task = { ...task, done: false, deleted_at: deletedAt, updated_at: deletedAt }
    const taskTombstones = [...(entry.task_tombstones ?? []).filter(item => item.id !== taskId), tombstone]
    upsertDay({ ...entry, tasks: entry.tasks.filter(t => t.id !== taskId), task_tombstones: taskTombstones }, { bumpMeta: false })
    if (userId) trackWrite(deleteTaskSync(userId, taskId))
  }

  function updateTask(date: string, taskId: string, patch: Partial<Task>) {
    const entry = getDay(date)
    const task = entry.tasks.find(t => t.id === taskId)
    if (!task) return
    const updated: Task = { ...task, ...patch, updated_at: now() }
    upsertDay({ ...entry, tasks: entry.tasks.map(t => t.id === taskId ? updated : t) }, { bumpMeta: false })
    if (userId) trackWrite(upsertTask(userId, updated, date))
  }

  function updateNote(date: string, note: string) {
    upsertDay({ ...getDay(date), note })
  }

  function updateMeta(date: string, patch: Partial<DayMeta>) {
    const entry = getDay(date)
    upsertDay({ ...entry, meta: { ...entry.meta, ...patch } })
  }

  // ── DAY NOTES (journal) ───────────────────────────────────────────────────
  function addDayNote(date: string, title: string, body: string) {
    const entry = getDay(date)
    const note: JournalEntry = { id: uid(), title, body, createdAt: new Date().toISOString() }
    upsertDay({ ...entry, meta: { ...entry.meta, notes: [note, ...(entry.meta.notes ?? [])] } })
  }

  function updateDayNote(date: string, noteId: string, title: string, body: string) {
    const entry = getDay(date)
    const notes = (entry.meta.notes ?? []).map(n => n.id === noteId ? { ...n, title, body } : n)
    upsertDay({ ...entry, meta: { ...entry.meta, notes } })
  }

  function deleteDayNote(date: string, noteId: string) {
    const entry = getDay(date)
    const notes = (entry.meta.notes ?? []).filter(n => n.id !== noteId)
    upsertDay({ ...entry, meta: { ...entry.meta, notes } })
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
  // Helper: persist a goal + manage dirty/write tracking. Stamps goal.updated_at
  // unless bumpGoal: false (used for task-only changes so the goal's own LWW timestamp
  // isn't bumped by an unrelated task edit on another device).
  function persistGoal(goal: ShortGoal, opts: { bumpGoal?: boolean } = {}) {
    const bump = opts.bumpGoal ?? true
    const finalGoal = bump ? { ...goal, updated_at: now() } : goal
    if (userId) {
      markGoalDirty(finalGoal.id)
      trackWrite(upsertShortGoal(userId, finalGoal), () => clearGoalDirty(finalGoal.id), `goal:${finalGoal.id}`)
    }
    return finalGoal
  }

  function addGoal(g: Omit<ShortGoal, 'id'>) {
    const newGoal: ShortGoal = { ...g, id: uid(), updated_at: now() }
    setGoals(prev => [...prev, newGoal])
    if (userId) {
      markGoalDirty(newGoal.id)
      trackWrite(upsertShortGoal(userId, newGoal), () => clearGoalDirty(newGoal.id), `goal:${newGoal.id}`)
    }
  }
  function updateGoal(id: string, patch: Partial<ShortGoal>) {
    const currentGoal = goalsRef.current.find(goal => goal.id === id)
    if (!currentGoal) return
    const updatedGoal: ShortGoal = { ...currentGoal, ...patch, updated_at: now() }
    const nextGoals = goalsRef.current.map(goal => goal.id === id ? updatedGoal : goal)
    goalsRef.current = nextGoals
    setGoals(nextGoals)
    if (userId) {
      markGoalDirty(id)
      trackWrite(upsertShortGoal(userId, updatedGoal), () => clearGoalDirty(id), `goal:${id}`)
    }
  }
  function deleteGoal(id: string) {
    setGoals(prev => prev.filter(g => g.id !== id))
    if (userId) {
      markGoalDirty(id)
      trackWrite(deleteShortGoalSync(userId, id), () => clearGoalDirty(id), `goal:${id}`)
    }
  }
  function toggleGoalTask(goalId: string, taskId: string) {
    let updatedGoal: ShortGoal | undefined
    let updatedTask: Task | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      const tasks = g.tasks.map(t => {
        if (t.id !== taskId) return t
        updatedTask = { ...t, done: !t.done, updated_at: now() }
        return updatedTask
      })
      updatedGoal = { ...g, tasks }
      return updatedGoal
    }))
    if (userId && updatedGoal) {
      markGoalDirty(goalId)
      trackWrite(upsertShortGoal(userId, updatedGoal), () => clearGoalDirty(goalId), `goal:${goalId}`)
      if (updatedTask) trackWrite(upsertTask(userId, updatedTask, goalId))
    }
  }
  function addGoalTask(goalId: string, categoryId: string, text: string) {
    let updatedGoal: ShortGoal | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      const category =
        g.categories.find((c: Category) => c.id === categoryId) ||
        categories.find(c => c.id === categoryId)
      if (!category) return g
      const newTask: Task = {
        id: uid(), text, done: false, category_id: categoryId,
        day_id: goalId, goal_id: goalId,
        category_name: category.name, category_color: category.color,
        updated_at: now(),
      }
      updatedGoal = { ...g, tasks: [...g.tasks, newTask] }
      return updatedGoal
    }))
    if (userId && updatedGoal) {
      markGoalDirty(goalId)
      trackWrite(upsertShortGoal(userId, updatedGoal), () => clearGoalDirty(goalId), `goal:${goalId}`)
    }
  }

  function deleteGoalTask(goalId: string, taskId: string) {
    let updatedGoal: ShortGoal | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      const task = g.tasks.find(item => item.id === taskId)
      if (!task) return g
      const deletedAt = now()
      const tombstone: Task = { ...task, done: false, deleted_at: deletedAt, updated_at: deletedAt }
      updatedGoal = {
        ...g,
        tasks: g.tasks.filter(t => t.id !== taskId),
        task_tombstones: [...(g.task_tombstones ?? []).filter(item => item.id !== taskId), tombstone],
      }
      return updatedGoal
    }))
    if (userId && updatedGoal) {
      markGoalDirty(goalId)
      trackWrite(upsertShortGoal(userId, updatedGoal), () => clearGoalDirty(goalId), `goal:${goalId}`)
      trackWrite(deleteTaskSync(userId, taskId))
    }
  }

  function updateGoalTask(goalId: string, taskId: string, patch: Partial<Task>) {
    let updatedGoal: ShortGoal | undefined
    let updatedTask: Task | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      const task = g.tasks.find(t => t.id === taskId)
      if (!task) return g
      updatedTask = { ...task, ...patch, updated_at: now() }
      updatedGoal = { ...g, tasks: g.tasks.map(t => t.id === taskId ? updatedTask! : t) }
      return updatedGoal
    }))
    if (userId && updatedGoal) {
      markGoalDirty(goalId)
      trackWrite(upsertShortGoal(userId, updatedGoal), () => clearGoalDirty(goalId), `goal:${goalId}`)
      if (updatedTask) trackWrite(upsertTask(userId, updatedTask, goalId))
    }
  }

  // ── GOAL NOTES ─────────────────────────────────────────────────────────────
  function addGoalNote(goalId: string, text: string) {
    const newNote: NoteEntry = { id: uid(), text: text.trim(), createdAt: new Date().toISOString() }
    let updatedGoal: ShortGoal | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      updatedGoal = { ...g, notes: [newNote, ...(g.notes ?? [])], updated_at: now() }
      return updatedGoal
    }))
    if (userId && updatedGoal) {
      markGoalDirty(goalId)
      trackWrite(upsertShortGoal(userId, updatedGoal), () => clearGoalDirty(goalId), `goal:${goalId}`)
    }
  }

  function updateGoalNote(goalId: string, noteId: string, text: string) {
    let updatedGoal: ShortGoal | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      updatedGoal = { ...g, notes: (g.notes ?? []).map(n => n.id === noteId ? { ...n, text } : n), updated_at: now() }
      return updatedGoal
    }))
    if (userId && updatedGoal) {
      markGoalDirty(goalId)
      trackWrite(upsertShortGoal(userId, updatedGoal), () => clearGoalDirty(goalId), `goal:${goalId}`)
    }
  }

  function deleteGoalNote(goalId: string, noteId: string) {
    let updatedGoal: ShortGoal | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      updatedGoal = { ...g, notes: (g.notes ?? []).filter(n => n.id !== noteId), updated_at: now() }
      return updatedGoal
    }))
    if (userId && updatedGoal) {
      markGoalDirty(goalId)
      trackWrite(upsertShortGoal(userId, updatedGoal), () => clearGoalDirty(goalId), `goal:${goalId}`)
    }
  }

  // ── LONG GOALS ─────────────────────────────────────────────────────────────
  function addLongGoal(g: Omit<LongGoal, 'id'>) {
    const newGoal = { ...g, id: uid(), updated_at: now() }
    setLongGoals(prev => [...prev, newGoal])
    if (userId) {
      markLongGoalDirty(newGoal.id)
      trackWrite(upsertLongGoal(userId, newGoal), () => clearLongGoalDirty(newGoal.id), `long-goal:${newGoal.id}`)
    }
  }
  function updateLongGoal(id: string, patch: Partial<LongGoal>) {
    let updatedGoal: LongGoal | undefined
    setLongGoals(prev => prev.map(g => { if (g.id === id) { updatedGoal = { ...g, ...patch, updated_at: now() }; return updatedGoal } return g }))
    if (userId && updatedGoal) {
      markLongGoalDirty(id)
      trackWrite(upsertLongGoal(userId, updatedGoal), () => clearLongGoalDirty(id), `long-goal:${id}`)
    }
  }
  function deleteLongGoal(id: string) {
    setLongGoals(prev => prev.filter(g => g.id !== id))
    if (userId) {
      markLongGoalDirty(id)
      trackWrite(deleteLongGoalSync(userId, id), () => clearLongGoalDirty(id), `long-goal:${id}`)
    }
  }

  // ── QUICK ADD ──────────────────────────────────────────────────────────────
  function quickAddTask(date: string, text: string) {
    const entry = getDay(date)
    const targetCat = categories[0]
    if (targetCat) {
      const task: Task = {
        id: uid(), text, done: false, category_id: targetCat.id, day_id: entry.id,
        category_name: targetCat.name, category_color: targetCat.color, updated_at: now(),
      }
      upsertDay({ ...entry, tasks: [...entry.tasks, task] }, { bumpMeta: false })
      if (userId) trackWrite(upsertTask(userId, task, date))
    } else {
      const catId = uid()
      const newCat: Category = { id: catId, name: '할 일', color: 'purple' }
      setCategories(prev => [...prev, newCat])
      const task: Task = {
        id: uid(), text, done: false, category_id: catId, day_id: entry.id,
        category_name: newCat.name, category_color: newCat.color, updated_at: now(),
      }
      upsertDay({ ...entry, tasks: [...entry.tasks, task] }, { bumpMeta: false })
      if (userId) trackWrite(upsertTask(userId, task, date))
    }
  }

  // ── ROUTINES ───────────────────────────────────────────────────────────────
  function addRoutine(name: string, time?: string, period?: RoutinePeriod) {
    const derivedPeriod = period ?? derivePeriod(time)
    const newRoutine: Routine = {
      id: uid(), name, status: 'active' as RoutineStatus, created_at: formatDate(new Date()),
      time, order: 0, period: derivedPeriod, updated_at: now(),
    }
    setRoutines(prev => [...prev, newRoutine])
    if (userId) {
      markRoutineDirty(newRoutine.id)
      trackWrite(upsertRoutine(userId, newRoutine), () => clearRoutineDirty(newRoutine.id), `routine:${newRoutine.id}`)
    }
  }
  function setRoutineStatus(id: string, status: RoutineStatus) {
    let updatedRoutine: Routine | undefined
    setRoutines(prev => prev.map(r => { if (r.id === id) { updatedRoutine = { ...r, status, updated_at: now() }; return updatedRoutine } return r }))
    if (userId && updatedRoutine) {
      markRoutineDirty(id)
      trackWrite(upsertRoutine(userId, updatedRoutine), () => clearRoutineDirty(id), `routine:${id}`)
    }
  }
  function updateRoutineName(id: string, name: string) {
    let updatedRoutine: Routine | undefined
    setRoutines(prev => prev.map(r => { if (r.id === id) { updatedRoutine = { ...r, name, updated_at: now() }; return updatedRoutine } return r }))
    if (userId && updatedRoutine) {
      markRoutineDirty(id)
      trackWrite(upsertRoutine(userId, updatedRoutine), () => clearRoutineDirty(id), `routine:${id}`)
    }
  }
  function updateRoutine(id: string, patch: Partial<Omit<Routine, 'id'>>) {
    if (patch.time !== undefined && !patch.period) {
      patch = { ...patch, period: derivePeriod(patch.time) }
    }
    let updatedRoutine: Routine | undefined
    setRoutines(prev => prev.map(r => { if (r.id === id) { updatedRoutine = { ...r, ...patch, updated_at: now() }; return updatedRoutine } return r }))
    if (userId && updatedRoutine) {
      markRoutineDirty(id)
      trackWrite(upsertRoutine(userId, updatedRoutine), () => clearRoutineDirty(id), `routine:${id}`)
    }
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
      const t = now()
      const next = prev.map(r => orderMap.has(r.id) ? { ...r, order: orderMap.get(r.id)!, updated_at: t } : r)
      next.filter(r => orderMap.has(r.id)).forEach(r => {
        if (userId) {
          markRoutineDirty(r.id)
          trackWrite(upsertRoutine(userId, r), () => clearRoutineDirty(r.id), `routine:${r.id}`)
        }
      })
      return next
    })
  }
  function deleteRoutine(id: string) {
    setRoutines(prev => prev.filter(r => r.id !== id))
    setLogs(prev => prev.filter(l => l.routine_id !== id))
    if (userId) {
      markRoutineDirty(id)
      trackWrite(deleteRoutineSync(userId, id), () => clearRoutineDirty(id), `routine:${id}`)
    }
  }
  function toggleRoutineLog(routineId: string, date: string) {
    const exists = logsRef.current.find(log => log.routine_id === routineId && log.date === date)
    const updatedLog: RoutineLog = exists
      ? { ...exists, done: !exists.done, updated_at: now() }
      : { id: uid(), routine_id: routineId, date, done: true, updated_at: now() }
    const nextLogs = exists
      ? logsRef.current.map(log => routineLogKey(log) === routineLogKey(updatedLog) ? updatedLog : log)
      : [...logsRef.current, updatedLog]
    // Update the ref synchronously so rapid taps and an immediate background sync
    // always see the same optimistic value that is rendered on screen.
    logsRef.current = nextLogs
    setLogs(nextLogs)
    if (userId) {
      const key = routineLogKey(updatedLog)
      markRoutineLogDirty(key)
      trackWrite(upsertRoutineLog(userId, updatedLog), () => clearRoutineLogDirty(key), `routine-log:${key}`)
    }
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
      // Reorder is a meta-level change; bump meta.updated_at.
      updatedEntry = { ...d, tasks: [...rest, ...reordered], meta: { ...d.meta, updated_at: now() } }
      return prev.map(day => day.date === date ? updatedEntry! : day)
    })
    if (userId && updatedEntry) {
      markDayDirty(updatedEntry.date)
      trackWrite(upsertDayEntry(userId, updatedEntry), () => clearDayDirty(updatedEntry!.date), `day:${updatedEntry.date}`)
    }
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
      updatedGoal = { ...g, tasks: [...rest, ...reordered], updated_at: now() }
      return prev.map(goal => goal.id === goalId ? updatedGoal! : goal)
    })
    if (userId && updatedGoal) {
      markGoalDirty(goalId)
      trackWrite(upsertShortGoal(userId, updatedGoal), () => clearGoalDirty(goalId), `goal:${goalId}`)
    }
  }

  // ── GOAL TASK LINKING ──────────────────────────────────────────────────────
  function linkGoalTask(date: string, goalTaskId: string) {
    const entry = getDay(date)
    const linked = entry.meta.linkedGoalTaskIds ?? []
    if (linked.includes(goalTaskId)) return
    upsertDay({ ...entry, meta: { ...entry.meta, linkedGoalTaskIds: [...linked, goalTaskId] } })
  }
  function unlinkGoalTask(date: string, goalTaskId: string) {
    const entry = getDay(date)
    const linked = (entry.meta.linkedGoalTaskIds ?? []).filter((id: string) => id !== goalTaskId)
    upsertDay({ ...entry, meta: { ...entry.meta, linkedGoalTaskIds: linked } })
  }

  // ── SUBTASK LINKING ───────────────────────────────────────────────────────
  function linkGoalSubtask(date: string, subtaskId: string) {
    const entry = getDay(date)
    const linked = entry.meta.linkedGoalSubtaskIds ?? []
    if (linked.includes(subtaskId)) return
    upsertDay({ ...entry, meta: { ...entry.meta, linkedGoalSubtaskIds: [...linked, subtaskId] } })
  }
  function unlinkGoalSubtask(date: string, subtaskId: string) {
    const entry = getDay(date)
    const linked = (entry.meta.linkedGoalSubtaskIds ?? []).filter((id: string) => id !== subtaskId)
    upsertDay({ ...entry, meta: { ...entry.meta, linkedGoalSubtaskIds: linked } })
  }
  function toggleGoalSubtask(goalId: string, taskId: string, subtaskId: string) {
    let updatedGoal: ShortGoal | undefined
    let updatedTask: Task | undefined
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g
      const tasks = g.tasks.map(t => {
        if (t.id !== taskId) return t
        const subtasks = (t.subtasks ?? []).map(s => s.id === subtaskId ? { ...s, done: !s.done, updated_at: now() } : s)
        // Parent task's updated_at bumps too so LWW carries the new subtask state.
        updatedTask = { ...t, subtasks, updated_at: now() }
        return updatedTask
      })
      updatedGoal = { ...g, tasks }
      return updatedGoal
    }))
    if (userId && updatedGoal) {
      markGoalDirty(goalId)
      trackWrite(upsertShortGoal(userId, updatedGoal), () => clearGoalDirty(goalId), `goal:${goalId}`)
      if (updatedTask) trackWrite(upsertTask(userId, updatedTask, goalId))
    }
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
    if (userId) {
      markWeeklyReviewDirty(weekKey)
      trackWrite(upsertWeeklyReview(userId, weekKey, content), () => clearWeeklyReviewDirty(weekKey), `weekly:${weekKey}`)
    }
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
