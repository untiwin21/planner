import { createClient } from '@supabase/supabase-js'
import { createAssistantRunner } from '@/lib/plannerAssistant'
import { authorizedAssistant } from '@/lib/assistantApiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers })
const operationTokenHash = '3c2f34490d7900efecd41a6d5dffd297ae427e3f373b385d96817bfe92dfc0aa'

type Task = { id: string; text: string; updated_at: number; deleted_at?: number }
type Snapshot = {
  days: Array<{ date: string; tasks: Task[] }>
  goals: Array<{ id: string; title: string }>
  schedule_cards: Array<{ id: string; title: string; details?: { timing?: string; date_label?: string }; discardedBy?: string }>
}

const hyosung = (value: string) => /효성/i.test(value)
const robotSprint = (value: string) => /(?:^|\s)(?:로봇\s*)?sprint\s*[1-6](?:\b|\s|·)/i.test(value)

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
  const read = () => run('planner_read', { from: '2026-01-01', to: '2026-12-31' }) as Promise<Snapshot>
  const before = await read()

  const cards = before.goals.filter(card => hyosung(card.title) || robotSprint(card.title))
  if (cards.length) {
    const { error } = await client.from('short_goals').delete().eq('user_id', owner).in('id', cards.map(card => card.id))
    if (error) return reply({ error: 'Card deletion failed.' }, 500)
  }

  const deletedTasks: Array<{ date: string; id: string; text: string }> = []
  for (const day of before.days) {
    for (const task of day.tasks) {
      if (!task.deleted_at && (hyosung(task.text) || robotSprint(task.text))) {
        await run('planner_delete_task', {
          date: day.date, task_id: task.id, expected_updated_at: task.updated_at,
        })
        deletedTasks.push({ date: day.date, id: task.id, text: task.text })
      }
    }
  }

  const after = await read()
  const remaining = [
    ...after.goals.filter(card => hyosung(card.title) || robotSprint(card.title)).map(card => ({ type: 'card', id: card.id, title: card.title })),
    ...after.days.flatMap(day => day.tasks.filter(task => !task.deleted_at && (hyosung(task.text) || robotSprint(task.text))).map(task => ({ type: 'task', date: day.date, id: task.id, title: task.text }))),
  ]
  const weeklyWindows = after.schedule_cards.filter(card =>
    card.details?.timing === 'window' && !card.discardedBy &&
    (/\d{1,2}월\s*\d주차/.test(card.details.date_label ?? '') || /\d{1,2}\s*(?:\/|월\s*)\s*\d{1,2}/.test(card.details.date_label ?? ''))
  ).map(card => ({ id: card.id, title: card.title, date_label: card.details?.date_label }))

  return reply({
    saved: remaining.length === 0,
    deleted_cards: cards.map(card => ({ id: card.id, title: card.title })),
    deleted_tasks: deletedTasks,
    remaining,
    weekly_windows: weeklyWindows,
  }, remaining.length ? 409 : 200)
}
