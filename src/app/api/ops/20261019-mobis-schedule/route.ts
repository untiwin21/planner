import { createClient } from '@supabase/supabase-js'
import { createAssistantRunner } from '@/lib/plannerAssistant'
import { authorizedAssistant } from '@/lib/assistantApiAuth'
import { withShortGoalCategory } from '@/lib/planCategory'
import { DETAILS_MARKER } from '@/lib/scheduleCards'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const operationTokenHash = '51fa2d8d631087b02d3016050c61a82572e3e3749bcce62e0e2e3f4de83541f8'
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers })
const checkedAt = '2026-10-19T10:00:00.000Z'

type Task = { id: string; text: string; updated_at: number; deleted_at?: number }
type Snapshot = { days: Array<{ date: string; tasks: Task[] }> }
type Goal = {
  id: string
  title: string
  date_from: string
  date_to: string
  categories?: Array<Record<string, any>>
}

const isHanwhaCoding = (title: string) =>
  /한화시스템/i.test(title) && /코딩\s*(?:테스트|test)/i.test(title)
const isMobisInterview = (title: string, round: '1' | '2') =>
  /현대모비스/i.test(title) && new RegExp(round + '\\s*차\\s*면접').test(title)

function categoriesFor(goal: Goal | undefined, details: Record<string, unknown>) {
  const base = withShortGoalCategory(goal?.categories ?? [], 'external').filter(item => item.id !== DETAILS_MARKER)
  const previous = goal?.categories?.find(item => item.id === DETAILS_MARKER)?.details ?? {}
  return [...base, { id: DETAILS_MARKER, details: { ...previous, ...details } }]
}

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

  try {
    const before = await run('planner_read', { from: '2026-10-19', to: '2026-11-30' }) as Snapshot

    const codingTasks = before.days.flatMap(day =>
      day.tasks.filter(task => !task.deleted_at && isHanwhaCoding(task.text)).map(task => ({ date: day.date, task })),
    )
    for (const item of codingTasks) {
      await run('planner_delete_task', {
        date: item.date,
        task_id: item.task.id,
        expected_updated_at: item.task.updated_at,
      })
    }

    const { data: allGoals, error: readError } = await client
      .from('short_goals').select('*').eq('user_id', owner)
    if (readError) throw new Error(readError.message)
    const goals = (allGoals ?? []) as Goal[]

    const codingGoals = goals.filter(goal => isHanwhaCoding(goal.title))
    for (const goal of codingGoals) {
      const { error } = await client.from('short_goals').delete()
        .eq('user_id', owner).eq('id', goal.id)
      if (error) throw new Error(error.message)
    }

    const firstExisting = goals.find(goal => isMobisInterview(goal.title, '1'))
    const secondExisting = goals.find(goal => isMobisInterview(goal.title, '2'))
    const screening = goals.find(goal =>
      /현대모비스/i.test(goal.title) && /(서류|AI역량|HMAT)/i.test(goal.title),
    )
    const firstId = firstExisting?.id ?? 'schedule-2026-mobis-interview1'
    const secondId = secondExisting?.id ?? 'schedule-2026-mobis-interview2'

    const firstDetails = {
      kind: 'event',
      timing: 'window',
      date_label: '10월 5주차',
      visibility: 'public',
      result: 'unknown',
      checked_at: checkedAt,
      description: '현대모비스 1차면접 예정. 정확한 날짜와 시간은 개인 안내 전 미정.',
      ...(firstExisting?.categories?.find(item => item.id === DETAILS_MARKER)?.details?.dependencies
        ? {}
        : screening ? { dependencies: [{ id: screening.id, requirement: 'passed' }] } : {}),
    }
    const secondDetails = {
      kind: 'event',
      timing: 'window',
      date_label: '11월 중순',
      visibility: 'public',
      result: 'unknown',
      checked_at: checkedAt,
      description: '현대모비스 2차면접 예정. 11월 중순으로만 안내되어 일정 미정 영역에 표시.',
      ...(secondExisting?.categories?.find(item => item.id === DETAILS_MARKER)?.details?.dependencies
        ? {}
        : { dependencies: [{ id: firstId, requirement: 'passed' }] }),
    }

    const first = {
      id: firstId,
      user_id: owner,
      title: '현대모비스 1차면접',
      date_from: '2026-10-26',
      date_to: '2026-11-01',
      note: '',
      tasks: [],
      routines: [],
      categories: categoriesFor(firstExisting, firstDetails),
      updated_at: Date.now(),
    }
    const second = {
      id: secondId,
      user_id: owner,
      title: '현대모비스 2차면접',
      date_from: '2026-11-09',
      date_to: '2026-11-22',
      note: '',
      tasks: [],
      routines: [],
      categories: categoriesFor(secondExisting, secondDetails),
      updated_at: Date.now() + 1,
    }
    const { error: firstError } = await client.from('short_goals').upsert(first, { onConflict: 'id' })
    if (firstError) throw new Error(firstError.message)
    const { error: secondError } = await client.from('short_goals').upsert(second, { onConflict: 'id' })
    if (secondError) throw new Error(secondError.message)

    const after = await run('planner_read', { from: '2026-10-19', to: '2026-11-30' }) as Snapshot
    const { data: verifiedGoals, error: verifyError } = await client
      .from('short_goals').select('*').eq('user_id', owner)
    if (verifyError) throw new Error(verifyError.message)
    const finalGoals = (verifiedGoals ?? []) as Goal[]
    const remainingCodingTasks = after.days.flatMap(day =>
      day.tasks.filter(task => !task.deleted_at && isHanwhaCoding(task.text)).map(task => ({ date: day.date, id: task.id, text: task.text })),
    )
    const remainingCodingGoals = finalGoals.filter(goal => isHanwhaCoding(goal.title))
    const savedFirst = finalGoals.find(goal => goal.id === firstId)
    const savedSecond = finalGoals.find(goal => goal.id === secondId)
    const firstDetailsSaved = savedFirst?.categories?.find(item => item.id === DETAILS_MARKER)?.details
    const secondDetailsSaved = savedSecond?.categories?.find(item => item.id === DETAILS_MARKER)?.details
    const saved = Boolean(
      savedFirst?.date_from === '2026-10-26' &&
      savedFirst?.date_to === '2026-11-01' &&
      firstDetailsSaved?.date_label === '10월 5주차' &&
      savedSecond?.date_from === '2026-11-09' &&
      savedSecond?.date_to === '2026-11-22' &&
      secondDetailsSaved?.date_label === '11월 중순' &&
      remainingCodingTasks.length === 0 &&
      remainingCodingGoals.length === 0
    )

    return reply({
      saved,
      deleted_hanwha_coding: { tasks: codingTasks.length, cards: codingGoals.length },
      mobis: [
        { id: savedFirst?.id, title: savedFirst?.title, date_from: savedFirst?.date_from, date_to: savedFirst?.date_to, timing: firstDetailsSaved?.timing, date_label: firstDetailsSaved?.date_label },
        { id: savedSecond?.id, title: savedSecond?.title, date_from: savedSecond?.date_from, date_to: savedSecond?.date_to, timing: secondDetailsSaved?.timing, date_label: secondDetailsSaved?.date_label },
      ],
      remaining_hanwha_coding: { tasks: remainingCodingTasks, cards: remainingCodingGoals.map(goal => ({ id: goal.id, title: goal.title })) },
    }, saved ? 200 : 409)
  } catch (error) {
    return reply({ error: 'Planner update failed.', detail: error instanceof Error ? error.message : 'unknown' }, 409)
  }
}
