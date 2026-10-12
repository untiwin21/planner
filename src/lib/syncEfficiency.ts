// JSON object key order differs between Postgres jsonb and JavaScript objects.
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => sameJson(value, b[i]))
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>
  const keys = Object.keys(left).filter(key => left[key] !== undefined)
  return keys.length === Object.keys(right).filter(key => right[key] !== undefined).length && keys.every(key => sameJson(left[key], right[key]))
}

// Serialize writes per entity and collapse pending snapshots to the newest one.
// Every caller settles only after the snapshot covering its edit has persisted.
export function latestWriter<T>(write: (key: string, value: T) => Promise<void>) {
  type Pending = { value: T; waiters: { resolve: () => void; reject: (reason: unknown) => void }[] }
  const running = new Set<string>(), pending = new Map<string, Pending>()
  async function drain(key: string) {
    running.add(key)
    while (pending.has(key)) {
      const next = pending.get(key)!
      pending.delete(key)
      try { await write(key, next.value); next.waiters.forEach(w => w.resolve()) }
      catch (error) { next.waiters.forEach(w => w.reject(error)) }
    }
    running.delete(key)
  }
  return (key: string, value: T): Promise<void> => new Promise((resolve, reject) => {
    const next = pending.get(key) ?? { value, waiters: [] }
    next.value = value
    next.waiters.push({ resolve, reject })
    pending.set(key, next)
    if (!running.has(key)) void drain(key)
  })
}
