const assert = require('node:assert/strict')
const fs = require('node:fs'), ts = require('typescript')
const source = fs.readFileSync('src/components/today/TodayDashboard.tsx', 'utf8')
const discard = source.slice(source.indexOf('  function discardTask('), source.indexOf('  function setQuickProgress('))
const code = ts.transpileModule(discard, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
let task = { id: 't', done: true, progress_current: 3, progress_target: 5, start_time: '10:00', end_time: '11:00',
  actual_start_time: '10:05', actual_end_time: '11:05', actual_status: 'recorded', actual_duration_min: 60,
  actual_sessions: [{ id: 's', duration_min: 60 }], subtasks: [{ id: 'child', done: true, actual_status: 'recorded' }] }
const before = structuredClone(task)
const run = new Function('task', 'onUpdateTask', code + '\ndiscardTask(task)')
const update = (id, patch) => { assert.equal(id, task.id); task = { ...task, ...patch } }
run(task, update)
assert.deepEqual(task, { ...before, discarded: true }, 'discard preserves completed work, plans and actual sessions')
run(task, update)
assert.deepEqual(task, { ...before, discarded: false }, 'restore retains the same records without duplication')
console.log('PASS: discard and restore preserve all execution records')

const path = require('node:path'), cache = {}
function load(file) {
  if (cache[file]) return cache[file]
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(name => name.startsWith('@/') ? load(path.resolve('src', name.slice(2) + '.ts')) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name), module, module.exports)
  return cache[file] = module.exports
}
const { buildAiContextSnapshot } = load(path.resolve('src/lib/aiExport.ts'))
const exported = buildAiContextSnapshot({ days: [{ id: 'day', date: '2020-01-01', tasks: [{ ...before, discarded: true, category_name: 'Study' }], meta: {}, note: '' }], goals: [], routines: [], logs: [], longGoals: [], weeklyReviews: {} }, 'all')
assert.equal(exported.daily[0].tasks_total, 0)
assert.equal(exported.daily[0].actual_min, 60)
assert.equal(exported.overview.actual_task_min, 60)
assert.equal(exported.timeline[0].planned.length, 0)
assert.equal(exported.timeline[0].actual.length, 1, 'discarded sessions remain in exported actual timeline')
