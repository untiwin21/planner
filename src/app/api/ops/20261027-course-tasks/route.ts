import { createClient } from '@supabase/supabase-js'
import { createAssistantRunner } from '@/lib/plannerAssistant'
import { authorizedAssistant } from '@/lib/assistantApiAuth'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const specs = [
 {date:'2026-11-03',task_id:'assistant-hw3-20261103',text:'자료구조개론 HW3 마감',kind:'deadline',schedule_details:{kind:'deadline',due_time:'23:59'}},
 {date:'2026-10-30',task_id:'assistant-estudio-20261030',text:'E-Studio: CNC, 워터젯 커팅기 사용법 배우기 (오후)',kind:'schedule',important:true,schedule_details:{kind:'event',visibility:'public',description:'금요일 오후. 정확한 시작·종료 시각 미정.'}},
 {date:'2026-10-30',task_id:'assistant-business-email-20261030',text:'비즈니스영어 Email 과제 마감',kind:'deadline',schedule_details:{kind:'deadline',due_time:'23:00'}}
]
export async function POST(request:Request) {
 const reply=(v:unknown,s=200)=>Response.json(v,{status:s,headers:{'Cache-Control':'no-store'}})
 if(!authorizedAssistant(request.headers.get('authorization'),'762c65a0f9401636d45058cf801ed203be0c6e949bff2d612247d526416425de')) return reply({error:'Unauthorized'},401)
 if(Date.now()>Date.parse('2026-10-28T23:59:00Z')) return reply({error:'Expired'},410)
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,owner=process.env.PLANNER_ASSISTANT_USER_ID
 if(!url||!key||!owner) return reply({error:'configuration'},503)
 const run=createAssistantRunner(createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),owner,undefined,true)
 try {
 const read=()=>run('planner_read',{from:'2026-10-27',to:'2026-11-04'})
 const snapshot=await read() as any
 if((await request.json()).action==='read') return reply(snapshot)
 const results=[]
 for(const spec of specs) {
 const matches=snapshot.days.flatMap((d:any)=>d.tasks.filter((t:any)=>!t.deleted_at&&(t.id===spec.task_id||t.text===spec.text)).map((t:any)=>({date:d.date,task:t})))
 if(matches.some((m:any)=>m.date!==spec.date)) throw new Error('Existing item on different date; manual review required')
 const match=matches[0]
 results.push(await run('planner_save_task',{...spec,task_id:match?.task.id??spec.task_id,...(match?{expected_updated_at:match.task.updated_at}:{})}))
 }
 return reply({results,verified:await read()})
 }catch(e){return reply({error:e instanceof Error?e.message:'failed'},409)}
}
