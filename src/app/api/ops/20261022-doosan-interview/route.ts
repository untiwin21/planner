import { createClient } from '@supabase/supabase-js'
import { createAssistantRunner } from '@/lib/plannerAssistant'
import { authorizedAssistant } from '@/lib/assistantApiAuth'
import { DETAILS_MARKER } from '@/lib/scheduleCards'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const operationTokenHash = '92bf75a20ebf8ad77ba61043bdeafa5ba0cb2bca840ada391eca93eefdaf9dc2'
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
  duration_min?: number
  category_id?: string
  schedule_details?: Record<string, unknown>
}
type Snapshot = { days: Array<{ date: string; tasks: Task[] }> }
type Goal = { id: string; title: string; categories?: Array<{ id: string; details?: Record<string, unknown> }> }

const isDoosan = (value: string) => /두산(?:에너빌리티)?|doosan/i.test(value)
const isDcat = (value: string) => /DCAT|종합\s*적성|인적성/i.test(value)
const isInterview = (value: string) => /실무\s*면접|1\s*차\s*면접/i.test(value)

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
  const read = () => run('planner_read', { from: '2026-10-01', to: '2026-11-30' }) as Promise<Snapshot>

  try {
    let snapshot = await read()
    const dcatTasks = snapshot.days.flatMap(day => day.tasks
      .filter(task => !task.deleted_at && isDoosan(task.text) && isDcat(task.text))
      .map(task => ({ date: day.date, task })))

    for (const { date, task } of dcatTasks) {
      await run('planner_save_task', {
        date,
        task_id: task.id,
        expected_updated_at: task.updated_at,
        text: task.text,
        kind: task.category_id === 'deadline' ? 'deadline' : 'schedule',
        ...(task.start_time ? { start_time: task.start_time } : {}),
        ...(task.end_time ? { end_time: task.end_time } : {}),
        ...(task.duration_min ? { duration_min: task.duration_min } : {}),
        done: true,
        important: task.important ?? true,
        schedule_details: {
          ...(task.schedule_details ?? {}),
          kind: task.category_id === 'deadline' ? 'deadline' : 'event',
          result: 'passed',
          checked_at: '2026-10-22T00:00:00.000Z',
          description: '두산 종합적성검사(DCAT) 합격. 다음 전형은 오프라인 실무면접.',
        },
      })
    }

    const { data: allGoals, error: goalReadError } = await client
      .from('short_goals').select('*').eq('user_id', owner)
    if (goalReadError) throw new Error(goalReadError.message)
    const obsoleteGoals = ((allGoals ?? []) as Goal[]).filter(goal => {
      const details = goal.categories?.find(category => category.id === DETAILS_MARKER)?.details
      return isDoosan(goal.title) && isInterview(goal.title) && details?.timing !== 'exact'
    })
    for (const goal of obsoleteGoals) {
      const { error } = await client.from('short_goals').delete().eq('user_id', owner).eq('id', goal.id)
      if (error) throw new Error(error.message)
    }

    snapshot = await read()
    const interviewMatches = snapshot.days.flatMap(day => day.tasks
      .filter(task => !task.deleted_at && isDoosan(task.text) && isInterview(task.text))
      .map(task => ({ date: day.date, task })))
    const targetDate = '2026-10-30'
    const target = interviewMatches.find(item => item.date === targetDate)
    const taskId = target?.task.id ?? 'chatgpt-20261030-doosan-practical-interview'

    await run('planner_save_task', {
      date: targetDate,
      task_id: taskId,
      ...(target ? { expected_updated_at: target.task.updated_at } : {}),
      text: '두산에너빌리티 실무면접 (07:30 도착)',
      kind: 'schedule',
      start_time: '07:30',
      important: true,
      schedule_details: {
        ...(target?.task.schedule_details ?? {}),
        kind: 'event',
        timing: 'exact',
        visibility: 'public',
        result: 'unknown',
        checked_at: '2026-10-22T00:00:00.000Z',
        description: '분당두산타워 S동 2층. SI(인성), DISE(과제 풀이·PT), AI 역량 Test 진행. 면접 종료 시각은 안내되지 않음. R&D 석사 이상 선발분야만 전문성 면접 대상.',
        preparation: [
          '단색 정장·구두·넥타이 착용',
          '재학증명서 또는 졸업(예정)증명서 1부',
          '해당 시 국가자격증 증빙(원본대조 후 사본)',
          '해당 시 국가보훈·장애인 증빙서류',
        ],
      },
    })

    snapshot = await read()
    const obsoleteTasks = snapshot.days.flatMap(day => day.tasks
      .filter(task => !task.deleted_at && isDoosan(task.text) && isInterview(task.text) && !(day.date === targetDate && task.id === taskId))
      .map(task => ({ date: day.date, task })))
    for (const { date, task } of obsoleteTasks) {
      await run('planner_delete_task', { date, task_id: task.id, expected_updated_at: task.updated_at })
    }

    const verified = await read()
    const interviews = verified.days.flatMap(day => day.tasks
      .filter(task => !task.deleted_at && isDoosan(task.text) && isInterview(task.text))
      .map(task => ({
        date: day.date,
        id: task.id,
        text: task.text,
        start_time: task.start_time,
        end_time: task.end_time,
        visibility: task.schedule_details?.visibility,
      })))
    const passedDcat = verified.days.flatMap(day => day.tasks
      .filter(task => !task.deleted_at && isDoosan(task.text) && isDcat(task.text) && task.schedule_details?.result === 'passed')
      .map(task => ({ date: day.date, id: task.id, text: task.text, done: task.done })))
    const saved = interviews.length === 1 && interviews[0].date === targetDate &&
      interviews[0].start_time === '07:30' && interviews[0].end_time === undefined &&
      interviews[0].visibility === 'public' && passedDcat.length === dcatTasks.length

    return reply({
      saved,
      dcat_updated: passedDcat,
      interview: interviews,
      removed_window_cards: obsoleteGoals.map(goal => ({ id: goal.id, title: goal.title })),
      removed_duplicate_tasks: obsoleteTasks.map(item => ({ date: item.date, id: item.task.id, text: item.task.text })),
    }, saved ? 200 : 409)
  } catch (error) {
    return reply({ error: 'Planner update failed.', detail: error instanceof Error ? error.message : 'unknown' }, 409)
  }
}
