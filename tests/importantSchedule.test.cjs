const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const mod = { exports: {} }
const code = ts.transpileModule(fs.readFileSync('src/lib/importantSchedule.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
new Function('require', 'module', 'exports', code)(() => ({ SCHEDULE_CAT_ID: 'schedule', DEADLINE_CAT_ID: 'deadline' }), mod, mod.exports)
const important = (text, patch = {}) => mod.exports.isImportantSchedule({ text, category_id: 'schedule', ...patch })
for (const text of ['신상윤 카공', 'ADAS 온라인 회의', 'LG CNS Fit Test', '포스코 인적성', '자료구조개론 중간고사', '면접']) assert.equal(important(text), true, text)
for (const text of ['인자셔틀', '비즈니스영어 수업', '자구개 출석체크', '모닝루틴', '과제 제출']) assert.equal(important(text), false, text)
assert.equal(important('사용자 지정 일정', { important: true }), true)
assert.equal(important('ADAS 회의', { important: false }), false)
assert.equal(important('ADAS 회의', { important: true, deleted_at: 1 }), false)
assert.equal(important('시험 준비', { category_id: 'work' }), false)
console.log('PASS: important commitments, ordinary events, explicit overrides and tombstones')
