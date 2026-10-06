import type { DayMeta } from '@/types'
const maps = new Set(['routineTimes', 'routineActual'])
const internal = new Set(['updated_at', 'field_updated_at', '_tasks'])
const clock = (meta: DayMeta, key: string) => meta.field_updated_at ? (meta.field_updated_at[key] ?? 0) : (meta.updated_at ?? 0)

export function stampDayMeta(previous: DayMeta, next: DayMeta, at: number, noteChanged = false): DayMeta {
  const before = previous as unknown as Record<string, unknown>, after = next as unknown as Record<string, unknown>
  const clocks = { ...previous.field_updated_at }
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (internal.has(key)) continue
    if (maps.has(key)) {
      const a = (before[key] ?? {}) as Record<string, unknown>, b = (after[key] ?? {}) as Record<string, unknown>
      for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const path = `${key}/${id}`
        clocks[path] = JSON.stringify(a[id]) === JSON.stringify(b[id]) ? clock(previous, path) : at
      }
    } else clocks[key] = JSON.stringify(before[key]) === JSON.stringify(after[key]) ? clock(previous, key) : at
  }
  clocks.note = noteChanged ? at : clock(previous, 'note')
  return { ...next, field_updated_at: clocks, updated_at: at }
}

export function mergeDayMeta(local: DayMeta, remote: DayMeta): DayMeta {
  const l = local as unknown as Record<string, unknown>, r = remote as unknown as Record<string, unknown>
  const result: Record<string, unknown> = {}, clocks: Record<string, number> = {}
  const paths = new Set([...Object.keys(local.field_updated_at ?? {}), ...Object.keys(remote.field_updated_at ?? {})])
  for (const path of paths) clocks[path] = Math.max(clock(local, path), clock(remote, path))
  for (const key of new Set([...Object.keys(l), ...Object.keys(r)])) {
    if (internal.has(key)) continue
    if (maps.has(key)) {
      const a = (l[key] ?? {}) as Record<string, unknown>, b = (r[key] ?? {}) as Record<string, unknown>
      const values: Record<string, unknown> = {}
      const ids = new Set([...Object.keys(a), ...Object.keys(b), ...[...paths].filter(k => k.startsWith(`${key}/`)).map(k => k.slice(key.length + 1))])
      for (const id of ids) {
        const path = `${key}/${id}`, lt = clock(local, path), rt = clock(remote, path)
        const winner = rt >= lt ? b : a
        if (id in winner) values[id] = winner[id]
        clocks[path] = Math.max(lt, rt)
      }
      result[key] = values
    } else {
      const review = key === 'assistantReview' || key === 'jarvisReview'
      const lt = review ? (l[key] as {updated_at?:number})?.updated_at ?? 0 : clock(local, key)
      const rt = review ? (r[key] as {updated_at?:number})?.updated_at ?? 0 : clock(remote, key)
      const winner = rt >= lt ? r : l
      if (key in winner) result[key] = winner[key]
      clocks[key] = Math.max(lt, rt)
    }
  }
  clocks.note = Math.max(clock(local, 'note'), clock(remote, 'note'))
  return { ...result, field_updated_at: clocks, updated_at: Math.max(local.updated_at ?? 0, remote.updated_at ?? 0) } as unknown as DayMeta
}
export function localNoteIsNewer(local: DayMeta, remote: DayMeta): boolean {
  return clock(local, 'note') > clock(remote, 'note')
}
