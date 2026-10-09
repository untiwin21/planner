const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const moduleResult = { exports: {} }
new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('src/lib/authSession.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(require, moduleResult, moduleResult.exports)
const { watchAuthSession } = moduleResult.exports
const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture() {
  let resolve, reject, callback, calls = 0, unsubscribed = 0
  const pending = new Promise((yes, no) => { resolve = yes; reject = no })
  return { client: { auth: {
    getSession: () => { calls++; return pending },
    onAuthStateChange: fn => { callback = fn; fn('INITIAL_SESSION', { user: { id: 'initial' } }); return { data: { subscription: { unsubscribe: () => unsubscribed++ } } } },
  } }, resolve, reject, get callback() { return callback }, get calls() { return calls }, get unsubscribed() { return unsubscribed } }
}
;(async () => {
  let f = fixture(), sessions = [], errors = 0
  let stop = watchAuthSession(f.client, session => sessions.push(session), () => errors++, 100)
  assert.equal(f.callback, undefined, 'listener cannot race initial SDK recovery')
  f.resolve({ data: { session: { user: { id: 'boot' } } }, error: null }); await tick()
  f.callback('TOKEN_REFRESHED', { user: { id: 'refresh' } }); f.callback('SIGNED_OUT', null)
  assert.equal(f.calls, 1, 'auth events never re-enter getSession under lock')
  assert.equal(sessions.at(-1), null); assert.equal(errors, 0)
  stop(); assert.equal(f.unsubscribed, 1)
  f.callback('SIGNED_IN', { user: { id: 'late' } }); assert.equal(sessions.at(-1), null)
  f = fixture(); sessions = []; errors = 0
  stop = watchAuthSession(f.client, session => sessions.push(session), () => errors++, 5)
  await new Promise(resolve => setTimeout(resolve, 15)); assert.equal(errors, 1, 'hung initialization exits loading')
  f.resolve({ data: { session: null }, error: null }); await tick()
  assert.equal(sessions.length, 2, 'late recovery can return to normal signed-out UI'); stop()
  f = fixture(); errors = 0
  stop = watchAuthSession(f.client, () => assert.fail('rejection cannot authenticate'), () => errors++, 100)
  f.reject(new Error('network')); await tick(); assert.equal(errors, 1); stop()
  f = fixture(); errors = 0
  stop = watchAuthSession(f.client, () => assert.fail('SDK error cannot authenticate'), () => errors++, 100)
  f.resolve({ data: { session: null }, error: new Error('expired') }); await tick(); assert.equal(errors, 1); stop()
  f = fixture(); stop = watchAuthSession(f.client, () => assert.fail('unmounted callback'), () => assert.fail('unmounted error'), 5)
  stop(); f.resolve({ data: { session: null }, error: null }); await tick(); assert.equal(f.callback, undefined)
  console.log('PASS: initialization ordering, refresh/sign-out, no auth lock re-entry, timeout/late recovery, rejection, SDK errors, cleanup')
})().catch(error => { console.error(error); process.exitCode = 1 })
