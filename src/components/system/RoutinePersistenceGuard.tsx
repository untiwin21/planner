'use client'

import { useEffect, useRef } from 'react'
import type { Routine } from '@/types'
import { upsertRoutine } from '@/lib/syncService'
import { supabase } from '@/lib/supabase'

const ROUTINE_STORAGE_KEY = 'planr_routines'
const CHECK_INTERVAL_MS = 300

function readCachedRoutines(): Routine[] {
  try {
    const raw = window.localStorage.getItem(ROUTINE_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function routineSignature(routine: Routine): string {
  return JSON.stringify({
    id: routine.id,
    name: routine.name,
    status: routine.status,
    time: routine.time ?? null,
    order: routine.order ?? null,
    period: routine.period ?? null,
    config: routine.config ?? null,
    updated_at: routine.updated_at ?? null,
  })
}

/**
 * Safety net for routine mutations.
 *
 * Some routine handlers optimistically update React state first. Under batched
 * rendering, the state-updater body is not guaranteed to run before the code
 * that starts the Supabase write, so the write can occasionally be skipped.
 * The UI then looks correct until the next periodic sync restores the older
 * server value.
 *
 * The local cache is already updated whenever the optimistic state commits.
 * This guard observes only changes that happen AFTER mount (the initial cache is
 * used as a baseline, so stale cached data is never pushed on page load) and
 * idempotently persists the newest routine object to Supabase.
 */
export function RoutinePersistenceGuard() {
  const signaturesRef = useRef<Map<string, string>>(new Map())
  const userIdRef = useRef<string | null>(null)
  const syncingRef = useRef(false)

  useEffect(() => {
    if (!supabase) return

    // Baseline only: do not push whatever happens to be cached on page load.
    signaturesRef.current = new Map(
      readCachedRoutines().map(routine => [routine.id, routineSignature(routine)]),
    )

    let cancelled = false

    async function getUserId() {
      if (userIdRef.current) return userIdRef.current
      const { data, error } = await supabase!.auth.getUser()
      if (error || !data.user) return null
      userIdRef.current = data.user.id
      return userIdRef.current
    }

    async function persistChangedRoutines() {
      if (cancelled || syncingRef.current) return

      const routines = readCachedRoutines()
      const changed = routines.filter(routine => {
        const signature = routineSignature(routine)
        return signaturesRef.current.get(routine.id) !== signature
      })
      if (changed.length === 0) return

      syncingRef.current = true
      try {
        const userId = await getUserId()
        if (!userId || cancelled) return

        for (const routine of changed) {
          try {
            await upsertRoutine(userId, routine)
            signaturesRef.current.set(routine.id, routineSignature(routine))
          } catch (error) {
            // Keep the old signature so the next pass retries this routine.
            console.warn('[Planr] routine persistence retry pending:', error)
          }
        }

        // Forget deleted routines without writing them back. Deletion has its own
        // explicit server path in the main store.
        const liveIds = new Set(routines.map(routine => routine.id))
        for (const id of Array.from(signaturesRef.current.keys())) {
          if (!liveIds.has(id)) signaturesRef.current.delete(id)
        }
      } finally {
        syncingRef.current = false
      }
    }

    const interval = window.setInterval(persistChangedRoutines, CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  return null
}
