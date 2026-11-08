const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const cache = new Map()
let states = [], cursor = 0
const fakeReact = { useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }] } }
function load(file) {
  if (cache.has(file)) return cache.get(file)
  const module = { exports: {} }
  cache.set(file, module.exports)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const req = name => {
    if (name === 'react') return fakeReact
    if (name.startsWith('@/')) {
      const base = path.resolve('src', name.slice(2))
      const target = ['.ts', '.tsx', '/index.tsx'].map(ext => base + ext).find(fs.existsSync)
      return load(target)
    }
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.tsx'))
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(req, module, module.exports)
  return module.exports
}
function nodes(element) {
  if (!element || typeof element !== 'object') return []
  if (Array.isArray(element)) return element.flatMap(nodes)
  return [element, ...nodes(element.props?.children)]
}
const { RoutineSidebar } = load(path.resolve('src/components/routine/RoutineSidebar.tsx'))
const { isRoutineScheduledOn } = load(path.resolve('src/lib/routineSchedule.ts'))
const routine = { id: 'r', name: '양치', status: 'active', created_at: '2026-11-08', config: { bundle: '아침', kind: 'check' } }
const group = { ...routine, id: 'g', name: '빈 묶음', config: { group_only: true, bundle: '빈 묶음', kind: 'check' } }
assert.equal(isRoutineScheduledOn(group, '2026-11-08'), false, 'group containers never count as executions')
assert.equal(isRoutineScheduledOn(routine, '2026-11-08'), true, 'legacy bundle routines remain scheduled')
let toggles = []
const props = { routines: [group, routine], logs: [], selectedDate: '2026-11-08', onToggleLog: (...args) => toggles.push(args) }
const render = () => { cursor = 0; return nodes(RoutineSidebar(props)) }
let tree = render()
assert.equal(tree.filter(node => node.props?.['aria-expanded'] === false).length, 2)
assert.equal(tree.some(node => node.props?.['aria-pressed'] !== undefined), false, 'children start hidden')
const headers = tree.filter(node => node.props?.['aria-expanded'] === false)
headers[1].props.onClick()
tree = render()
const child = tree.find(node => node.props?.['aria-pressed'] === false)
assert.ok(child, 'opening a category exposes its child checkbox')
child.props.onClick()
assert.deepEqual(toggles, [['r', '2026-11-08']], 'checkbox updates only the selected routine and date')
props.logs = [{ routine_id: 'r', date: '2026-11-08', done: true }]
assert.ok(render().some(node => node.props?.['aria-pressed'] === true))
render().find(node => node.props?.['aria-expanded'] === true).props.onClick()
assert.equal(render().some(node => node.props?.['aria-pressed'] !== undefined), false)
console.log('PASS: persisted empty groups excluded from scheduling, legacy compatibility, collapsed defaults, expansion, per-date completion and collapse')

const { RoutineManagerDialog } = load(path.resolve('src/components/routine/RoutineManagerDialog.tsx'))
states = []
const adds = [], patches = []
const managerProps = { routines: [routine], onAddRoutine: (...args) => adds.push(args), onUpdateRoutine: (...args) => patches.push(args), onClose() {}, onSetStatus() {}, onDeleteRoutine() {} }
const manager = () => { cursor = 0; return nodes(RoutineManagerDialog(managerProps)) }
const event = { preventDefault() {} }
manager().find(node => node.props?.['aria-label'] === '새 루틴 묶음 이름').props.onChange({ target: { value: '운동' } })
manager().find(node => node.type === 'form').props.onSubmit(event)
assert.equal(adds.length, 1)
assert.equal(adds[0][3].group_only, true, 'empty category is immediately persisted via the existing routine store')
assert.equal(adds[0][3].bundle, '운동')
manager().find(node => node.props?.['aria-label'] === '아침 이름 변경').props.onClick()
manager().find(node => node.props?.['aria-label'] === '묶음 이름 수정').props.onChange({ target: { value: '기상 준비' } })
manager().find(node => node.type === 'form' && nodes(node).some(child => child.props?.['aria-label'] === '묶음 이름 수정')).props.onSubmit(event)
assert.equal(patches[0][0], 'r')
assert.equal(patches[0][1].config.bundle, '기상 준비')
assert.equal(patches[0][1].config.kind, 'check', 'renaming preserves existing routine configuration')
console.log('PASS: category creation persists without children and category rename preserves child settings')
