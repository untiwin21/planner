import { createClient } from '@supabase/supabase-js'
import { createAssistantRunner } from '@/lib/plannerAssistant'
import { authorizedAssistant } from '@/lib/assistantApiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const operationTokenHash = 'd6b4c13ccb9e8edc42fa10b0dc2d10d3ea5dfc00ae6b1e7203f9c89cbd306027'
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers })

type Task = {
  id: string
  text: string
  updated_at: number
  deleted_at?: number
  important?: boolean
  schedule_details?: Record<string, unknown>
}
type Snapshot = {
  days: Array<{ date: string; tasks: Task[] }>
  goals: Array<{ id: string; title: string }>
}

const isHyosung = (value: string) => /효성|hyosung/i.test(value)
const isStudy = (value: string) => /AI\s*스터디\s*5회차/i.test(value)

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

  const { data: storedCards, error: cardReadError } = await client
    .from('short_goals').select('id,title').eq('user_id', owner)
  if (cardReadError) return reply({ error: 'Card read failed.' }, 500)
  const hyosungCards = (storedCards ?? []).filter(card => isHyosung(`${card.id} ${card.title}`))
  if (hyosungCards.length) {
    const { error } = await client.from('short_goals').delete().eq('user_id', owner)
      .in('id', hyosungCards.map(card => card.id))
    if (error) return reply({ error: 'Card deletion failed.' }, 500)
  }

  let snapshot = await read()
  const deletedHyosungTasks: Array<{ date: string; id: string; text: string }> = []
  for (const day of snapshot.days) {
    for (const task of day.tasks) {
      if (!task.deleted_at && isHyosung(`${task.id} ${task.text}`)) {
        await run('planner_delete_task', {
          date: day.date, task_id: task.id, expected_updated_at: task.updated_at,
        })
        deletedHyosungTasks.push({ date: day.date, id: task.id, text: task.text })
      }
    }
  }

  snapshot = await read()
  const candidates = snapshot.days.flatMap(day =>
    day.tasks.filter(task => !task.deleted_at && isStudy(task.text)).map(task => ({ date: day.date, task }))
  )
  const targetDate = '2026-10-24'
  const target = candidates.find(item => item.date === targetDate)
  const source = target ?? candidates[0]
  const taskId = target?.task.id ?? source?.task.id ?? 'chatgpt-20261024-ai-study-5'
  await run('planner_save_task', {
    date: targetDate,
    task_id: taskId,
    ...(target ? { expected_updated_at: target.task.updated_at } : {}),
    text: 'AI 스터디 5회차',
    kind: 'schedule',
    start_time: '23:00',
    end_time: '00:30',
    important: source?.task.important ?? true,
    schedule_details: {
      ...(source?.task.schedule_details ?? {}),
      kind: 'event',
      visibility: source?.task.schedule_details?.visibility ?? 'private',
      checked_at: new Date().toISOString(),
      description: '사용자 요청으로 10/17 13:00에서 다음 주 토요일 23:00로 이동. 90분 진행.',
    },
  })

  snapshot = await read()
  const oldStudyTasks = snapshot.days.flatMap(day =>
    day.tasks.filter(task => !task.deleted_at && isStudy(task.text) && !(day.date === targetDate && task.id === taskId))
      .map(task => ({ date: day.date, task }))
  )
  for (const item of oldStudyTasks) {
    await run('planner_delete_task', {
      date: item.date, task_id: item.task.id, expected_updated_at: item.task.updated_at,
    })
  }

  const verified = await read()
  const remainingHyosungCards = verified.goals.filter(card => isHyosung(`${card.id} ${card.title}`))
  const remainingHyosungTasks = verified.days.flatMap(day =>
    day.tasks.filter(task => !task.deleted_at && isHyosung(`${task.id} ${task.text}`))
      .map(task => ({ date: day.date, id: task.id, text: task.text }))
  )
  const studyTasks = verified.days.flatMap(day =>
    day.tasks.filter(task => !task.deleted_at && isStudy(task.text))
      .map(task => ({ date: day.date, id: task.id, text: task.text, start_time: (task as Task & { start_time?: string }).start_time, end_time: (task as Task & { end_time?: string }).end_time }))
  )
  return reply({
    saved: remainingHyosungCards.length === 0 && remainingHyosungTasks.length === 0 &&
      studyTasks.length === 1 && studyTasks[0].date === targetDate &&
      studyTasks[0].start_time === '23:00' && studyTasks[0].end_time === '00:30',
    deleted_hyosung_cards: hyosungCards,
    deleted_hyosung_tasks: deletedHyosungTasks,
    remaining_hyosung_cards: remainingHyosungCards,
    remaining_hyosung_tasks: remainingHyosungTasks,
    study_tasks: studyTasks,
  })
}
