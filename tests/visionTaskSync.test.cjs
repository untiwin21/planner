const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),{createHash}=require('node:crypto');
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',clone=x=>JSON.parse(JSON.stringify(x));
let days=[{id:'day-a',date:'2026-11-07',user_id:owner,note:'private journal',meta:{sleep:7,_tasks:[{id:'unrelated',text:'Existing task',done:false,updated_at:1}]}}],reviews=[{id:'cats',user_id:owner,week_key:'__categories__',content:JSON.stringify([{id:'task',name:'Task',color:'blue'}])}],race=null,failDate=null;
const db={auth:{getUser:async token=>({data:{user:{id:token==='jwt-owner'?owner:other}},error:null})},from(table){let filters=[],mode='read',payload;
 const q={select(){return q},eq(k,v){filters.push(x=>x[k]===v);return q},gte(k,v){filters.push(x=>x[k]>=v);return q},lte(k,v){filters.push(x=>x[k]<=v);return q},is(k,v){return q.eq(k,v)},in(k,v){filters.push(x=>v.includes(x[k]));return q},order(){return q},range(){return q},insert(v){mode='insert';payload=v;return q},delete(){mode='delete';return q},maybeSingle(){return q.then(r=>({...r,data:r.data?.[0]??null}))},then(resolve,reject){return Promise.resolve().then(()=>{const rows=table==='day_entries'?days:table==='weekly_reviews'?reviews:[];const match=x=>filters.every(f=>f(x));if(mode==='insert'){if(payload.date===failDate)return {data:null,error:{message:'private database error'}};if(table==='day_entries'&&rows.some(x=>x.user_id===payload.user_id&&x.date===payload.date))return {data:null,error:{code:'23505'}};rows.push(clone(payload));return {data:[],error:null}}if(mode==='delete'){const keep=rows.filter(x=>!match(x));if(table==='weekly_reviews')reviews=keep;else days=keep;return {data:[],error:null}}return {data:clone(rows.filter(match)),error:null}}).then(resolve,reject)}};return q},
 async rpc(name,p){assert.equal(name,'planner_compare_and_swap_day');assert.equal(p.p_user_id,owner);const row=days.find(x=>x.id===p.p_day_id&&x.user_id===owner);if(race){const f=race;race=null;f(row)}if(!row||JSON.stringify(row.meta)!==JSON.stringify(p.p_expected))return {data:[],error:null};row.meta=clone(p.p_next);return {data:[{id:row.id}],error:null}}
};
function compile(file,req){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(req,m,m.exports);return m.exports}
const helper=compile('src/lib/visionTaskSync.ts',name=>name==='./plannerQueries'?{legacyTasksFor:async()=>[]}:require(name));
const route=compile('src/app/api/vision-tasks/route.ts',name=>name==='@supabase/supabase-js'?{createClient:()=>db}:name==='@/lib/visionTaskSync'?helper:require(name));
const V='https://vision-board-navy.vercel.app',P='https://planner-kappa-two.vercel.app';
function req(body,token='jwt-owner',origin=V){return new Request(P+'/api/vision-tasks',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)})}
(async()=>{
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'secret',PLANNER_ASSISTANT_USER_ID:owner});
 assert.equal((await route.POST(req({op:'connect'},'jwt-owner','https://evil.test'))).status,403);
 assert.equal((await route.POST(req({op:'connect'},'jwt-other',P))).status,403);
 assert.equal((await route.POST(req({op:'connect',user_id:other},'jwt-owner',P))).status,403);
 const connected=await route.POST(req({op:'connect'},'jwt-owner',P)),cap=await connected.json();assert.equal(connected.status,200);assert.match(cap.token,/^vt_[a-f0-9]{64}$/);assert.ok(!JSON.stringify(reviews).includes(cap.token),'only hash is stored');
 assert.equal((await route.POST(req({op:'read',from:'2026-11-07',to:'2026-11-08'},'invalid'))).status,401);
 const runner=helper.createVisionTaskSync(db,owner,{id:'task',name:'Task',color:'blue'}),task={id:'local-a',title:'Sync verification',date:'2026-11-07',previousDate:null,done:false,completedAt:null,dueDate:'2026-11-07',archived:false,expectedUpdatedAt:null,mutationId:'m1'};
 race=row=>row.meta._tasks.push({id:'concurrent',text:'Concurrent unrelated task'});
 const first=await runner.sync(task);assert.equal(first.saved,true);assert.equal(days[0].note,'private journal');assert.equal(days[0].meta.sleep,7);assert.equal(days[0].meta._tasks.filter(t=>!t.id.startsWith(helper.VISION_TASK_PREFIX)).length,2);assert.ok(!first.task.start_time&&!first.task.duration_min,'no timeline invented');
 assert.equal((await runner.read('2026-11-07','2026-11-08')).length,1);assert.ok(!JSON.stringify(await runner.read('2026-11-07','2026-11-08')).includes('private journal'));
 const retried=await runner.sync(task);assert.equal(retried.saved,true);assert.equal(days[0].meta._tasks.filter(t=>t.id.startsWith(helper.VISION_TASK_PREFIX)).length,1);
 const version=first.task.updatedAt,move={...task,date:'2026-11-08',previousDate:'2026-11-07',expectedUpdatedAt:version,mutationId:'m2'};
 failDate='2026-11-08';await assert.rejects(runner.sync(move));assert.equal(days[0].meta._tasks.find(t=>t.id.startsWith(helper.VISION_TASK_PREFIX)).deleted_at,undefined,'failed destination leaves original intact');failDate=null;
 const moved=await runner.sync(move);assert.equal(moved.saved,true);assert.equal(moved.task.date,'2026-11-08');assert.ok(days[0].meta._tasks.find(t=>t.id.startsWith(helper.VISION_TASK_PREFIX)).deleted_at);assert.equal((await runner.read('2026-11-07','2026-11-08')).filter(t=>!t.archived).length,1);
 const retryMove=await runner.sync(move);assert.equal(retryMove.saved,true);assert.equal((await runner.read('2026-11-07','2026-11-08')).length,1);
 const done={...move,date:'2026-11-08',previousDate:'2026-11-08',expectedUpdatedAt:moved.task.updatedAt,mutationId:'m3',done:true,completedAt:'2026-11-08T14:59:59Z'};const completed=await runner.sync(done);assert.equal(completed.task.completedAt,done.completedAt);
 await assert.rejects(runner.sync({...done,title:'stale'}),helper.VisionConflict);
 const hidden=await runner.sync({...done,expectedUpdatedAt:completed.task.updatedAt,mutationId:'m4',archived:true});assert.equal(hidden.task.archived,true);assert.equal(hidden.task.date,'2026-11-08');
 const restored=await runner.sync({...done,expectedUpdatedAt:hidden.task.updatedAt,mutationId:'m5'});assert.equal(restored.task.archived,false);
 const read=await route.POST(req({op:'read',from:'2026-11-07',to:'2026-11-08'},cap.token));assert.equal(read.status,200);assert.equal((await read.json()).tasks.length,1);assert.equal(read.headers.get('access-control-allow-origin'),V);
 assert.equal((await route.POST(req({op:'sync',task:{...task,user_id:other}},cap.token))).status,400);
 assert.equal((await route.POST(req('x'.repeat(65537),cap.token))).status,400);
 const removed=await route.DELETE(new Request(P+'/api/vision-tasks',{method:'DELETE',headers:{Origin:V,Authorization:'Bearer '+cap.token}}));assert.equal(removed.status,200);assert.equal((await route.POST(req({op:'read',from:'2026-11-07',to:'2026-11-08'},cap.token))).status,401);
 console.log('PASS: owner-only scoped auth, hash storage, origin/body allowlists, CAS preservation, idempotent retries, safe moves, completion timestamps, tombstones, restore, revocation and no timeline data');
})().catch(e=>{console.error(e);process.exitCode=1});
