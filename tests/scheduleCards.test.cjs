const assert = require('node:assert/strict')
const fs = require('fs'), path = require('path'), ts = require('typescript')
function load(file) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(name => name.startsWith('@/') ? load(path.resolve('src', name.slice(2) + '.ts')) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name), module, module.exports)
  return module.exports
}
const { scheduleCards, fourWeekCards, dependencyState } = load(path.resolve('src/lib/scheduleCards.ts'))
const { withShortGoalCategory } = load(path.resolve('src/lib/planCategory.ts'))
const { validateScheduleDetails } = load(path.resolve('src/lib/scheduleDetails.ts'))
const day = (date, tasks) => ({ date, tasks })
const task = (id, patch = {}) => ({ id, text: id, category_id: 'schedule', ...patch })
const cards = scheduleCards([
  day('2026-10-07', [task('prior', {done: true})]),
  day('2026-10-08', [task('exam', {done: true, schedule_details: {visibility: 'public', result: 'unknown'}}), task('deleted', {deleted_at: 1}), task('discarded', {discarded: true}), task('actual', {actual_only: true})]),
  day('2026-11-04', [task('last')]), day('2026-11-05', [task('outside')]),
], [{id:'ongoing',title:'ongoing',date_from:'2026-10-01',date_to:'2026-10-09',categories:[]}])
assert.deepEqual(fourWeekCards(cards, '2026-10-08').map(c => c.id), ['ongoing','exam','last'])
assert.equal(cards.find(c=>c.id==='exam').visibility, 'public')
const interview = { details: {dependencies:[{id:'exam',requirement:'passed'}]} }
assert.equal(dependencyState(interview,cards)[0].satisfied, false, 'attendance/completion must not imply passing')
cards.find(c=>c.id==='exam').details.result='passed'
assert.equal(dependencyState(interview,cards)[0].satisfied, true)
cards.find(c=>c.id==='exam').details.result='failed'
assert.equal(dependencyState(interview,cards)[0].failed, true)
assert.equal(dependencyState({details:{dependencies:[{id:'missing',requirement:'passed'}]}},cards)[0].satisfied, false)
assert.throws(()=>validateScheduleDetails({source_url:'javascript:alert(1)'}))
assert.throws(()=>validateScheduleDetails({next_steps:[{title:'면접',condition:'합격 후',date:'2026-02-30'}]}))
assert.deepEqual(validateScheduleDetails({next_steps:[{title:'면접',condition:'합격 후'}]}).next_steps[0],{title:'면접',condition:'합격 후'})
assert.equal(withShortGoalCategory([{id:'__schedule_details__',details:{visibility:'public',description:'keep'}}],'personal')[0].details.visibility,'private')
assert.equal(withShortGoalCategory([{id:'__schedule_details__',details:{visibility:'public',description:'keep'}}],'personal')[0].details.description,'keep')
const { getTaskDuration, getTaskStart, isFixedTask, remainingCapacity } = load(path.resolve('src/lib/plannerTime.ts'))
const deadline = task('cutoff',{category_id:'deadline',fixed:true,time:'10:00',duration_min:60})
assert.equal(getTaskDuration(deadline),0,'deadline never gets a 60-minute effort')
assert.equal(getTaskStart(deadline),null,'due time is not a timeline start')
assert.equal(isFixedTask(deadline),false)
assert.equal(remainingCapacity([deadline],'09:00','11:00').availableMinutes,120)
assert.equal(remainingCapacity([deadline],'09:00','11:00').flexibleMinutes,0)
const cutoffCards = scheduleCards([day('2026-10-16',[deadline])],[{id:'plan-cutoff',title:'개인 계획',date_from:'2026-10-01',date_to:'2026-10-20',categories:[{id:'__schedule_details__',details:{kind:'deadline'}}]}])
assert.equal(cutoffCards[0].kind,'deadline')
assert.equal(cutoffCards[0].details.due_time,'10:00','legacy due time preserved')
assert.equal(cutoffCards[1].from,'2026-10-20','plan deadline appears at its end date')
assert.deepEqual(fourWeekCards(cutoffCards,'2026-10-21'),[],'expired plan is not shown as ongoing deadline')
assert.throws(()=>validateScheduleDetails({kind:'deadline',due_time:'25:00'}))
console.log('PASS: 28-day boundaries, ongoing plans, hidden records, pass vs completion, missing dependencies, unsafe links, unknown dates')

const chainGoals = [
 {id:'root',title:'root',date_from:'2026-10-08',date_to:'2026-10-08',categories:[{id:'__schedule_details__',details:{timing:'undated',result:'failed'}}]},
 {id:'leaf',title:'leaf',date_from:'2026-10-08',date_to:'2026-10-08',categories:[{id:'__schedule_details__',details:{timing:'window',dependencies:[{id:'middle',requirement:'passed'}],result:'passed'}}]},
 {id:'middle',title:'middle',date_from:'2026-10-08',date_to:'2026-10-08',categories:[{id:'__schedule_details__',details:{timing:'undated',dependencies:[{id:'root',requirement:'passed'}]}}]},
 {id:'unrelated',title:'unrelated',date_from:'2026-10-08',date_to:'2026-10-08',categories:[]},
]
const failedChain = scheduleCards([],chainGoals)
assert.equal(failedChain.find(c=>c.id==='leaf').discardedBy,'root','failure reaches descendants regardless of ordering')
assert.deepEqual(fourWeekCards(failedChain,'2026-10-08').map(c=>c.id),['unrelated'])
assert.equal(dependencyState({details:{dependencies:[{id:'leaf',requirement:'passed'}]}},failedChain)[0].satisfied,false,'archived passed stage cannot satisfy next stage')
chainGoals[0].categories[0].details.result='unknown'
const restored = scheduleCards([],chainGoals)
assert.equal(restored.find(c=>c.id==='leaf').discardedBy,undefined,'correcting result restores descendants')
assert.ok(!fourWeekCards(restored,'2026-10-08').some(c=>c.id==='middle'),'undated cards never become appointments')
assert.throws(()=>validateScheduleDetails({timing:'guessed'}))
console.log('PASS: recursive failure, restoration, undated exclusion, archived prerequisite')
