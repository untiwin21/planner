import { createHash, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { authorizedAssistant } from '@/lib/assistantApiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const VISION = 'https://vision-board-navy.vercel.app'
const PLANNER = 'https://planner-kappa-two.vercel.app'
const PREFIX = '__vision_week__:'
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
function headers(request: Request) {
  const origin = request.headers.get('origin')
  return { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Vary':'Origin', ...(origin === VISION || origin === PLANNER ? {'Access-Control-Allow-Origin':origin} : {}), 'Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS', 'Access-Control-Allow-Headers':'Authorization, Content-Type' }
}
function reply(request: Request, value: unknown, status = 200) { return Response.json(value, {status, headers:headers(request)}) }
function dbConfig() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY, owner=process.env.PLANNER_ASSISTANT_USER_ID
  if(!url || !key || !owner) throw new Error('configuration')
  return {db:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),owner}
}
async function authenticated(request: Request, db: any, owner: string) {
  if(authorizedAssistant(request.headers.get('authorization'),process.env.PLANNER_ASSISTANT_TOKEN_SHA256)) return true
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'') ?? ''
  if(!/^vw_[a-f0-9]{64}$/.test(token)) return false
  const {data,error}=await db.from('weekly_reviews').select('content').eq('user_id',owner).eq('week_key','__vision_device__:'+hash(token)).maybeSingle()
  if(error || !data) return false
  try {return JSON.parse(data.content).expires_at>Date.now()} catch{return false}
}
export async function OPTIONS(request: Request) { return new Response(null,{status:204,headers:headers(request)}) }
export async function POST(request: Request) {
  try {
    if(request.headers.get('origin') !== PLANNER) return reply(request,{error:'Origin not allowed'},403)
    const {db,owner}=dbConfig()
    const bearer=request.headers.get('authorization')?.replace(/^Bearer /,'')
    if(!bearer) return reply(request,{error:'Sign in to Planner'},401)
    const {data,error}=await db.auth.getUser(bearer)
    if(error || data.user?.id !== owner) return reply(request,{error:'Account not authorized'},401)
    const token='vw_'+randomBytes(32).toString('hex'), key='__vision_device__:'+hash(token)
    const {error:saveError}=await db.from('weekly_reviews').insert({id:'review:'+owner+':'+key,user_id:owner,week_key:key,content:JSON.stringify({scope:'vision-weeks',expires_at:Date.now()+365*86400000})})
    if(saveError) throw new Error('save')
    return reply(request,{token,scope:'vision-weeks'})
  }catch{return reply(request,{error:'Connection unavailable'},503)}
}
export async function GET(request: Request) {
  try {
    const {db,owner}=dbConfig()
    if(!await authenticated(request,db,owner)) return reply(request,{error:'Connect your Planner account'},401)
    const {data,error}=await db.from('weekly_reviews').select('week_key,content').eq('user_id',owner).gte('week_key',PREFIX).lt('week_key',PREFIX+'\uffff')
    if(error) throw error
    const weeks:Record<string,unknown>={}
    for(const row of data ?? []){if(row.week_key.startsWith(PREFIX)) weeks[row.week_key.slice(PREFIX.length)]=JSON.parse(row.content)}
    return reply(request,{version:1,weeks})
  }catch{return reply(request,{error:'Unable to read saved weeks'},503)}
}
function monday(key: unknown):key is string {
  if(typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  const d=new Date(key+'T00:00:00Z');return !isNaN(d.getTime()) && d.toISOString().slice(0,10)===key && d.getUTCDay()===1
}
function validField(k:string,v:any) {
  if(k==='focus') return typeof v==='string' && v.length<=180
  if(k==='goals') return Array.isArray(v) && v.length<=3 && v.every(g=>g && typeof g.text==='string' && g.text.length<=200 && typeof g.done==='boolean' && ['','wealth','mastery','family','space','health','depth'].includes(g.vision))
  if(k==='days') return Array.isArray(v) && v.length===7 && v.every(d=>Array.isArray(d)&&d.length<=100&&d.every(t=>t&&typeof t.text==='string'&&t.text.length<=500&&typeof t.done==='boolean'))
  return ['gpt','mine'].includes(k) && typeof v==='string' && v.length<=20000
}
export async function PATCH(request:Request) {
  try {
    const {db,owner}=dbConfig()
    if(!await authenticated(request,db,owner)) return reply(request,{error:'Connect your Planner account'},401)
    const raw=await request.text();if(Buffer.byteLength(raw)>250000)return reply(request,{error:'Too large'},413)
    const input=JSON.parse(raw)
    if(!monday(input.week)||!input.patch||!input.expected||Object.keys(input.patch).length===0||Object.entries(input.patch).some(([k,v])=>!validField(k,v)))return reply(request,{error:'Invalid week or fields'},400)
    const key=PREFIX+input.week
    const {data:prior,error:readError}=await db.from('weekly_reviews').select('id,content').eq('user_id',owner).eq('week_key',key).maybeSingle()
    if(readError)throw readError
    const value=prior?JSON.parse(prior.content):{focus:'',goals:[],days:Array.from({length:7},()=>[]),review:{gpt:'',mine:''}}
    for(const [k,v] of Object.entries(input.patch)){
      const current=['gpt','mine'].includes(k)?value.review?.[k]??'':value[k]
      if(JSON.stringify(current)!==JSON.stringify(input.expected[k]) && JSON.stringify(current)!==JSON.stringify(v))return reply(request,{error:'conflict',week:value},409)
      if(['gpt','mine'].includes(k))value.review={gpt:'',mine:'',...value.review,[k]:v};else value[k]=v
    }
    const content=JSON.stringify(value)
    const result=prior?await db.from('weekly_reviews').update({content}).eq('id',prior.id).eq('user_id',owner).eq('content',prior.content).select('id'):await db.from('weekly_reviews').insert({id:'review:'+owner+':'+key,user_id:owner,week_key:key,content}).select('id')
    if(result.error || result.data?.length!==1)return reply(request,{error:'conflict'},409)
    return reply(request,{saved:true,week:input.week,value})
  }catch{return reply(request,{error:'Unable to save week'},503)}
}
