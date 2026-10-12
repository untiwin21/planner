const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const cache = new Map(), queries = []
let tables = {}, fail = false, transferred = 0
const db = { from(table) {
  let selection = '*', filters = [], offset = 0, end = Infinity
  const query = {
    select(value) { selection = value; return query },
    eq(key, value) { filters.push(row => row[key] === value); return query },
    is(key, value) { return query.eq(key, value) },
    in(key, values) { filters.push(row => values.includes(row[key])); return query },
    gte(key, value) { filters.push(row => row[key] >= value); return query },
    lte(key, value) { filters.push(row => row[key] <= value); return query },
    contains(key, value) { filters.push(row => row[key]?._tasks?.some(task => task.id === value._tasks[0].id)); return query },
    order() { return query }, range(start, stop) { offset = start; end = stop; return query },
    maybeSingle() { return query.then(result => ({ ...result, data: result.data?.[0] ?? null })) },
    then(resolve, reject) { return Promise.resolve().then(() => {
      queries.push({ table, selection, offset })
      if (fail) return { data: null, error: { message: 'test outage' } }
      const data = (tables[table] ?? []).filter(row => filters.every(test => test(row))).sort((a,b) => a.id.localeCompare(b.id)).slice(offset, end + 1).map(row => {
        if (selection === '*') return row
        if (selection.includes('records:meta->_tasks')) return { id: row.id, date: row.date, records: row.meta?._tasks ?? null }
        return Object.fromEntries(selection.split(',').map(key => [key, row[key]]))
      })
      transferred += Buffer.byteLength(JSON.stringify(data))
      return { data: structuredClone(data), error: null }
    }).then(resolve,reject) },
  }
  return query
} }
function load(file) {
  file = path.resolve(file)
  if (cache.has(file)) return cache.get(file)
  const m = { exports: {} }
  const req = name => name === './supabase' ? { supabase: db } : load(name.startsWith('@/') ? `src/${name.slice(2)}.ts` : path.resolve(path.dirname(file), `${name}.ts`))
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require','module','exports', code)(req,m,m.exports)
  cache.set(file,m.exports)
  return m.exports
}
const { latestWriter, sameJson } = load('src/lib/syncEfficiency.ts')
const { fetchAll } = load('src/lib/syncService.ts')
const { fetchCategories } = load('src/lib/plannerQueries.ts')
const { createAssistantRunner } = load('src/lib/plannerAssistant.ts')
const { findScheduleConflicts } = load('src/lib/scheduleConflicts.ts')
const task = (id, extra = {}) => ({ id, text: id, category_id: 'schedule', done: false, start_time: '10:00', end_time: '11:00', updated_at: 1, ...extra })
const day = (id, date, tasks = []) => ({ id, date, user_id: 'owner', note: '', meta: { sleep: null, condition: null, focus: null, top3: [], _tasks: tasks } })
const tick = () => new Promise(resolve => setImmediate(resolve))
;(async () => {
  assert.ok(sameJson({ b: 2, a: [{ x: 1 }], absent: undefined }, { a: [{ x: 1 }], b: 2 }))
  assert.ok(!sameJson({ x: [1,2] }, { x: [2,1] }))
  const writes = [], release = []
  const write = latestWriter(async (key, value) => { writes.push([key, value]); await new Promise(resolve => release.push(resolve)) })
  const first = write('owner/day', 1), second = write('owner/day', 2), third = write('owner/day', 3)
  assert.deepEqual(writes, [['owner/day',1]])
  release.shift()(); await tick()
  assert.deepEqual(writes, [['owner/day',1], ['owner/day',3]], 'rapid snapshots coalesce without parallel stale writes')
  release.shift()(); await Promise.all([first,second,third])
  let attempts = 0
  const retry = latestWriter(async () => { if (++attempts === 1) throw Error('offline') })
  await assert.rejects(retry('day',1), /offline/); await retry('day',2)

  tables = { day_entries: Array.from({ length: 1001 }, (_,i) => day(`d${String(i).padStart(4,'0')}`, '2026-01-01')) }
  const [a,b] = await Promise.all([fetchAll('owner',db),fetchAll('owner',db)])
  assert.equal(a,b,'identical in-flight reads share the same request')
  assert.equal(a.days.length,1001,'all rows survive the default database page limit')
  assert.equal(queries.filter(q=>q.table==='day_entries').length,3)
  assert.equal(queries.filter(q=>q.table==='tasks').length,0,'embedded accounts do not download the legacy table')
  tables.day_entries.push(day('foreign','2026-01-01')); tables.day_entries.at(-1).user_id='other'
  assert.equal((await fetchAll('other',db)).days.length,1,'in-flight keys and filters are account scoped')
  fail = true
  const originalError = console.error; console.error=()=>{}
  await assert.rejects(fetchAll('owner',db),/test outage/)
  console.error=originalError; fail=false
  assert.equal((await fetchAll('owner',db)).days.length,1001,'failed requests are evicted')

  const old = day('old','2025-01-01',[task('failed',{schedule_details:{result:'failed'}})])
  const current = day('current','2026-10-12',[task('interview',{schedule_details:{dependencies:[{id:'failed',requirement:'passed'}]},history:[{note:'old edit'}]})])
  const future = day('future','2026-12-01',[task('future-step',{schedule_details:{result:'failed'}})])
  tables = { day_entries: [old,current,future], short_goals: [], weekly_reviews: [{ id:'categories', user_id:'owner', week_key:'__categories__', content:'[{"id":"work","name":"Work","color":"blue"}]' }] }
  for(let i=0;i<200;i++) tables.day_entries.push({...day(`archive${i}`,'2025-06-01',[task(`archive-task${i}`)]),note:'x'.repeat(20000)})
  const fullBytes = Buffer.byteLength(JSON.stringify(tables))
  transferred=0; queries.length=0
  const run = createAssistantRunner(db,'owner')
  const read = await run('planner_read',{from:'2026-10-12',to:'2026-10-12'})
  const scopedBytes=transferred
  assert.equal(read.days.length,1)
  assert.equal(read.schedule_cards.length,1,'unrelated historical/future cards stay out of the response')
  assert.equal(read.schedule_cards[0].discardedBy,'failed','past failure still propagates')
  assert.equal(read.schedule_card_dependencies[0].id,'failed')
  assert.equal(read.days[0].tasks[0].history,undefined)
  assert.equal((await run('planner_read',{from:'2026-10-12',to:'2026-10-12',include_history:true})).days[0].tasks[0].history.length,1)
  assert.ok(scopedBytes < fullBytes / 10, 'historical journal bodies are not transferred')
  assert.ok(!queries.some(q=>q.table==='long_goals'))
  queries.length=0
  assert.equal((await fetchCategories('owner',db))[0].id,'work')
  assert.equal(queries.length,1,'category lookup uses one small query')

  current.meta._tasks[0].schedule_details.dependencies=[{id:'future-step',requirement:'passed'}]
  const futureDependency=await run('planner_read',{from:'2026-10-12',to:'2026-10-12'})
  assert.equal(futureDependency.schedule_cards[0].discardedBy,'future-step','future prerequisites are resolved without loading all future dates')
  const legacyDay=day('legacy-day','2026-10-13'); delete legacyDay.meta._tasks
  tables.day_entries.push(legacyDay)
  tables.tasks=[{...task('legacy-task'),user_id:'owner',day_id:'legacy-day',goal_id:null}]
  assert.equal((await run('planner_read',{from:'2026-10-13',to:'2026-10-13'})).days[0].tasks[0].id,'legacy-task')
  legacyDay.meta._tasks=[]
  assert.equal((await run('planner_read',{from:'2026-10-13',to:'2026-10-13'})).days[0].tasks.length,0,'embedded emptiness cannot resurrect old tasks')

  const long = { date:'2026-10-10', tasks:[task('long',{end_time:undefined,duration_min:4000})] }
  const now = { date:'2026-10-12', tasks:[task('now')] }
  assert.equal(findScheduleConflicts([long,now],undefined,{from:now.date,to:now.date}).length,1,'multi-day imported events remain protected')
  tables.day_entries = [day('span','2026-10-12',[task('span',{end_time:undefined,duration_min:4000})]),day('later','2026-10-14',[task('later')])]
  assert.equal((await run('planner_read',{from:'2026-10-12',to:'2026-10-12'})).conflicts.length,1,'range reads also follow long events into future days')
  const nonOverlaps=Array.from({length:2000},(_,i)=>({date:new Date(Date.UTC(2020,0,1+i)).toISOString().slice(0,10),tasks:[task(`t${i}`)]}))
  assert.equal(findScheduleConflicts(nonOverlaps).length,0)
  console.log(`PASS: coalescing, retry, pagination, account isolation, legacy fallback, scoped read, dependency chains, history opt-in, multi-day conflicts; fixture transfer ${fullBytes} -> ${scopedBytes} bytes`)
})().catch(error=>{console.error(error);process.exitCode=1})
