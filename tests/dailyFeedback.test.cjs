const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function compile(file, req = require) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(req, module, module.exports)
  return module.exports
}
const lib = compile('src/lib/dailyFeedback.ts')
const ds = '2026-10-12'
const snapshot = { days: [{ date: ds, note: 'actual notes', tasks: [{ text: 'Study', done: false, history: [{ secret: 'audit' }], actual_duration_min: 30 }], meta: { assistantReview: { content: 'old feedback', updated_at: 17 }, review: { keep: 'kept' } } }], goals: [], routines: [], routine_logs: [] }
;(async () => {
  const input = lib.feedbackInput(snapshot, ds, '22:15')
  assert.equal(input.day.tasks[0].actual_duration_min, 30)
  assert.equal(input.day.tasks[0].done, false)
  assert.equal(input.day.review.keep, 'kept')
  assert.ok(!JSON.stringify(input).includes('audit'))
  assert.ok(!JSON.stringify(input).includes('old feedback'))
  const calls = []; let review = snapshot.days[0].meta.assistantReview
  const run = async (tool, args) => {
    calls.push({ tool, args })
    if (tool === 'planner_read') return { ...snapshot, days: [{ ...snapshot.days[0], meta: { ...snapshot.days[0].meta, assistantReview: review } }] }
    assert.equal(args.expected_updated_at, 17)
    review = { content: args.content, updated_at: 18 }
    return { saved: true, feedback: review }
  }
  assert.equal((await lib.saveDailyFeedback(run, ds, '22:15', async () => 'generated')).saved, true)
  assert.deepEqual(calls.map(c => c.tool), ['planner_read', 'planner_save_feedback', 'planner_read'])
  assert.ok(calls.filter(c => c.tool === 'planner_read').every(c => c.args.from === ds && c.args.to === ds))
  let generated = 0
  assert.equal((await lib.saveDailyFeedback(async () => ({ days: [] }), ds, '22:00', async () => { generated++; return 'bad' })).skipped, 'no_day_record')
  assert.equal(generated, 0)
  await assert.rejects(lib.saveDailyFeedback(async tool => tool === 'planner_read' ? snapshot : { saved: false }, ds, '22:00', async () => 'generated'), /save failed/)
  await assert.rejects(lib.saveDailyFeedback(async tool => {
    if (tool === 'planner_read') return snapshot
    throw new Error('concurrent edit')
  }, ds, '22:00', async () => 'generated'), /concurrent edit/)

  // Simulate database compare-and-swap: concurrent instances cannot both claim.
  let row = null
  const db = { from: () => {
    let mode = 'read', value, filters = []
    const q = { select: () => q, eq: (k,v) => { filters.push([k,v]); return q },
      maybeSingle: async () => ({ data: row ? { ...row } : null }),
      insert: v => { mode = 'insert'; value = v; return q },
      update: v => { mode = 'update'; value = v; return q },
      then: resolve => {
        if (mode === 'insert' && row) return Promise.resolve(resolve({ error: { code: '23505' } }))
        if (mode === 'update' && filters.some(([k,v]) => row?.[k] !== v)) return Promise.resolve(resolve({ data: [] }))
        row = { ...row, ...value }
        return Promise.resolve(resolve({ data: [{ id: row.id }] }))
      } }
    return q
  } }
  const claims = await Promise.all([lib.claimFeedback(db, 'owner', ds, 1), lib.claimFeedback(db, 'owner', ds, 1)])
  assert.equal(claims.filter(Boolean).length, 1)
  await claims.find(Boolean)('saved')
  assert.equal(JSON.parse(row.content).state, 'saved')
  assert.equal(await lib.claimFeedback(db, 'owner', ds, 100), null)
  assert.ok(await lib.claimFeedback(db, 'owner', '2026-10-13', 200))

  const oldFetch = global.fetch
  try {
    let body
    global.fetch = async (_url, options) => { body = JSON.parse(options.body); return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'valid' }] }] }) }
    assert.equal(await lib.generateFeedback(input, 'test-only', 'gpt-4.1-mini'), 'valid')
    assert.equal(body.store, false)
    assert.equal(body.max_output_tokens, 1800)
    global.fetch = async () => Response.json({ status: 'incomplete', output: [] })
    await assert.rejects(lib.generateFeedback(input, 'test-only', 'model'), /incomplete/)
    await assert.rejects(lib.generateFeedback('x'.repeat(45001), 'test-only', 'model'), /too large/)
  } finally { global.fetch = oldFetch }

  let dbCalls = 0
  const route = compile('src/app/api/cron/feedback/route.ts', name => {
    if (name === '@supabase/supabase-js') return { createClient: () => { dbCalls++; return {} } }
    if (name === '@/lib/dailyFeedback') return { ...lib, claimFeedback: async () => null }
    if (name === '@/lib/plannerAssistant') return { createAssistantRunner: () => {} }
    return require(name)
  })
  const request = (token = '', query = '') => new Request('https://planner.test/api/cron/feedback' + query, { headers: { Authorization: `Bearer ${token}` } })
  delete process.env.CRON_SECRET
  assert.equal((await route.GET(request())).status, 503)
  process.env.CRON_SECRET = 'x'.repeat(32)
  assert.equal((await route.GET(request('wrong'))).status, 401)
  assert.equal((await route.GET(request(process.env.CRON_SECRET, '?user_id=other'))).status, 400)
  assert.equal((await route.GET(request(process.env.CRON_SECRET))).status, 503)
  assert.equal(dbCalls, 0)
  Object.assign(process.env, { OPENAI_API_KEY: 'test-only', NEXT_PUBLIC_SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'test-only', PLANNER_ASSISTANT_USER_ID: '00000000-0000-4000-8000-000000000001' })
  const RealDate = Date
  try {
    global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ['2026-10-12T12:59:00Z'])) } }
    assert.equal((await (await route.GET(request(process.env.CRON_SECRET))).json()).skipped, 'before_daily_window')
    assert.equal(dbCalls, 0)
    global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ['2026-10-12T13:00:00Z'])) } }
    const response = await route.GET(request(process.env.CRON_SECRET))
    assert.equal((await response.json()).skipped, 'already_attempted_today')
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(dbCalls, 1)
  } finally { global.Date = RealDate }
  console.log('PASS: compact real records, read/save/verify, missing data, conflicts, durable daily lock, bounded generation, auth and Korea schedule')
})().catch(error => { console.error(error); process.exitCode = 1 })
