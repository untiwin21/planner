const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {assessment,actual,minute}=require('../src/lib/visionAssessment.cjs');
const cycleStart='2026-11-09',now=Date.parse('2026-11-10T20:00:00+09:00');
const task=(id,cat,start,end,extra={})=>({id,category_name:cat,category_id:cat.toLowerCase(),start_time:start,end_time:end,actual_start_time:start,actual_end_time:end,actual_status:'recorded',done:true,...extra});
const row=(tasks=[],extra={})=>({date:cycleStart,tasks,...extra});
const run=(days,extra={})=>assessment({cycleStart,now,days,...extra}).weeks[1];
test('study latency uses first actual record including routines, not planned wake-up or first creation',()=>{
 const tasks=[task('wake','Life','06:30','07:00'),task('s','Study','08:30','09:30')];
 const w=run([row(tasks)]);assert.equal(w.studyStart.score,50);assert.equal(w.studyStart.mean,120);
 const withRoutine=run([row([tasks[1]],{routineActual:{r:{start:'06:00',end:'06:10'}}})]);assert.equal(withRoutine.studyStart.score,25);
 const noActual=run([row([task('s','Study','08:30','09:30',{actual_status:undefined,actual_start_time:undefined,actual_end_time:undefined})])]);assert.equal(noActual.studyStart.score,null);assert.equal(noActual.studyStart.eligible,1);
});
test('calibration is symmetric, uses recorded sessions once, and excludes unfinished/discarded/fixed events',()=>{
 const tasks=[task('a','Study','08:00','09:00',{duration_min:30}),task('b','Work','10:00','10:30',{duration_min:60}),task('c','Project','11:00','12:00',{done:false}),task('d','Study','13:00','14:00',{discarded:true}),task('e','Life','14:00','15:00',{category_id:'schedule'})];
 const w=run([row(tasks)]);assert.equal(w.calibration.score,50);assert.equal(w.calibration.observed,2);assert.equal(w.calibration.eligible,2);
 const t=task('session','Study','08:00','12:00',{duration_min:60,actual_duration_min:240,actual_sessions:[{started_at:'2026-11-09T08:00:00+09:00',ended_at:'2026-11-09T08:30:00+09:00',duration_min:30},{started_at:'2026-11-09T11:00:00+09:00',ended_at:'2026-11-09T11:30:00+09:00',duration_min:30}]});assert.equal(run([row([t])]).calibration.score,100);
});
test('action penalties apply only to scheduled Study/Work/Project, including explicit skipped records',()=>{
 const tasks=[task('s','Study','08:00','09:00',{actual_start_time:'08:40',actual_end_time:'09:40'}),task('w','Work','10:00','11:00',{actual_status:'skipped'}),task('other','AI','12:00','13:00',{actual_start_time:'16:00',actual_end_time:'17:00'}),task('flex','Project',undefined,undefined,{actual_duration_min:60})];
 const w=run([row(tasks)]);assert.equal(w.action.score,25);assert.equal(w.action.observed,2);assert.equal(w.action.eligible,2);
});
test('KPT measures filled fields only; sleep is minutes, capped at 100 without penalizing long sleep',()=>{
 let w=run([row([],{sleep:420,review:{keep:'Private keep',problem:'Private problem',try:'   '}})]);assert.equal(w.kpt.score,66.7);assert.equal(w.sleep.score,100);assert.equal(w.sleep.observed,1);assert.equal(w.sleep.eligible,2);
 w=run([row([],{sleep:600})]);assert.equal(w.sleep.score,100);assert.equal(w.kpt.score,0);
 assert.equal(run([row([],{sleep:210})]).sleep.score,50);assert.equal(run([row([],{sleep:null})]).sleep.score,null);
 assert.ok(!JSON.stringify(assessment({cycleStart,now,days:[row([],{review:{keep:'Private keep'},note:'Secret diary'})]})).includes('Private'));
});
test('routine denominator respects creation, weekdays, pauses and later configuration changes',()=>{
 const routine={id:'r',status:'active',created_at:'2026-11-09T05:00:00+09:00',config:{days_of_week:[0]}};
 let w=run([],{routines:[routine],logs:[{routine_id:'r',date:cycleStart,done:true,completion:'minimum'}]});assert.equal(w.routines.score,50);assert.equal(w.routines.eligible,1);
 assert.equal(run([],{routines:[routine]}).routines.score,0);
 for(const r of [{...routine,status:'paused'},{...routine,created_at:'2026-11-11T05:00:00+09:00'},{...routine,updated_at:now},{...routine,config:{stage:'backlog'}}])assert.equal(run([],{routines:[r]}).routines.eligible,0);
});
test('future/current unfinished routines and KPT are not failures; no record is not a failed start',()=>{
 const early=Date.parse('2026-11-09T07:00:00+09:00'),w=assessment({cycleStart,now:early,days:[row([task('future','Study','08:00','09:00')])],routines:[{id:'r',status:'active',created_at:'2026-11-08T00:00:00Z'}]}).weeks[1];
 assert.equal(w.action.eligible,0);assert.equal(w.studyStart.score,null);assert.equal(w.kpt.eligible,0);assert.equal(w.routines.eligible,0);assert.equal(w.calibration.score,null);
 const before=assessment({cycleStart,now:Date.parse('2026-11-08T12:00:00+09:00')});assert.ok(Object.values(before.weeks).every(w=>Object.values(w).every(m=>m.eligible===0)));
});
test('overnight execution uses Planner 05:00 boundary and a task is not counted again through a linked goal',()=>{
 assert.equal(minute('01:30'),1530);assert.equal(actual(task('night','Study','23:00','01:00'),cycleStart,now).minutes,120);
 const t=task('x','Study','08:00','09:00'),g={id:'g',date_from:cycleStart,date_to:cycleStart,tasks:[t]};assert.equal(run([row([t],{linkedGoalTaskIds:['x']})],{goals:[g]}).calibration.observed,1);
 const sub={id:'sub',text:'Child',done:true,start_time:'08:00',end_time:'09:00',actual_status:'recorded',actual_start_time:'08:00',actual_end_time:'09:00'};
 assert.equal(run([row([],{linkedGoalSubtaskIds:['sub']})],{goals:[{...g,tasks:[{...t,subtasks:[sub]}]}]}).calibration.observed,1);
});
test('a Planner day remains open until next 05:00 and old explicit routine checks survive archiving',()=>{
 const r={id:'r',status:'archived',created_at:'2026-11-08T00:00:00Z',updated_at:now};
 assert.equal(run([],{routines:[r],logs:[{routine_id:'r',date:cycleStart,done:true}]}).routines.score,100);
 const result=assessment({cycleStart,now:Date.parse('2026-11-10T02:00:00+09:00'),routines:[{...r,status:'active',updated_at:undefined}]});assert.equal(result.weeks[1].kpt.eligible,0);assert.equal(result.weeks[1].routines.eligible,0);
});
test('assessment reader fixes owner, bounds dates, paginates and never selects diary or sends raw text',async()=>{
 const queries=[],tables={day_entries:[{id:'d',...row([task('a','Study','08:00','09:00')],{sleep:420,review:{keep:'Private KPT'}})}],short_goals:[],routines:[],routine_logs:[]};
 const db={from:table=>{const q={table,select:'',filters:[],select(x){this.select=x;return this;},eq(k,v){this.filters.push([k,v]);return this;},gte(k,v){this.filters.push([k,v]);return this;},lte(k,v){this.filters.push([k,v]);return this;},order(){return this;},async range(){queries.push(this);return {data:tables[table],error:null};}};return q;}};
 const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/lib/visionAssessmentRead.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>n==='./plannerQueries'?{readRows:q=>q().order('id').range(0,499).then(r=>r.data),legacyTasksFor:async()=>[]}:require('../src/lib/visionAssessment.cjs'),m,m.exports);
 const result=await m.exports.readVisionAssessment(db,'fixed-owner',cycleStart,now);assert.equal(result.weeks[1].sleep.score,100);assert.ok(queries.every(q=>q.filters.some(([k,v])=>k==='user_id'&&v==='fixed-owner')));assert.ok(!queries.find(q=>q.table==='day_entries').select.includes('note'));assert.ok(!JSON.stringify(result).includes('Private KPT'));await assert.rejects(m.exports.readVisionAssessment(db,'fixed-owner','2026-02-30',now));
});
