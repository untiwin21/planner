import { createClient } from '@supabase/supabase-js'
import { createAssistantRunner } from '@/lib/plannerAssistant'
import { authorizedAssistant } from '@/lib/assistantApiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers })

// One-use operation credential. This route is removed immediately after verification.
const operationTokenHash = '4632804683e162a00e6c459bc9e7431a58a2a666689f7956520ba555373b9e6f'

type Task = Record<string, unknown> & { id: string; text: string; updated_at: number }
type Day = { date: string; tasks: Task[] }
type Goal = { id: string; title: string; categories: Array<Record<string, unknown>>; updated_at: number }
type Snapshot = { days: Day[]; goals: Goal[] }

const activeTask = (snapshot: Snapshot, date: string, matcher: string | RegExp) =>
  snapshot.days.find(day => day.date === date)?.tasks.find(task => {
    const matches = typeof matcher === 'string' ? task.text === matcher : matcher.test(task.text)
    return matches && !task.deleted_at
  })

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
  const completed: string[] = []
  const failures: Array<{ item: string; error: string }> = []
  const checkedAt = new Date().toISOString()

  async function step(item: string, operation: () => Promise<void>) {
    try {
      await operation()
      completed.push(item)
    } catch (error) {
      failures.push({ item, error: error instanceof Error ? error.message : 'unknown' })
    }
  }

  async function read(from = '2026-10-01', to = '2026-11-30') {
    return await run('planner_read', { from, to }) as Snapshot
  }

  async function ensureStatusCard(snapshot: Snapshot, args: {
    id: string
    title: string
    result: 'passed' | 'failed'
    sourceUrl?: string
    description: string
    nextSteps?: Array<{ title: string; condition: string }>
  }) {
    const existing = snapshot.goals.find(goal => goal.id === args.id)
    if (existing) {
      await run('planner_update_card_details', {
        card_id: existing.id,
        expected_categories: existing.categories,
        schedule_details: {
          result: args.result,
          checked_at: checkedAt,
          description: args.description,
          ...(args.sourceUrl ? { source_url: args.sourceUrl } : {}),
          ...(args.nextSteps ? { next_steps: args.nextSteps } : {}),
        },
      })
      return
    }
    await run('planner_add_schedule_card', {
      card_id: args.id,
      title: args.title,
      schedule_details: {
        kind: 'event', timing: 'undated', visibility: 'public', result: args.result,
        checked_at: checkedAt, description: args.description,
        ...(args.sourceUrl ? { source_url: args.sourceUrl } : {}),
        ...(args.nextSteps ? { next_steps: args.nextSteps } : {}),
      },
    })
  }

  let snapshot = await read()

  await step('우리맘 내원 이동', async () => {
    const source = activeTask(snapshot, '2026-10-16', '우리맘 내원')
    const target = activeTask(snapshot, '2026-10-23', '우리맘 내원')
    if (!target) {
      await run('planner_save_task', {
        date: '2026-10-23', task_id: 'chatgpt-20261023-woorimom-visit', text: '우리맘 내원', kind: 'schedule',
        start_time: '12:10', end_time: '12:40', important: Boolean(source?.important),
        schedule_details: {
          kind: 'event', timing: 'exact', visibility: 'private', checked_at: checkedAt,
          description: '10/16 일정을 다음 주 금요일 같은 시각으로 이동. 소요시간 30분.',
        },
      })
    }
    snapshot = await read('2026-10-16', '2026-10-23')
    const refreshedSource = activeTask(snapshot, '2026-10-16', '우리맘 내원')
    if (refreshedSource) {
      await run('planner_delete_task', {
        date: '2026-10-16', task_id: refreshedSource.id, expected_updated_at: refreshedSource.updated_at,
      })
    }
  })

  snapshot = await read()
  await step('ADAS 실험 보조', async () => {
    if (activeTask(snapshot, '2026-10-18', 'ADAS 실험 보조')) return
    await run('planner_save_task', {
      date: '2026-10-18', task_id: 'chatgpt-20261018-adas-experiment-assist', text: 'ADAS 실험 보조', kind: 'schedule',
      start_time: '13:00', end_time: '21:00', important: true,
      schedule_details: {
        kind: 'event', timing: 'exact', visibility: 'public', checked_at: checkedAt,
        description: '사용자 지정: 10/18 13:00~21:00 ADAS 실험 보조.',
      },
    })
  })

  snapshot = await read()
  await step('LG전자 불합격', async () => {
    const existing = snapshot.goals.find(goal => goal.id === 'schedule-2026-lge-screen-result')
      ?? snapshot.goals.find(goal => goal.title.includes('LG전자') && goal.title.includes('서류'))
    if (existing) {
      await run('planner_update_card_details', {
        card_id: existing.id,
        expected_categories: existing.categories,
        schedule_details: {
          result: 'failed', checked_at: checkedAt,
          source_url: 'https://mail.google.com/mail/u/0/#all/1a13e4486e67fb2c',
          description: '2026-10-15 결과 게시 안내 수신 후 사용자가 LG전자 서류 불합격을 직접 확인함.',
          next_steps: [],
        },
      })
    } else {
      await ensureStatusCard(snapshot, {
        id: 'recruit-lge-document-result-20261015', title: 'LG전자 서류전형 결과', result: 'failed',
        sourceUrl: 'https://mail.google.com/mail/u/0/#all/1a13e4486e67fb2c',
        description: '사용자가 LG전자 서류 불합격을 직접 확인함.',
      })
    }
  })

  snapshot = await read()
  await step('현대모비스 서류 합격', async () => {
    await ensureStatusCard(snapshot, {
      id: 'recruit-mobis-document-result-20261016', title: '현대모비스 로보틱스 연구직 서류전형 결과', result: 'passed',
      sourceUrl: 'https://mail.google.com/mail/u/0/#all/1a142a9f7c391d50',
      description: '현대모비스 로보틱스 연구직 서류 합격. AI역량검사와 HMAT 인성검사 I·II 응시 대상.',
      nextSteps: [{ title: 'AI역량검사와 HMAT 인성검사 I·II 완료', condition: '10/19 12:00까지 모두 응시' }],
    })
  })

  snapshot = await read()
  await step('현대모비스 AI역량검사 마감', async () => {
    if (activeTask(snapshot, '2026-10-19', /현대모비스 AI역량검사/)) return
    await run('planner_save_task', {
      date: '2026-10-19', task_id: 'recruit-mobis-ai-assessment-deadline-20261019',
      text: '현대모비스 AI역량검사 응시 마감', kind: 'deadline', start_time: '12:00', important: true,
      schedule_details: {
        kind: 'deadline', timing: 'exact', visibility: 'public', checked_at: checkedAt,
        source_url: 'https://mail.google.com/mail/u/0/#all/1a142a9f7c391d50',
        description: '응시 기간 10/16 12:00~10/19 12:00. 약 105분. 시작 후 중단 없이 완료해야 하며 JOBDA 결과 불러오기 불가.',
        preparation: ['최신 Chrome·유선 인터넷', '웹캠·마이크·이어폰', '사전 장비 점검'],
        dependencies: [{ id: 'recruit-mobis-document-result-20261016', requirement: 'passed' }],
      },
    })
  })

  snapshot = await read()
  await step('현대모비스 HMAT 마감', async () => {
    if (activeTask(snapshot, '2026-10-19', /현대모비스 HMAT/)) return
    await run('planner_save_task', {
      date: '2026-10-19', task_id: 'recruit-mobis-hmat-deadline-20261019',
      text: '현대모비스 HMAT 인성검사 I·II 응시 마감', kind: 'deadline', start_time: '12:00', important: true,
      schedule_details: {
        kind: 'deadline', timing: 'exact', visibility: 'public', checked_at: checkedAt,
        source_url: 'https://mail.google.com/mail/u/0/#all/1a142a9f7c391d50',
        description: '응시 기간 10/16 12:00~10/19 12:00. 검사 I 약 50분, 검사 II 약 45분.',
        preparation: ['이전 문항으로 돌아갈 수 없음', '페이지별 제한시간 확인'],
        dependencies: [{ id: 'recruit-mobis-document-result-20261016', requirement: 'passed' }],
      },
    })
  })

  snapshot = await read()
  await step('CJ대한통운 서류 합격', async () => {
    await ensureStatusCard(snapshot, {
      id: 'recruit-cjlogistics-document-result-20261016', title: 'CJ대한통운 패키징연구개발 서류전형 결과', result: 'passed',
      description: 'CJ대한통운 패키징연구개발(서울) 서류 합격. CAT·CFT·코딩TEST 응시 대상.',
      nextSteps: [{ title: '사전검사 2개 완료', condition: '10/22 23:59까지' }, { title: '온라인 TEST 응시', condition: '10/25 14:00~19:30' }],
    })
  })

  snapshot = await read()
  await step('CJ대한통운 인적성 사전점검 마감', async () => {
    if (activeTask(snapshot, '2026-10-22', /CJ대한통운.*인적성.*사전점검/)) return
    await run('planner_save_task', {
      date: '2026-10-22', task_id: 'recruit-cjlogistics-aptitude-precheck-20261022',
      text: 'CJ대한통운 인적성검사 사전점검 마감', kind: 'deadline', start_time: '23:59', important: true,
      schedule_details: {
        kind: 'deadline', timing: 'exact', visibility: 'public', checked_at: checkedAt,
        description: '10/19 00:00~10/22 23:59 사이 필수 완료. 코딩 모의TEST와 모두 완료해야 본검사 응시 가능.',
        preparation: ['응시자 가이드 숙지', '검사 프로그램 설치', '신분증 이미지 PC에 저장'],
        dependencies: [{ id: 'recruit-cjlogistics-document-result-20261016', requirement: 'passed' }],
      },
    })
  })

  snapshot = await read()
  await step('CJ대한통운 코딩 모의TEST 마감', async () => {
    if (activeTask(snapshot, '2026-10-22', /CJ대한통운.*코딩.*모의/)) return
    await run('planner_save_task', {
      date: '2026-10-22', task_id: 'recruit-cjlogistics-coding-mock-20261022',
      text: 'CJ대한통운 코딩 모의TEST 마감', kind: 'deadline', start_time: '23:59', important: true,
      schedule_details: {
        kind: 'deadline', timing: 'exact', visibility: 'public', checked_at: checkedAt,
        description: '10/19 00:00~10/22 23:59 사이 필수 완료. 인적성 사전점검과 모두 완료해야 본검사 응시 가능.',
        preparation: ['응시 페이지에서 지원 언어 확인', '체험하기 종료 버튼까지 눌러 완료'],
        dependencies: [{ id: 'recruit-cjlogistics-document-result-20261016', requirement: 'passed' }],
      },
    })
  })

  snapshot = await read()
  await step('CJ대한통운 온라인 TEST', async () => {
    const existing = activeTask(snapshot, '2026-10-25', /CJ대한통운.*(코딩|온라인).*TEST/i)
    await run('planner_save_task', {
      date: '2026-10-25', task_id: existing?.id ?? 'recruit-cjlogistics-online-test-20261025',
      ...(existing ? { expected_updated_at: existing.updated_at } : {}),
      text: 'CJ대한통운 온라인 TEST (CAT·CFT·코딩)', kind: 'schedule',
      start_time: '14:00', end_time: '19:30', important: true,
      schedule_details: {
        kind: 'event', timing: 'exact', visibility: 'public', checked_at: checkedAt,
        description: 'CAT·CFT 14:00~16:46(14:00~14:19:59 로그인), 코딩 페이지 접속 17:00~17:30, 코딩TEST 17:30~19:30. 17:40 이후 접속 불가.',
        preparation: ['사전 설치 프로그램 실행 후 대기', '규정 신분증 지참', '신분증 이미지 업로드', '네트워크·PC 환경 점검'],
        dependencies: [
          { id: 'recruit-cjlogistics-aptitude-precheck-20261022', requirement: 'completed' },
          { id: 'recruit-cjlogistics-coding-mock-20261022', requirement: 'completed' },
        ],
      },
    })
  })

  snapshot = await read()
  await step('한화시스템 서류 합격', async () => {
    await ensureStatusCard(snapshot, {
      id: 'recruit-hanwha-systems-document-result-20261016', title: '한화시스템 서류전형 결과', result: 'passed',
      description: '사용자가 2026-10-16 한화시스템 서류 합격을 확인함. 후속 전형의 날짜·시간은 아직 확인되지 않아 임의로 배정하지 않음.',
      nextSteps: [{ title: '한화시스템 후속 전형 안내 확인', condition: '개별 안내 도착 시 일정 확정' }],
    })
  })

  const verified = await read('2026-10-15', '2026-10-26')
  const schedules = verified.days.flatMap(day => day.tasks
    .filter(task => !task.deleted_at && /우리맘|ADAS 실험 보조|현대모비스|CJ대한통운/.test(task.text))
    .map(task => ({
      date: day.date, id: task.id, text: task.text,
      start_time: task.start_time ?? null, end_time: task.end_time ?? null,
      due_time: (task.schedule_details as Record<string, unknown> | undefined)?.due_time ?? null,
    })))
  const statusCards = verified.goals.filter(goal => /LG전자|현대모비스|CJ대한통운|한화시스템/.test(goal.title)).map(goal => {
    const details = goal.categories.find(category => category.id === '__schedule_details__')?.details as Record<string, unknown> | undefined
    return { id: goal.id, title: goal.title, result: details?.result ?? null }
  })

  return reply({
    saved: failures.length === 0,
    completed,
    failures,
    verification: {
      schedules,
      status_cards: statusCards,
      old_clinic_exists: Boolean(activeTask(verified, '2026-10-16', '우리맘 내원')),
    },
  }, failures.length ? 409 : 200)
}
