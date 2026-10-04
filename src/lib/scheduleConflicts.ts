import type { DayEntry, Task } from '@/types'
import { SCHEDULE_CAT_ID, DEADLINE_CAT_ID } from '@/types'

export function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
export function validTime(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
}
export function shiftDate(date: string, offset: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10)
}
export function koreaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function minute(value: string) { const [h, m] = value.split(':').map(Number); return h * 60 + m }
export function eventWindow(date: string, task: Task): [number, number] | null {
  if (task.done || task.discarded || task.deleted_at || task.actual_only || task.category_id === DEADLINE_CAT_ID) return null
  if (task.category_id !== SCHEDULE_CAT_ID && !task.fixed) return null
  const start = task.start_time || task.time
  if (!validTime(start)) return null
  const end = task.end_time
  if (!validTime(end) && !(task.duration_min && task.duration_min > 0)) return null
  const base = Date.parse(`${date}T00:00:00Z`) / 60000
  const s = minute(start)
  let e = validTime(end) ? minute(end) : s + task.duration_min!
  if (validTime(end) && e <= s) e += 1440
  return [base + s, base + e]
}
export function findScheduleConflicts(days: Pick<DayEntry, 'date' | 'tasks'>[], candidate?: { date: string; task: Task }) {
  const events = days.flatMap(day => day.tasks.map(task => ({ date: day.date, task })))
  const pairs: { date: string; first: { id: string; text: string; date: string }; second: { id: string; text: string; date: string } }[] = []
  const source = candidate ? [candidate] : events
  for (let i = 0; i < source.length; i++) {
    const a = source[i], aw = eventWindow(a.date, a.task)
    if (!aw) continue
    for (let j = candidate ? 0 : i + 1; j < events.length; j++) {
      const b = events[j]
      if (a.task.id === b.task.id) continue
      const bw = eventWindow(b.date, b.task)
      if (bw && aw[0] < bw[1] && bw[0] < aw[1]) pairs.push({ date: a.date,
        first: { id: a.task.id, text: a.task.text, date: a.date }, second: { id: b.task.id, text: b.task.text, date: b.date } })
    }
  }
  return pairs
}
