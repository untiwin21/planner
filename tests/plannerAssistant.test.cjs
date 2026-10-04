const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const path = require('node:path')
const cache = {}
let rows = [], legacy = [], failure = null, race = null
const clone = value => JSON.parse(JSON.stringify(value))
const db = { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, from(table) {
  let mode = 'read', payload, filters = []
  const q = {
    select() { return q }, eq(k, v) { filters.push([k, v]); return q }, is(k, v) { filters.push([k, v]); return q },
    insert(value) { mode = 'insert'; payload = value; return q }, update(value) { mode = 'update'; payload = value; return q },
    maybeSingle() { return q.then(result => ({ ...result, data: result.data?.[0] ?? null })) },
    then(resolve, reject) {
      return Promise.resolve().then(() => {
        if (failure) return { data: null, error: { message: failure } }
        let data = table === 'tasks' ? legacy : rows
        const match = row => filters.every(([k, v]) => k === 'meta' ? JSON.stringify(row.meta) === v : row[k] === v)
        if (mode === 'insert') {
          if (rows.some(row => row.user_id === payload.user_id && row.date === payload.date)) return { data: null, error: { code: '23505' } }
          rows.push(clone(payload)); return { data: [], error: null }
        }
        if (mode === 'update' && race) { const action = race; race = null; action() }
        const found = data.filter(match)
        if (mode === 'update') found.forEach(row => Object.assign(row, clone(payload)))
        return { data: clone(found), error: null }
      }).then(resolve, reject)
    }
  }
  return q
} }
global.window = { dispatchEvent() {} }
const snapshot = async () => ({ days: rows.map(row => { const { _tasks = [], ...meta } = row.meta; return { ...row, meta, tasks: _tasks.filter(t => !t.deleted_at), task_tombstones: _tasks.filter(t => t.deleted_at), categories: [] } }), goals: [], routines: [], logs: [], longGoals: [], weeklyReviews: {} })
function load(file, realSync = false) {
  const key = file + realSync
  if (cache[key]) return cache[key]
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const req = name => {
    if (name === './supabase') return { supabase: db }
    if (name === './syncService' && !realSync) return { fetchAll: snapshot }
    const target = name.startsWith('@/') ? path.resolve('src', name.slice(2) + '.ts') : path.resolve(path.dirname(file), name + '.ts')
    return load(target, realSync)
  }
  new Function('require', 'module', 'exports', code)(req, module, module.exports)
  cache[key] = module.exports
  return module.exports
}
const { runAssistantTool: run } = load(path.resolve('src/lib/plannerAssistant.ts'))
const { findScheduleConflicts: conflicts, validDate } = load(path.resolve('src/lib/scheduleConflicts.ts'))
const { upsertDayEntry } = load(path.resolve('src/lib/syncService.ts'), true)
;(async () => {
  assert.equal(validDate('2026-02-30'), false)
  assert.equal(validDate('2026-10-04'), true)
  await run('planner_save_task', { date: '2026-10-05', task_id: 'a', text: '면접 A', kind: 'schedule', start_time: '10:00', end_time: '11:00' })
  assert.equal(rows[0].meta._tasks.length, 1)
  await assert.rejects(run('planner_save_task', { date: '2026-10-05', task_id: 'b', text: '면접 B', kind: 'schedule', start_time: '10:30', end_time: '11:30' }), /일정 겹침/)
  assert.equal(rows[0].meta._tasks.length, 1, 'conflict must not save')
  await run('planner_save_task', { date: '2026-10-05', task_id: 'b', text: '면접 B', kind: 'schedule', start_time: '11:00', end_time: '12:00' })
  assert.equal(conflicts((await snapshot()).days).length, 0, 'touching boundaries are not overlaps')
  await assert.rejects(run('planner_save_task', { date: '2026-10-05', task_id: 'a', text: 'stale', expected_updated_at: 0 }), /변경된/)
  let a = rows[0].meta._tasks.find(t => t.id === 'a')
  await run('planner_delete_task', { date: '2026-10-05', task_id: 'a', expected_updated_at: a.updated_at })
  a = rows[0].meta._tasks.find(t => t.id === 'a')
  assert.ok(a.deleted_at)
  await run('planner_restore_task', { date: '2026-10-05', task_id: 'a', expected_updated_at: a.updated_at })
  assert.equal(rows[0].meta._tasks.find(t => t.id === 'a').deleted_at, undefined)
  await run('planner_save_feedback', { date: '2026-10-05', content: '실제 기록 기반 피드백', expected_updated_at: 0 })
  assert.equal(rows[0].meta.assistantReview.source, 'chatgpt')
  assert.equal(rows[0].meta._tasks.length, 2, 'feedback preserves tasks')
  await run('planner_save_task', { date: '2026-10-06', task_id: 'night', text: '야간 일정', kind: 'schedule', start_time: '23:00', end_time: '01:00' })
  await assert.rejects(run('planner_save_task', { date: '2026-10-07', task_id: 'next', text: '다음 날', kind: 'schedule', start_time: '00:30', end_time: '02:00' }), /일정 겹침/)
  await run('planner_save_task', { date: '2026-10-05', task_id: 'deadline', text: '지원 마감', kind: 'deadline', start_time: '10:30' })
  const result = await run('planner_read', { from: '2026-10-05', to: '2026-10-07' })
  assert.equal(result.timezone, 'Asia/Seoul')
  assert.equal(result.days.length, 2)
  race = () => { rows[0].meta.condition = 5; rows[0].meta.updated_at = Date.now() }
  await run('planner_save_task', { date: '2026-10-05', task_id: 'race', text: '추가 일정', kind: 'schedule', start_time: '15:00', end_time: '16:00' })
  assert.equal(rows[0].meta.condition, 5, 'CAS retry preserves a concurrent wellness edit')
  const current = clone(rows[0]), oldTask = { ...current.meta._tasks[0], text: 'older task', updated_at: 0 }
  await upsertDayEntry('owner', { ...current, meta: { sleep: 480, condition: 1, focus: 1, top3: [], updated_at: 0 }, tasks: [oldTask], categories: [] })
  assert.equal(rows[0].meta._tasks.length, 4, 'stale browser keeps assistant-created tasks')
  assert.equal(rows[0].meta._tasks[0].text, '면접 A', 'stale task cannot overwrite newer edit')
  assert.equal(rows[0].meta.assistantReview.content, '실제 기록 기반 피드백')
  const row = { id: 'legacy-day', user_id: 'owner', date: '2026-10-08', note: '', meta: { sleep: null, condition: null, focus: null, top3: [] } }
  rows.push(row); legacy = [{ id: 'legacy-task', day_id: row.id, user_id: 'owner', goal_id: null, text: '기존 일정', category_id: 'schedule', updated_at: 1 }]
  await run('planner_save_task', { date: row.date, task_id: 'new-task', text: '신규 일정', kind: 'schedule' })
  assert.equal(row.meta._tasks.length, 2, 'legacy tasks remain on migration')
  failure = 'network unavailable'
  await assert.rejects(run('planner_save_feedback', { date: '2026-10-05', content: '실패', expected_updated_at: rows[0].meta.assistantReview.updated_at }), /network unavailable/)
  console.log('PASS: conflict rejection, boundaries, midnight, stale edits, delete/restore, feedback, CAS retry, cross-device merge, legacy preservation, failed-save reporting')
})().catch(error => { console.error(error); process.exitCode = 1 })
