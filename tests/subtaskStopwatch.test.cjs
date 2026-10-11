const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const source = fs.readFileSync('src/components/today/TaskExecutionLayer.tsx', 'utf8')
const helpers = source.slice(source.indexOf('function rangeMinutes('), source.indexOf('function formatMinutes(')) + source.slice(source.indexOf('function wallClock('), source.indexOf('export function TaskExecutionLayer'))
const finish = source.slice(source.indexOf('  async function finishSession()'), source.indexOf('  const elapsed = session'))
const code = ts.transpileModule(helpers + finish, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
async function record(task, session) {
  let days = [{ date: '2026-10-11', tasks: [task], meta: {} }]
  let active = session, alert, event
  const window = { localStorage: { setItem(key, value) { days = JSON.parse(value) } }, dispatchEvent(value) { event = value }, alert(value) { alert = value } }
  const run = new Function('session', 'saving', 'readDays', 'setSaving', 'setSession', 'writeSession', 'window', 'CustomEvent', 'uid', 'timeToMinutes', 'DAY_STORAGE_KEY', 'console', code + '\nreturn finishSession()')
  await run(session, false, () => days, () => {}, next => { active = next }, () => {}, window, class { constructor(type, value) { this.detail = value.detail } }, () => Math.random().toString(), value => value ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null, 'planr_days', { error() {} })
  return { task: days[0].tasks[0], active, alert, event }
}
const parent = { id: 'parent', text: 'AI 공부', done: false, subtasks: [{ id: 'a', text: '논문 읽기', done: false }, { id: 'b', text: '구현', done: false }], actual_duration_min: 5, actual_sessions: [{ id: 'old', duration_min: 5, source: 'stopwatch', started_at: '2026-10-11T00:00:00Z', ended_at: '2026-10-11T00:05:00Z' }] }
const session = { date: '2026-10-11', taskId: 'parent', subtaskId: 'a', text: '논문 읽기', running: false, segments: [{ startedAt: 1_000_000, endedAt: 1_600_000 }, { startedAt: 2_000_000, endedAt: 2_300_000 }] }
;(async () => {
  const first = await record(parent, session)
  assert.equal(first.task.actual_duration_min, 20, '15 active minutes plus existing 5; paused gap excluded')
  assert.equal(first.task.actual_sessions.length, 3)
  assert.deepEqual(first.task.actual_sessions.slice(1).map(s => s.subtask_id), ['a', 'a'])
  assert.equal(first.task.actual_sessions[1].subtask_text, '논문 읽기')
  assert.deepEqual(first.task.subtasks, parent.subtasks, 'child completion/manual times not overwritten')
  assert.equal(first.active, null)
  assert.equal(first.event.detail.durationMin, 15)
  const second = await record(first.task, { ...session, subtaskId: 'b', text: '구현' })
  assert.equal(second.task.actual_duration_min, 35, 'parent aggregates children once')
  assert.equal(second.task.actual_sessions.filter(s => s.subtask_id === 'a').reduce((sum, s) => sum + s.duration_min, 0), 15)
  assert.equal(second.task.actual_sessions.filter(s => s.subtask_id === 'b').length, 2)
  const legacy = await record(parent, { ...session, subtaskId: undefined })
  assert.equal(legacy.task.actual_sessions[1].subtask_id, undefined, 'old parent sessions still save')
  const missing = await record(parent, { ...session, subtaskId: 'removed' })
  assert.match(missing.alert, /삭제/)
  assert.equal(missing.active.subtaskId, 'removed', 'failed save keeps resumable session')
  assert.deepEqual(missing.task, parent)
  console.log('PASS: subtask attribution, pause gaps, repeated recording, single parent total, legacy sessions and deleted-child recovery')
})().catch(error => { console.error(error); process.exitCode = 1 })
