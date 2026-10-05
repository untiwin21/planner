const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const { createHash } = require('node:crypto')
const token = 'A'.repeat(43)
const hash = createHash('sha256').update(token).digest('hex')
let calls = [], fail = false
function compile(file, req) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(req, module, module.exports)
  return module.exports
}
const auth = compile('src/lib/assistantApiAuth.ts', require)
const route = compile('src/app/api/assistant/route.ts', name => {
  if (name === '@/lib/assistantApiAuth') return auth
  if (name === '@supabase/supabase-js') return { createClient: () => ({}) }
  if (name === '@/lib/plannerAssistant') return {
    assistantTools: [{ name: 'planner_save_task', properties: { date: {}, task_id: {}, text: {}, kind: {}, category_id: {} } }],
    createAssistantRunner: (_client, owner) => async (tool, input) => {
      calls.push({ owner, tool, input })
      if (fail) throw new Error('private database credential')
      return { saved: true, date: input.date, task: { text: input.text } }
    },
  }
  throw new Error(name)
})
function request(body, credential = token) {
  return new Request('https://planner.test/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credential}` }, body: typeof body === 'string' ? body : JSON.stringify(body) })
}
;(async () => {
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PLANNER_ASSISTANT_USER_ID', 'PLANNER_ASSISTANT_TOKEN_SHA256']) delete process.env[key]
  assert.equal((await route.POST(request({}))).status, 503)
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'private', PLANNER_ASSISTANT_USER_ID: '00000000-0000-4000-8000-000000000001', PLANNER_ASSISTANT_TOKEN_SHA256: hash })
  assert.equal(auth.authorizedAssistant(`Bearer ${token}`, hash), true)
  assert.equal(auth.authorizedAssistant(`Bearer ${token}`, 'invalid'), false)
  assert.equal((await route.POST(request({}, 'B'.repeat(43)))).status, 401)
  const command = { tool: 'planner_save_task', input: { date: '2026-10-05', task_id: 'stable-id', text: '취업지원제도 신청', kind: 'task', category_id: 'existing-category' } }
  assert.equal((await route.POST(request({ ...command, input: { ...command.input, user_id: 'another-user' } }))).status, 400)
  assert.equal((await route.POST(request({ ...command, tool: 'arbitrary_sql' }))).status, 400)
  assert.equal((await route.POST(request('invalid JSON'))).status, 400)
  assert.equal((await route.POST(request('x'.repeat(65537)))).status, 413)
  assert.equal(calls.length, 0, 'rejected requests never reach database runner')
  const response = await route.POST(request(command))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).saved, true)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(calls[0].owner, process.env.PLANNER_ASSISTANT_USER_ID, 'owner is server configured')
  fail = true
  const error = await route.POST(request(command))
  assert.ok(!(await error.text()).includes('credential'), 'private error details never escape')
  assert.equal((await route.GET(new Request('https://planner.test/api/assistant'))).status, 401)
  console.log('PASS: fail-closed setup, bearer authentication, fixed owner, tool allowlist, body limit, secret-safe errors, no caching')
})().catch(error => { console.error(error); process.exitCode = 1 })
