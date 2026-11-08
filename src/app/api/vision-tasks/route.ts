import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createVisionTaskSync, VisionConflict } from '@/lib/visionTaskSync'
import { createVisionPlanStore, PlanDocumentConflict } from '@/lib/visionPlanStore'
import { readVisionAssessment } from '@/lib/visionAssessmentRead'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const VISION='https://vision-board-navy.vercel.app',PLANNER='https://planner-kappa-two.vercel.app',PREFIX='__vision_tasks_device__:'
const hash=(s:string)=>createHash('sha256').update(s).digest('hex')
function reply(request:Request,body:unknown,status=200){const origin=request.headers.get('origin');return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(origin===VISION||origin===PLANNER?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, DELETE, OPTIONS'}})}
export async function OPTIONS(request:Request){return new Response(null,{status:204,headers:reply(request,{}).headers})}
async function configuration(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,owner=process.env.PLANNER_ASSISTANT_USER_ID;if(!url||!key||!owner)throw new Error('Unavailable');return {db:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),owner}}
async function credential(request:Request,db:any,owner:string){const token=request.headers.get('authorization')?.match(/^Bearer (vt_[a-f0-9]{64})$/)?.[1];if(!token)return null;const key=PREFIX+hash(token);const {data,error}=await db.from('weekly_reviews').select('content').eq('user_id',owner).eq('week_key',key).maybeSingle();if(error)throw error;if(!data)return null;try{const value=JSON.parse(data.content);return (value.expiresAt===null||(Number.isFinite(value.expiresAt)&&value.expiresAt>Date.now()))&&typeof value.categoryId==='string'?{...value,key}:null}catch{return null}}
async function bodyOf(request:Request){if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Error('JSON required');const reader=request.body?.getReader();if(!reader)throw new Error('Body required');let size=0,body='';const decoder=new TextDecoder();while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2200000){await reader.cancel();throw new Error('Too large')}body+=decoder.decode(part.value,{stream:true})}return JSON.parse(body+decoder.decode())}
export async function POST(request:Request){
  const origin=request.headers.get('origin');if(origin!==VISION&&origin!==PLANNER)return reply(request,{error:'Origin denied'},403)
  try{
    const {db,owner}=await configuration(),body=await bodyOf(request)
    if(!body||typeof body!=='object'||Array.isArray(body))return reply(request,{error:'Invalid request'},400)
    if(body.op==='connect'){
      if(origin!==PLANNER||Object.keys(body).some(k=>k!=='op'))return reply(request,{error:'Origin denied'},403)
      const bearer=request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];if(!bearer)return reply(request,{error:'Sign in required'},401)
      const {data:user,error}=await db.auth.getUser(bearer);if(error||user.user?.id!==owner)return reply(request,{error:'This connection is restricted to the Planner owner'},403)
      const {data:row,error:catError}=await db.from('weekly_reviews').select('content').eq('user_id',owner).eq('week_key','__categories__').maybeSingle();if(catError)throw catError
      const parsed=JSON.parse(row?.content??'[]'),categories=Array.isArray(parsed)?parsed:parsed.items??[],category=categories.find((c:any)=>c.name==='Task')??categories.find((c:any)=>!['schedule','deadline'].includes(c.id));if(!category)throw new Error('No task category')
      const token='vt_'+randomBytes(32).toString('hex'),expiresAt=null
      const {error:saveError}=await db.from('weekly_reviews').insert({id:randomUUID(),user_id:owner,week_key:PREFIX+hash(token),content:JSON.stringify({expiresAt,categoryId:category.id})});if(saveError)throw saveError
      return reply(request,{token,expiresAt})
    }
    const access=await credential(request,db,owner);if(!access)return reply(request,{error:'Reconnect Planner'},401)
    const plans=createVisionPlanStore(db,owner)
    if(body.op==='plan-read'&&Object.keys(body).length===1)return reply(request,await plans.read())
    if(body.op==='plan-write')return reply(request,await plans.write(body))
    if(body.op==='assessment-read'&&Object.keys(body).every(k=>['op','cycleStart'].includes(k)))return reply(request,{assessment:await readVisionAssessment(db,owner,body.cycleStart)})
    if(JSON.stringify(body).length>65536)return reply(request,{error:'Too large'},400)
    const {data:row,error}=await db.from('weekly_reviews').select('content').eq('user_id',owner).eq('week_key','__categories__').maybeSingle();if(error)throw error
    const parsed=JSON.parse(row?.content??'[]'),categories=(Array.isArray(parsed)?parsed:parsed.items??[]).filter((c:any)=>typeof c.id==='string'&&typeof c.name==='string'&&!['schedule','deadline'].includes(c.id)).map((c:any)=>({id:c.id,name:c.name,color:c.color})),category=categories.find((c:any)=>c.id===access.categoryId)??categories.find((c:any)=>c.name==='Task')??categories[0];if(!category)throw new Error('Category changed')
    const runner=createVisionTaskSync(db,owner,category,categories)
    if(body.op==='categories'&&Object.keys(body).length===1)return reply(request,{categories,defaultCategoryId:category.id})
    if(body.op==='read'&&!Object.keys(body).some(k=>!['op','from','to'].includes(k)))return reply(request,{tasks:await runner.read(body.from,body.to),categories,defaultCategoryId:category.id})
    if(body.op==='sync'&&!Object.keys(body).some(k=>!['op','task'].includes(k)))return reply(request,await runner.sync(body.task))
    return reply(request,{error:'Invalid operation'},400)
  }catch(error){return reply(request,{error:error instanceof PlanDocumentConflict?'다른 기기의 변경 사항을 다시 확인해 주세요.':error instanceof VisionConflict?(error.partial?'이동이 일부 저장되었습니다. 두 날짜를 확인해 주세요.':'다른 곳에서 수정된 할 일입니다. 덮어쓰지 않았습니다.'):'연결 또는 저장에 실패했습니다. 다시 확인해 주세요.'},error instanceof VisionConflict||error instanceof PlanDocumentConflict?409:400)}
}
export async function DELETE(request:Request){if(request.headers.get('origin')!==VISION)return reply(request,{error:'Origin denied'},403);try{const {db,owner}=await configuration(),access=await credential(request,db,owner);if(!access)return reply(request,{error:'Unauthorized'},401);const {error}=await db.from('weekly_reviews').delete().eq('user_id',owner).eq('week_key',access.key);if(error)throw error;return reply(request,{disconnected:true})}catch{return reply(request,{error:'Disconnect failed'},400)}}
