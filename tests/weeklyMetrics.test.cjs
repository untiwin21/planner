const assert = require('node:assert/strict')
const fs = require('node:fs'), ts = require('typescript'), path = require('node:path')
const cache = {}
function load(file) {
  if (cache[file]) return cache[file]
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(name => name === '@/types' ? { SCHEDULE_CAT_ID: 'schedule', DEADLINE_CAT_ID: 'deadline' } : load(name.startsWith('@/') ? path.resolve('src', name.slice(2) + '.ts') : path.resolve(path.dirname(file), name + '.ts')), module, module.exports)
  return cache[file] = module.exports
}
const { weeklyMetrics, actualMinutes } = load(path.resolve('src/lib/weeklyMetrics.ts'))
const task = (id, patch = {}) => ({ id, text: id, category_id: 'study', category_name: 'Study', done: true, duration_min: 60, ...patch })
const day = (date, tasks, meta = {}) => ({ date, tasks, meta: { sleep: null, condition: null, focus: null, ...meta } })
const sessionTask = task('sessions', { actual_sessions: [{ duration_min: 20 }, { duration_min: 40 }], actual_duration_min: 60, actual_status: 'recorded', actual_start_time: '10:00', actual_end_time: '11:30' })
assert.equal(actualMinutes(sessionTask), 60, 'sessions override aggregate and elapsed window; never double-count')
assert.equal(actualMinutes(task('midnight', { actual_status: 'recorded', actual_start_time: '23:30', actual_end_time: '00:30' })), 60)
assert.equal(actualMinutes(task('unrecorded')), null, 'estimates and done flags never become actual time')
const rows = [day('2026-10-05', [sessionTask, task('life', { category_name: 'Life', actual_duration_min: 120 }), task('schedule', { category_id: 'schedule', actual_duration_min: 80 }), task('deleted', { deleted_at: 1, actual_duration_min: 100 })], { sleep: 480, condition: 4 }), day('2026-10-06', [task('unfinished', { done: false }), task('actual-only', { actual_only: true, category_name: 'Work', actual_duration_min: 30 }), task('calibration', { actual_duration_min: 120 })], { sleep: 420, condition: 2 }), day('2026-10-08', [task('future', { actual_duration_min: 500 })], { sleep: 600 })]
const stats = weeklyMetrics(['2026-10-05','2026-10-06','2026-10-07','2026-10-08'], rows, '2026-10-07')
assert.equal(stats.sleepMean, 7.5)
assert.equal(stats.conditionMedian, 3)
assert.equal(stats.focusHours, 3.5, 'Study and Work actual only, not Life or schedules or deleted')
assert.equal(stats.completion, 75, 'pool tasks: three done / four planned; schedules and actual-only excluded')
assert.equal(stats.calibrationCount, 3)
assert.equal(stats.calibrationMedian, 200, 'completed planned tasks with actual + explicit estimate only')
assert.equal(stats.rows[2].focusHours, null)
assert.equal(stats.rows[3].completion, null)
assert.equal(stats.rows[3].sleep, null, 'future entries never affect this week to date')
assert.equal(weeklyMetrics(['2026-10-07'], [], '2026-10-07').completion, null)
const linked = weeklyMetrics(['2026-10-07'], [day('2026-10-07', [], { linkedGoalTaskIds: ['linked'] })], '2026-10-07', [{ date_from: '2026-10-05', date_to: '2026-10-11', tasks: [task('linked', { actual_duration_min: 90 })] }])
assert.equal(linked.focusHours, 1.5, 'linked goal execution participates in day totals')
assert.equal(linked.completion, 100)
console.log('PASS: explicit execution, category scope, session deduplication, midnight, missing/future data, weighted completion and calibration')
