const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  ts = require('typescript'),
  { createHash } = require('node:crypto')
const owner = '00000000-0000-4000-8000-000000000001',
  other = '00000000-0000-4000-8000-000000000002',
  clone = (x) => JSON.parse(JSON.stringify(x))
let days = [
    {
      id: 'day-a',
      date: '2026-11-07',
      user_id: owner,
      note: 'private journal',
      meta: {
        sleep: 7,
        _tasks: [{ id: 'unrelated', text: 'Existing task', done: false, updated_at: 1 }]
      }
    }
  ],
  reviews = [
    {
      id: 'cats',
      user_id: owner,
      week_key: '__categories__',
      content: JSON.stringify([{ id: 'task', name: 'Task', color: 'blue' }])
    }
  ],
  race = null,
  failDate = null
const db = {
  auth: {
    getUser: async (token) => ({
      data: { user: { id: token === 'jwt-owner' ? owner : other } },
      error: null
    })
  },
  from(table) {
    let filters = [],
      mode = 'read',
      payload
    const q = {
      select() {
        return q
      },
      eq(k, v) {
        filters.push((x) => x[k] === v)
        return q
      },
      gte(k, v) {
        filters.push((x) => x[k] >= v)
        return q
      },
      lte(k, v) {
        filters.push((x) => x[k] <= v)
        return q
      },
      is(k, v) {
        return q.eq(k, v)
      },
      in(k, v) {
        filters.push((x) => v.includes(x[k]))
        return q
      },
      order() {
        return q
      },
      range() {
        return q
      },
      insert(v) {
        mode = 'insert'
        payload = v
        return q
      },
      delete() {
        mode = 'delete'
        return q
      },
      maybeSingle() {
        return q.then((r) => ({ ...r, data: r.data?.[0] ?? null }))
      },
      then(resolve, reject) {
        return Promise.resolve()
          .then(() => {
            const rows = table === 'day_entries' ? days : table === 'weekly_reviews' ? reviews : []
            const match = (x) => filters.every((f) => f(x))
            if (mode === 'insert') {
              if (payload.date === failDate)
                return { data: null, error: { message: 'private database error' } }
              if (
                (table === 'day_entries' &&
                  rows.some((x) => x.user_id === payload.user_id && x.date === payload.date)) ||
                (table === 'weekly_reviews' &&
                  rows.some(
                    (x) => x.user_id === payload.user_id && x.week_key === payload.week_key
                  ))
              )
                return { data: null, error: { code: '23505' } }
              rows.push(clone(payload))
              return { data: [], error: null }
            }
            if (mode === 'delete') {
              const keep = rows.filter((x) => !match(x))
              if (table === 'weekly_reviews') reviews = keep
              else days = keep
              return { data: [], error: null }
            }
            return { data: clone(rows.filter(match)), error: null }
          })
          .then(resolve, reject)
      }
    }
    return q
  },
  async rpc(name, p) {
    assert.equal(name, 'planner_compare_and_swap_day')
    assert.equal(p.p_user_id, owner)
    const row = days.find((x) => x.id === p.p_day_id && x.user_id === owner)
    if (race) {
      const f = race
      race = null
      f(row)
    }
    if (!row || JSON.stringify(row.meta) !== JSON.stringify(p.p_expected))
      return { data: [], error: null }
    row.meta = clone(p.p_next)
    return { data: [{ id: row.id }], error: null }
  }
}
function compile(file, req) {
  const m = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  new Function('require', 'module', 'exports', code)(req, m, m.exports)
  return m.exports
}
const helper = compile('src/lib/visionTaskSync.ts', (name) =>
  name === './plannerQueries' ? { legacyTasksFor: async () => [] } : require(name)
)
const planStore = compile('src/lib/visionPlanStore.ts', (name) =>
  name === './visionPlanMetrics.cjs' ? require('../src/lib/visionPlanMetrics.cjs') : require(name)
)
const route = compile('src/app/api/vision-tasks/route.ts', (name) =>
  name === '@supabase/supabase-js'
    ? { createClient: () => db }
    : name === '@/lib/visionTaskSync'
      ? helper
      : name === '@/lib/visionPlanStore'
        ? planStore
        : name === '@/lib/visionAssessmentRead'
          ? {
              readVisionAssessment: async (db, owner, cycleStart) => {
                assert.equal(owner, '00000000-0000-4000-8000-000000000001')
                if (!/^\d{4}-\d{2}-\d{2}$/.test(cycleStart)) throw new Error('Invalid cycle')
                return { version: 1, cycleStart, weeks: {} }
              }
            }
          : require(name)
)
const V = 'https://vision-board-navy.vercel.app',
  P = 'https://planner-kappa-two.vercel.app'
function req(body, token = 'jwt-owner', origin = V) {
  return new Request(P + '/api/vision-tasks', {
    method: 'POST',
    headers: {
      Origin: origin,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })
}
;(async () => {
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: 'https://db.test',
    SUPABASE_SERVICE_ROLE_KEY: 'secret',
    PLANNER_ASSISTANT_USER_ID: owner
  })
  assert.equal(
    (await route.POST(req({ op: 'connect' }, 'jwt-owner', 'https://evil.test'))).status,
    403
  )
  assert.equal((await route.POST(req({ op: 'connect' }, 'jwt-other', P))).status, 403)
  assert.equal(
    (await route.POST(req({ op: 'connect', user_id: other }, 'jwt-owner', P))).status,
    403
  )
  const connected = await route.POST(req({ op: 'connect' }, 'jwt-owner', P)),
    cap = await connected.json()
  assert.equal(connected.status, 200)
  assert.equal(cap.expiresAt, null)
  assert.match(cap.token, /^vt_[a-f0-9]{64}$/)
  assert.ok(!JSON.stringify(reviews).includes(cap.token), 'only hash is stored')
  assert.equal(
    (await route.POST(req({ op: 'read', from: '2026-11-07', to: '2026-11-08' }, 'invalid'))).status,
    401
  )
  const runner = helper.createVisionTaskSync(db, owner, {
      id: 'task',
      name: 'Task',
      color: 'blue'
    }),
    task = {
      id: 'local-a',
      title: 'Sync verification',
      date: '2026-11-07',
      previousDate: null,
      done: false,
      completedAt: null,
      dueDate: '2026-11-07',
      archived: false,
      expectedUpdatedAt: null,
      mutationId: 'm1'
    }
  race = (row) => row.meta._tasks.push({ id: 'concurrent', text: 'Concurrent unrelated task' })
  const first = await runner.sync(task)
  assert.equal(first.saved, true)
  assert.equal(days[0].note, 'private journal')
  assert.equal(days[0].meta.sleep, 7)
  assert.equal(
    days[0].meta._tasks.filter((t) => !t.id.startsWith(helper.VISION_TASK_PREFIX)).length,
    2
  )
  assert.ok(!first.task.start_time && !first.task.duration_min, 'no timeline invented')
  assert.equal((await runner.read('2026-11-07', '2026-11-08')).length, 1)
  assert.ok(
    !JSON.stringify(await runner.read('2026-11-07', '2026-11-08')).includes('private journal')
  )
  const retried = await runner.sync(task)
  assert.equal(retried.saved, true)
  assert.equal(
    days[0].meta._tasks.filter((t) => t.id.startsWith(helper.VISION_TASK_PREFIX)).length,
    1
  )
  const version = first.task.updatedAt,
    move = {
      ...task,
      date: '2026-11-08',
      previousDate: '2026-11-07',
      expectedUpdatedAt: version,
      mutationId: 'm2'
    }
  failDate = '2026-11-08'
  await assert.rejects(runner.sync(move))
  assert.equal(
    days[0].meta._tasks.find((t) => t.id.startsWith(helper.VISION_TASK_PREFIX)).deleted_at,
    undefined,
    'failed destination leaves original intact'
  )
  failDate = null
  const moved = await runner.sync(move)
  assert.equal(moved.saved, true)
  assert.equal(moved.task.date, '2026-11-08')
  assert.ok(days[0].meta._tasks.find((t) => t.id.startsWith(helper.VISION_TASK_PREFIX)).deleted_at)
  assert.equal((await runner.read('2026-11-07', '2026-11-08')).filter((t) => !t.archived).length, 1)
  const retryMove = await runner.sync(move)
  assert.equal(retryMove.saved, true)
  assert.equal((await runner.read('2026-11-07', '2026-11-08')).length, 1)
  const done = {
    ...move,
    date: '2026-11-08',
    previousDate: '2026-11-08',
    expectedUpdatedAt: moved.task.updatedAt,
    mutationId: 'm3',
    done: true,
    completedAt: '2026-11-08T14:59:59Z'
  }
  const completed = await runner.sync(done)
  assert.equal(completed.task.completedAt, done.completedAt)
  await assert.rejects(runner.sync({ ...done, title: 'stale' }), helper.VisionConflict)
  const hidden = await runner.sync({
    ...done,
    expectedUpdatedAt: completed.task.updatedAt,
    mutationId: 'm4',
    archived: true
  })
  assert.equal(hidden.task.archived, true)
  assert.equal(hidden.task.date, '2026-11-08')
  const restored = await runner.sync({
    ...done,
    expectedUpdatedAt: hidden.task.updatedAt,
    mutationId: 'm5'
  })
  assert.equal(restored.task.archived, false)
  const read = await route.POST(
    req({ op: 'read', from: '2026-11-07', to: '2026-11-08' }, cap.token)
  )
  assert.equal(read.status, 200)
  assert.equal((await read.json()).tasks.length, 1)
  assert.equal(read.headers.get('access-control-allow-origin'), V)
  assert.equal(
    (await route.POST(req({ op: 'sync', task: { ...task, user_id: other } }, cap.token))).status,
    400
  )
  assert.equal((await route.POST(req('x'.repeat(65537), cap.token))).status, 400)
  const missingPlan = await (await route.POST(req({ op: 'plan-read' }, cap.token))).json()
  assert.deepEqual(missingPlan, { revision: null, document: null })
  assert.equal((await route.POST(req({ op: 'plan-read' }, 'invalid'))).status, 401)
  assert.equal((await route.POST(req({ op: 'plan-read', user_id: other }, cap.token))).status, 400)
  assert.equal(
    (
      await route.POST(
        req({ op: 'plan-write', expectedRevision: null, requestId: 'bad', document: {} }, cap.token)
      )
    ).status,
    400
  )
  const planDoc = require('../src/lib/visionPlanMetrics.cjs').validate({
      kind: 'my-vision-plan-review',
      version: 2,
      cycleStart: '2026-11-09'
    }),
    requestId = require('node:crypto').randomUUID()
  planDoc.goals[0] = 'Manual Plan'
  const writePlan = await route.POST(
    req({ op: 'plan-write', expectedRevision: null, requestId, document: planDoc }, cap.token)
  )
  assert.equal(writePlan.status, 200)
  assert.equal((await writePlan.json()).saved, true)
  const readPlan = await (await route.POST(req({ op: 'plan-read' }, cap.token))).json()
  assert.equal(readPlan.document.goals[0], 'Manual Plan')
  assert.equal(readPlan.revision, requestId)
  assert.ok(!JSON.stringify(readPlan).includes('private journal'))
  const categoryResult = await (await route.POST(req({ op: 'categories' }, cap.token))).json()
  assert.equal(categoryResult.categories[0].id, 'task')
  assert.equal('tasks' in categoryResult, false)
  assert.ok(!JSON.stringify(categoryResult).includes('private journal'))
  const categoryRunner = helper.createVisionTaskSync(
    db,
    owner,
    { id: 'task', name: 'Task', color: 'blue' },
    [
      { id: 'task', name: 'Task', color: 'blue' },
      { id: 'study', name: 'Study', color: 'purple' }
    ]
  )
  const categoryTask = {
    ...task,
    id: 'category-test',
    date: '2026-11-09',
    categoryId: 'study',
    mutationId: 'cat-1'
  }
  const categorySaved = await categoryRunner.sync(categoryTask)
  assert.equal(categorySaved.task.categoryId, 'study')
  assert.equal(days.find((d) => d.date === '2026-11-09').meta._tasks[0].category_name, 'Study')
  const changedCategory = await categoryRunner.sync({
    ...categoryTask,
    categoryId: 'task',
    expectedUpdatedAt: categorySaved.task.updatedAt,
    mutationId: 'cat-2'
  })
  assert.equal(changedCategory.task.categoryId, 'task')
  await assert.rejects(
    categoryRunner.sync({
      ...categoryTask,
      categoryId: 'not-owned',
      expectedUpdatedAt: changedCategory.task.updatedAt,
      mutationId: 'cat-3'
    })
  )
  assert.equal(
    (await route.POST(req({ op: 'assessment-read', cycleStart: '2026-11-09' }, 'invalid'))).status,
    401
  )
  assert.equal(
    (
      await route.POST(
        req({ op: 'assessment-read', cycleStart: '2026-11-09', user_id: other }, cap.token)
      )
    ).status,
    400
  )
  const assessmentResponse = await route.POST(
    req({ op: 'assessment-read', cycleStart: '2026-11-09' }, cap.token)
  )
  assert.equal(assessmentResponse.status, 200)
  assert.ok(!JSON.stringify(await assessmentResponse.json()).includes('private journal'))

  // Hierarchy round-trip and safe conversion from existing standalone work.
  const firstLeaf = {
    ...task,
    id: 'bundle-leaf-a',
    date: '2026-11-10',
    dueDate: '2026-11-10',
    mutationId: 'leaf-a'
  }
  const secondLeaf = { ...firstLeaf, id: 'bundle-leaf-b', mutationId: 'leaf-b' }
  const savedA = await runner.sync(firstLeaf),
    savedB = await runner.sync(secondLeaf)
  const sourceDay = days.find((day) => day.date === '2026-11-10')
  const nativeA = sourceDay.meta._tasks.find(
    (item) => item.vision_plan?.client_id === 'bundle-leaf-a'
  )
  nativeA.duration_min = 45
  nativeA.actual_start_time = '09:00'
  nativeA.actual_end_time = '09:35'
  nativeA.actual_status = 'recorded'
  const bundle = {
    ...task,
    id: 'bundle-parent',
    title: 'Build robot node',
    date: '2026-11-11',
    dueDate: '2026-11-11',
    mutationId: 'bundle-1',
    subtasks: [
      {
        ...firstLeaf,
        date: '2026-11-11',
        previousDate: '2026-11-10',
        expectedUpdatedAt: savedA.task.updatedAt
      },
      {
        ...secondLeaf,
        date: '2026-11-11',
        previousDate: '2026-11-10',
        expectedUpdatedAt: savedB.task.updatedAt
      }
    ]
  }
  const groupSaved = await runner.sync(bundle)
  assert.equal(groupSaved.task.kind, 'task-group')
  assert.equal(groupSaved.task.subtasks.length, 2)
  assert.equal(groupSaved.task.migrationPending, false)
  assert.ok(sourceDay.meta._tasks.every((item) => item.deleted_at))
  const groupDay = days.find((day) => day.date === '2026-11-11')
  let nativeGroup = groupDay.meta._tasks.find(
    (item) => item.vision_plan?.client_id === 'bundle-parent'
  )
  assert.equal(nativeGroup.subtasks[0].duration_min, 45)
  assert.equal(nativeGroup.subtasks[0].actual_start_time, '09:00')
  assert.equal(nativeGroup.subtasks[0].actual_end_time, '09:35')
  const groupedRead = await runner.read('2026-11-10', '2026-11-11')
  assert.equal(groupedRead.length, 1)
  assert.equal(groupedRead[0].subtasks[0].id, 'bundle-leaf-a')
  assert.ok(!JSON.stringify(groupedRead).includes('actual_start_time'))
  const duplicateRetry = await runner.sync(bundle)
  assert.equal(duplicateRetry.task.updatedAt, groupSaved.task.updatedAt)
  assert.equal(groupDay.meta._tasks.filter((item) => !item.deleted_at).length, 1)
  nativeGroup = groupDay.meta._tasks.find((item) => item.vision_plan?.client_id === 'bundle-parent')
  nativeGroup.subtasks[0].done = true
  nativeGroup.subtasks[0].updated_at = Date.now() + 100
  nativeGroup.updated_at += 1000
  const nativeEdited = (await runner.read('2026-11-10', '2026-11-11'))[0]
  assert.equal(nativeEdited.subtasks[0].done, true)
  assert.ok(nativeEdited.subtasks[0].completedAt)
  await assert.rejects(
    runner.sync({
      ...bundle,
      mutationId: 'stale-group',
      expectedUpdatedAt: groupSaved.task.updatedAt
    }),
    helper.VisionConflict
  )
  const hiddenBundle = await runner.sync({
    ...bundle,
    date: null,
    previousDate: '2026-11-11',
    expectedUpdatedAt: nativeEdited.updatedAt,
    mutationId: 'bundle-hide',
    subtasks: nativeEdited.subtasks
      .map((child) => ({
        ...child,
        date: null,
        previousDate: '2026-11-11',
        expectedUpdatedAt: nativeEdited.updatedAt,
        mutationId: 'hidden-' + child.id,
        updatedAt: undefined,
        categoryId: undefined
      }))
      .map(({ updatedAt, categoryId, ...child }) => child)
  })
  assert.equal(hiddenBundle.task.archived, true)
  assert.equal(hiddenBundle.task.subtasks.length, 2)
  const restoredBundle = await runner.sync({
    ...bundle,
    previousDate: '2026-11-11',
    expectedUpdatedAt: hiddenBundle.task.updatedAt,
    mutationId: 'bundle-restore'
  })
  assert.equal(restoredBundle.task.archived, false)
  assert.equal(days[0].note, 'private journal')
  assert.equal(days[0].meta.sleep, 7)
  // A transient retirement failure leaves a retryable parent, never a duplicate final result.
  const migrationLeaf = {
    ...firstLeaf,
    id: 'retry-leaf',
    date: '2026-11-12',
    dueDate: '2026-11-12',
    mutationId: 'retry-leaf'
  }
  const migrationSaved = await runner.sync(migrationLeaf)
  const migrating = {
    ...task,
    id: 'retry-group',
    date: '2026-11-13',
    dueDate: '2026-11-13',
    mutationId: 'retry-group',
    subtasks: [
      {
        ...migrationLeaf,
        date: '2026-11-13',
        previousDate: '2026-11-12',
        expectedUpdatedAt: migrationSaved.task.updatedAt
      }
    ]
  }
  const originalRpc = db.rpc
  let failOnce = true
  db.rpc = async (...args) => {
    if (failOnce) {
      failOnce = false
      return { data: null, error: new Error('Transient database failure') }
    }
    return originalRpc(...args)
  }
  await assert.rejects(
    runner.sync(migrating),
    (error) => error instanceof helper.VisionConflict && error.partial
  )
  assert.equal((await runner.read('2026-11-12', '2026-11-13'))[0].migrationPending, true)
  const recovered = await runner.sync(migrating)
  assert.equal(recovered.task.migrationPending, false)
  assert.equal((await runner.read('2026-11-12', '2026-11-13')).length, 1)
  db.rpc = originalRpc
  assert.throws(() =>
    helper.validateVisionTask({ ...bundle, subtasks: [{ ...bundle.subtasks[0], subtasks: [] }] })
  )
  console.log(
    'PASS: native task/subtask hierarchy, standalone retirement, retained execution data, child completion, stale edits, hide/restore and retryable partial migrations'
  )
  const removed = await route.DELETE(
    new Request(P + '/api/vision-tasks', {
      method: 'DELETE',
      headers: { Origin: V, Authorization: 'Bearer ' + cap.token }
    })
  )
  assert.equal(removed.status, 200)
  assert.equal(
    (await route.POST(req({ op: 'read', from: '2026-11-07', to: '2026-11-08' }, cap.token))).status,
    401
  )
  console.log(
    'PASS: owner-only scoped auth, hash storage, origin/body allowlists, CAS preservation, idempotent retries, safe moves, completion timestamps, tombstones, restore, revocation and no timeline data'
  )
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
