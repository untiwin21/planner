import type { Routine } from '@/types'

/** A missing server routine is deleted, not a new item to import from an old cache. */
export function mergeRoutineSnapshot(local: Routine[], remote: Routine[], dirtyIds: ReadonlySet<string>): Routine[] {
  const localById = new Map(local.map(item => [item.id, item]))
  const merged = new Map(local.filter(item => dirtyIds.has(item.id)).map(item => [item.id, item]))
  for (const item of remote) {
    // A dirty ID with no local row represents an in-flight local deletion.
    if (dirtyIds.has(item.id)) continue
    const cached = localById.get(item.id)
    merged.set(item.id, cached && (cached.updated_at ?? 0) > (item.updated_at ?? 0) ? cached : item)
  }
  return [...merged.values()]
}
