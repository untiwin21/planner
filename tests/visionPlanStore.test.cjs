const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),{randomUUID}=require('node:crypto');
const M=require('../src/lib/visionPlanMetrics.cjs'),owner='owner',clone=structuredClone;
let rows=[{id:'journal',user_id:owner,week_key:'2026-W45',content:'private journal'},{id:'other',user_id:'other',week_key:'__vision_plan_document_v1__',content:'private other account'}],race=null,fail=false;
const db={from(table){assert.equal(table,'weekly_reviews');let mode='read',payload,filters=[];const q={select(){return q},eq(k,v){filters.push(x=>x[k]===v);return q},like(k,v){assert.ok(v.length<100,'CAS never exposes document in URL');assert.match(v,/^\{"revision":"[a-f0-9-]+",%$/);filters.push(x=>x[k].startsWith(v.slice(0,-1)));return q},insert(v){mode='insert';payload=v;return q},update(v){mode='update';payload=v;return q},maybeSingle(){return q.then(r=>({...r,data:r.data?.[0]??null}))},then(ok,bad){return Promise.resolve().then(()=>{if(fail)return {data:null,error:{message:'database unavailable'}};if(mode!=='read'&&race){const f=race;race=null;f();}let found=rows.filter(x=>filters.every(f=>f(x)));if(mode==='insert'){if(rows.some(x=>x.user_id===payload.user_id&&x.week_key===payload.week_key))return {data:null,error:{code:'23505'}};rows.push(clone(payload));return {data:[],error:null}}if(mode==='update'){found.forEach(x=>Object.assign(x,clone(payload)));return {data:found.map(x=>({id:x.id})),error:null}}return {data:clone(found),error:null};}).then(ok,bad)}};return q}};
function compile(file,req){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(req,m,m.exports);return m.exports}
const helper=compile('src/lib/visionPlanStore.ts',name=>name==='./visionPlanMetrics.cjs'?M:require(name));
const empty=()=>M.validate({kind:'my-vision-plan-review',version:2,cycleStart:'2026-11-09',cycleAnchorVersion:1});
(async()=>{
 const store=helper.createVisionPlanStore(db,owner);assert.deepEqual(await store.read(),{revision:null,document:null});
 const first={op:'plan-write',expectedRevision:null,requestId:randomUUID(),document:empty()};first.document.goals[0]='Handwritten';
 await store.write(first);assert.equal((await store.read()).document.goals[0],'Handwritten');assert.equal(rows.length,3);
 assert.deepEqual(await store.write(first),{saved:true,revision:first.requestId});assert.equal(rows.length,3);
 await assert.rejects(store.write({...first,requestId:randomUUID()}),helper.PlanDocumentConflict);
 const second={...first,expectedRevision:first.requestId,requestId:randomUUID(),document:{...first.document,goals:['Changed',...Array(5).fill('')]}};
 const saved=await store.write(second);assert.equal(saved.saved,true);assert.equal((await store.read()).revision,second.requestId);
 const envelope=JSON.parse(rows.find(x=>x.user_id===owner&&x.week_key==='__vision_plan_document_v1__').content);assert.equal(envelope.previous.document.goals[0],'Handwritten');assert.equal('previous' in envelope.previous,false);
 const third={...second,expectedRevision:second.requestId,requestId:randomUUID()};race=()=>{const row=rows.find(x=>x.user_id===owner&&x.week_key==='__vision_plan_document_v1__');const current=JSON.parse(row.content);current.revision=randomUUID();row.content=JSON.stringify(current);};
 await assert.rejects(store.write(third),helper.PlanDocumentConflict);assert.notEqual((await store.read()).revision,third.requestId);
 await assert.rejects(store.write({...first,user_id:'other'}));await assert.rejects(store.write({...first,requestId:'wild%card'}));await assert.rejects(store.write({...first,document:{kind:'bad'}}));
 assert.equal(rows[0].content,'private journal');assert.equal(rows[1].content,'private other account');
 const before=clone(rows);fail=true;await assert.rejects(store.write(third));fail=false;assert.deepEqual(rows,before);
 rows=rows.filter(x=>x.week_key!=='__vision_plan_document_v1__'||x.user_id!==owner);race=()=>rows.push({id:'racing-insert',user_id:owner,week_key:'__vision_plan_document_v1__',content:JSON.stringify({revision:randomUUID(),document:empty()})});await assert.rejects(store.write(first),helper.PlanDocumentConflict);
 assert.equal(rows.filter(x=>x.user_id===owner&&x.week_key==='__vision_plan_document_v1__').length,1);
 console.log('PASS: complete Plan storage, account isolation, schema validation, idempotency, atomic insert/update races, private short CAS predicate, previous revision recovery and database failures');
})().catch(e=>{console.error(e);process.exitCode=1});
