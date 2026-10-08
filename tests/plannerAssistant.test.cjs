const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const path = require('node:path')
const cache = {}
let rows = [], legacy = [], routines = [], failure = null, race = null
const clone = value => JSON.parse(JSON.stringify(value))
const db = { auth: { getSession: async () => ({data:{session:{access_token:'test-session'}}}), getUser: async () => ({ data: { user: { id: 'owner' } } }) }, from(table) {
  let mode = 'read', payload, filters = []
  const q = {
    select() { return q }, eq(k, v) { filters.push([k, v]); return q }, is(k, v) { filters.push([k, v]); return q },
    insert(value) { mode = 'insert'; payload = value; return q }, update(value) { mode = 'update'; payload = value; return q },
    maybeSingle() { return q.then(result => ({ ...result, data: result.data?.[0] ?? null })) },
    then(resolve, reject) {
      return Promise.resolve().then(() => {
        if (failure) return { data: null, error: { message: failure } }
        let data = table === 'tasks' ? legacy : table === 'routines' ? routines : rows
        const match = row => filters.every(([k, v]) => k === 'meta' ? JSON.stringify(row.meta) === v : row[k] === v)
        if (mode === 'insert') {
          if (table === 'routines') {
            if (routines.some(row => row.id === payload.id)) return { data: null, error: { code: '23505' } }
            routines.push(clone(payload)); return { data: [], error: null }
          }
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
global.fetch = async (url, options) => {
  assert.equal(url, '/api/sync/day')
  const body = JSON.parse(options.body)
  if (race) { const action = race; race = null; action() }
  if (failure) return {ok:false,status:500}
  const row = rows.find(r => r.id === body.id && r.user_id === 'owner')
  const saved = !!row && JSON.stringify(row.meta) === JSON.stringify(body.expected)
  if (saved) { row.meta = clone(body.next); row.note = body.note }
  return {ok:true,json:async()=>({saved})}
}
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
const { runAssistantTool: run, createAssistantRunner } = load(path.resolve('src/lib/plannerAssistant.ts'))
const { findScheduleConflicts: conflicts, validDate } = load(path.resolve('src/lib/scheduleConflicts.ts'))
const { upsertDayEntry } = load(path.resolve('src/lib/syncService.ts'), true)
;(async () => {
  const morning = { routine_id: 'morning', name: '모닝루틴', start_time: '06:30', duration_min: 30, period: 'morning', description: '양치 → 머리 감기 → 외출복 환복 → 거실 스트레칭 & 명상' }
  await assert.rejects(run('planner_add_routine', { ...morning, duration_min: -1 }), /소요시간/)
  await assert.rejects(run('planner_add_routine', { ...morning, days_of_week: [7] }), /요일/)
  assert.equal(routines.length, 0)
  const savedRoutine = await run('planner_add_routine', morning)
  assert.equal(savedRoutine.saved, true)
  assert.equal(routines[0].user_id, 'owner')
  assert.deepEqual(routines[0].config.days_of_week, [0, 1, 2, 3, 4, 5, 6])
  assert.equal(routines[0].config.duration_min, 30)
  await assert.rejects(run('planner_add_routine', morning), /이미 등록/)
  assert.equal(routines.length, 1, 'retry never duplicates or overwrites an existing routine')
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
  failure = null
  const before = clone(rows.find(r => r.user_id === 'owner' && r.date === '2026-10-05'))
  const serverRun = createAssistantRunner(db, 'other-owner')
  delete global.window
  await serverRun('planner_save_task', { date: '2026-10-05', task_id: 'server-task', text: '서버 전용 항목', kind: 'schedule' })
  assert.deepEqual(rows.find(r => r.user_id === 'owner' && r.date === '2026-10-05'), before, 'injected account cannot change browser account')
  assert.equal(rows.find(r => r.user_id === 'other-owner').meta._tasks[0].id, 'server-task', 'server runner works without window')
  let rpcCalls = 0
  const rpcDb = { ...db, async rpc(name, args) {
    assert.equal(name, 'planner_compare_and_swap_day')
    assert.equal(typeof args.p_expected, 'object', 'snapshot travels as JSON body')
    rpcCalls++
    if (rpcCalls === 1) rows[0].meta.notes = ['concurrent note', 'x'.repeat(20000)]
    const row = rows.find(r => r.id === args.p_day_id && r.user_id === args.p_user_id)
    if (!row || JSON.stringify(row.meta) !== JSON.stringify(args.p_expected)) return { data: [], error: null }
    row.meta = clone(args.p_next)
    return { data: [{ id: row.id }], error: null }
  } }
  const bodyRun = createAssistantRunner(rpcDb, 'owner', undefined, true)
  await bodyRun('planner_save_task', { date: '2026-10-05', task_id: 'large-history', text: '본문 CAS', kind: 'deadline' })
  assert.equal(rpcCalls, 2, 'RPC CAS retries a concurrent edit')
  assert.equal(rows[0].meta.notes[0], 'concurrent note', 'large histories and concurrent notes are preserved')
  assert.ok(rows[0].meta._tasks.some(t => t.id === 'large-history'))
  const detailBase = { date: '2026-10-12', task_id: 'detail-test', text: '전형 상세', kind: 'schedule' }
  await assert.rejects(run('planner_save_task', { ...detailBase, schedule_details: {source_url:'javascript:alert(1)'} }), /원문 링크/)
  await assert.rejects(run('planner_save_task', { ...detailBase, schedule_details: {dependencies:[{id:'detail-test',requirement:'passed'}]} }), /자기 자신/)
  const detailed = await run('planner_save_task', { ...detailBase, schedule_details: {visibility:'public',description:'시험 안내',result:'unknown',next_steps:[{title:'면접 안내 확인',condition:'합격 후'}]} })
  assert.equal(detailed.saved, true)
  assert.equal(detailed.task.schedule_type, 'external')
  const updatedDetails = await run('planner_save_task', {date:detailBase.date,task_id:detailBase.task_id,expected_updated_at:detailed.task.updated_at,schedule_details:{result:'passed'}})
  assert.equal(updatedDetails.task.schedule_details.description,'시험 안내','partial monitoring updates preserve preparation details')
  assert.equal(updatedDetails.task.schedule_details.result,'passed')
  const verifiedDetails = await run('planner_read', {from:detailBase.date,to:detailBase.date})
  assert.deepEqual(verifiedDetails.days[0].tasks[0].schedule_details, updatedDetails.task.schedule_details, 'details survive actual saved record reload')
  const cutoff = await run('planner_save_task',{date:'2026-10-16',task_id:'cutoff-task',text:'HW 마감',kind:'deadline',start_time:'23:59'})
  assert.equal(cutoff.task.fixed,false)
  assert.equal(cutoff.task.start_time,undefined)
  assert.equal(cutoff.task.duration_min,undefined)
  assert.equal(cutoff.task.schedule_details.due_time,'23:59')
  const cutoffRead=await run('planner_read',{from:'2026-10-16',to:'2026-10-16'})
  assert.ok(cutoffRead.schedule_card_policy.deadline.includes('60분'))
  assert.equal(cutoffRead.days[0].tasks[0].schedule_details.due_time,'23:59')
  await assert.rejects(run('planner_save_task',{date:'2026-10-16',task_id:'bad-kind',text:'잘못된 마감',kind:'schedule',schedule_details:{kind:'deadline'}}),/일치/)
  console.log('PASS: conflict rejection, boundaries, midnight, stale edits, delete/restore, feedback, CAS retry, cross-device merge, legacy preservation, failed-save reporting')
})().catch(error => { console.error(error); process.exitCode = 1 })
