import { createClient } from '@supabase/supabase-js'
import { createAssistantRunner } from '@/lib/plannerAssistant'
import { authorizedAssistant } from '@/lib/assistantApiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const operationTokenHash = 'a1991c29d07bdd93102b3c2f444250f87e9b4b00b6bbfac1f728f01ece0a5fb6'
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers })

type Task = {
  id: string
  text: string
  updated_at: number
  deleted_at?: number
  done?: boolean
  important?: boolean
  start_time?: string
  end_time?: string
  time?: string
  schedule_details?: Record<string, unknown>
}
type Snapshot = { days: Array<{ date: string; tasks: Task[] }> }

const matches = (value: string) => /비즈니스\s*영어.*보고서.*마감/i.test(value)

export async function POST(request: Request) {
  if (!authorizedAssistant(request.headers.get('authorization'), operationTokenHash)) {
    return reply({ error: 'Unauthorized' }, 401)
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const owner = process.env.PLANNER_ASSISTANT_USER_ID
  if (!url || !key || !owner) return reply({ error: 'Planner server configuration is unavailable.' }, 503)

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const run = createAssistantRunner(client, owner, undefined, true)
  const read = () => run('planner_read', { from: '2026-10-18', to: '2026-10-24' }) as Promise<Snapshot>
  const targetDate = '2026-10-23'

  let snapshot = await read()
  const active = snapshot.days.flatMap(day =>
    day.tasks.filter(task => !task.deleted_at && matches(task.text)).map(task => ({ date: day.date, task })),
  )
  const existingTarget = active.find(item => item.date === targetDate)
  const source = existingTarget ?? active.find(item => item.date === '2026-10-19') ?? active[0]
  if (!source) return reply({ error: 'Target deadline was not found.' }, 404)

  const taskId = existingTarget?.task.id ?? source.task.id
  await run('planner_save_task', {
    date: targetDate,
    task_id: taskId,
    ...(existingTarget ? { expected_updated_at: existingTarget.task.updated_at } : {}),
    text: source.task.text,
    kind: 'deadline',
    ...(source.task.start_time || source.task.time ? { start_time: source.task.start_time ?? source.task.time } : {}),
    ...(source.task.end_time ? { end_time: source.task.end_time } : {}),
    done: source.task.done ?? false,
    important: source.task.important ?? true,
    ...(source.task.schedule_details ? { schedule_details: source.task.schedule_details } : {}),
  })

  snapshot = await read()
  const obsolete = snapshot.days.flatMap(day =>
    day.tasks
      .filter(task => !task.deleted_at && matches(task.text) && !(day.date === targetDate && task.id === taskId))
      .map(task => ({ date: day.date, task })),
  )
  for (const item of obsolete) {
    await run('planner_delete_task', {
      date: item.date,
      task_id: item.task.id,
      expected_updated_at: item.task.updated_at,
    })
  }

  const verified = await read()
  const remaining = verified.days.flatMap(day =>
    day.tasks.filter(task => !task.deleted_at && matches(task.text)).map(task => ({
      date: day.date,
      id: task.id,
      text: task.text,
      start_time: task.start_time ?? task.time,
    })),
  )
  return reply({
    saved: remaining.length === 1 && remaining[0].date === targetDate,
    deadline: remaining,
  })
}
