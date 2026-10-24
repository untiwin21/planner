import type { Task, FocusSessionRecord } from '@/types'

/** Recover only a destructive discard recorded by the old client. Never replace newer execution. */
export function recoverDiscardedTime(task: Task, date: string): Task {
  if (task.deleted_at || task.actual_status || task.actual_duration_min !== undefined || task.actual_start_time || task.actual_end_time || task.actual_sessions?.length) throw new Error('현재 실제 기록을 덮어쓸 수 없습니다.')
  const history = task.history ?? []
  const index = history.findLastIndex(event => event.kind === 'discarded' && Number(event.before?.actual_min) > 0 && !event.after?.actual_min)
  if (index < 0 || history.slice(index + 1).some(event => event.kind !== 'restored')) throw new Error('안전하게 복구할 폐기 이력이 없습니다.')
  const snapshot = history[index].before!
  const total = Number(snapshot.actual_min)
  if (!Number.isFinite(total) || total <= 0) throw new Error('복구할 시간이 없습니다.')
  // Audit snapshots store counts, not raw sessions. Rebuild only single additions
  // extending the outer window, where the added interval is uniquely determined.
  const clock = (value: unknown) => typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN
  const instant = (minute: number) => new Date(Date.parse(`${date}T00:00:00+09:00`) + minute * 60000).toISOString()
  const sessions: FocusSessionRecord[] = []
  let previousTotal = 0, previousStart = Infinity, previousEnd = -Infinity
  for (const event of history.slice(0, index)) {
    if (event.kind !== 'actual_recorded') continue
    const state = event.after ?? {}
    const currentTotal = Number(state.actual_min), count = Number(state.actual_sessions)
    const start = clock(state.actual_start), end = clock(state.actual_end)
    const duration = currentTotal - previousTotal
    if (count !== sessions.length + 1 || !Number.isFinite(start + end + duration) || duration <= 0 || end <= start) throw new Error('세션 구간을 확정할 수 없습니다.')
    let addedStart: number
    if (!sessions.length && end - start === duration) addedStart = start
    else if (start < previousStart && end === previousEnd && start + duration <= previousStart) addedStart = start
    else if (start === previousStart && end > previousEnd && end - duration >= previousEnd) addedStart = end - duration
    else throw new Error('세션 구간을 확정할 수 없습니다.')
    sessions.push({ id: `recovered-${event.id}`, started_at: instant(addedStart), ended_at: instant(addedStart + duration), duration_min: duration, source: 'manual' })
    previousTotal = currentTotal; previousStart = start; previousEnd = end
  }
  if (previousTotal !== total || sessions.length !== snapshot.actual_sessions || previousStart !== clock(snapshot.actual_start) || previousEnd !== clock(snapshot.actual_end)) throw new Error('폐기 전 기록과 복구 결과가 일치하지 않습니다.')
  const updated_at = Math.max(Date.now(), (task.updated_at ?? 0) + 1)
  return { ...task, actual_status: 'recorded', actual_duration_min: total, actual_start_time: String(snapshot.actual_start), actual_end_time: String(snapshot.actual_end), actual_sessions: sessions, updated_at,
    history: [...history, { id: crypto.randomUUID(), at: new Date(updated_at).toISOString(), kind: 'actual_recorded', note: '폐기 오류로 지워진 시간을 수정 이력에서 복구. 세션 ID와 source는 복구용으로 재생성.', after: { actual_min: total, actual_sessions: sessions.length } }] }
}
