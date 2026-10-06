const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
const m={exports:{}}; let calls=0, authenticated=true, conflict=false
const db={auth:{getUser:async token=>({data:{user:authenticated&&token==='session'?{id:'verified-owner'}:null}})},rpc:async(name,args)=>{
  calls++; assert.equal(name,'planner_compare_and_swap_day'); assert.equal(args.p_user_id,'verified-owner'); assert.equal(args.p_next.large.length,30000)
  return {data:conflict?[]:[{id:'day'}],error:null}
}}
new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/app/api/sync/day/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(()=>({createClient:()=>db}),m,m.exports)
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test'
const input={id:'day',expected:{},next:{large:'x'.repeat(30000)},note:'',expectedNote:''}
const request=(body=input,token='session')=>new Request('https://example.test/api/sync/day',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)})
;(async()=>{
  assert.equal((await m.exports.POST(request(input,'wrong'))).status,401); assert.equal(calls,0)
  assert.equal((await m.exports.POST(request({...input,user_id:'victim'}))).status,400);assert.equal(calls,0)
  assert.deepEqual(await(await m.exports.POST(request())).json(),{saved:true})
  conflict=true;assert.deepEqual(await(await m.exports.POST(request())).json(),{saved:false})
  assert.equal((await m.exports.POST(request({...input,next:{large:'x'.repeat(2100000)}}))).status,413)
  console.log('PASS: browser auth, server-derived owner, large body CAS, conflicts, payload limit')
})().catch(e=>{console.error(e);process.exitCode=1})
