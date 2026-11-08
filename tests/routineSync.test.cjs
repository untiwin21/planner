const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const m = { exports: {} }
const source = ts.transpileModule(fs.readFileSync('src/lib/routineSync.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
new Function('module', 'exports', source)(m, m.exports)
const { mergeRoutineSnapshot } = m.exports
const row = (id, bundle, updated_at = 1) => ({ id, name: id, config: { bundle }, status: 'active', updated_at })
const old = [row('old-morning', '모닝 루틴'), row('old-night', '나이트 루틴'), row('old-other', '')]
const current = [row('new-morning', '모닝루틴', 10), row('new-night', '나이트루틴', 10), row('new-super', '슈퍼커뮤니케이터', 10)]
assert.deepEqual(mergeRoutineSnapshot([...old, ...current], current, new Set()), current, 'reloading a stale cache removes deleted groups instead of keeping their rows')
assert.deepEqual(mergeRoutineSnapshot(old, [], new Set()), [], 'deleting every server routine also clears the client')
const offline = row('offline-new', '새 묶음', 20)
assert.deepEqual(mergeRoutineSnapshot([...old, offline], current, new Set(['offline-new'])), [offline, ...current], 'explicit unsaved offline creation is preserved')
assert.deepEqual(mergeRoutineSnapshot([], [old[0]], new Set(['old-morning'])), [], 'in-flight local deletion is never resurrected')
const edit = row('new-morning', '수정한 묶음', 30)
assert.deepEqual(mergeRoutineSnapshot([edit], current, new Set(['new-morning']))[0], edit, 'pending edits are retained')
assert.deepEqual(mergeRoutineSnapshot(current, current, new Set()), current, 'repeated refresh is stable')
console.log('PASS: deleted morning/night/other caches disappear, empty snapshots clear, offline edits survive, pending deletions stay deleted')
