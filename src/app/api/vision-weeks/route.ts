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
  return { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Vary':'Origin', ...(origin === VISION || origin === PLANNER ? {'Access-Control-Allow-Origin':origin} : {}), 'Access-Control-Allow-Methods':'GET, DELETE, OPTIONS', 'Access-Control-Allow-Headers':'Authorization, Content-Type' }
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

export async function POST(request: Request) { return reply(request,{error:'Vision weekly planning has been retired'},410) }
export async function PATCH(request: Request) { return reply(request,{error:'Vision weekly planning has been retired'},410) }
// Retire only Vision Board rows. Planner reviews and tasks are outside these ranges.
export async function DELETE(request: Request) {
  try {
    const {db,owner}=dbConfig()
    if(!await authenticated(request,db,owner)) return reply(request,{error:'Unauthorized'},401)
    const counts: Record<string,number> = {}
    for (const prefix of [PREFIX,'__vision_device__:']) {
      const {data,error}=await db.from('weekly_reviews').delete().eq('user_id',owner).gte('week_key',prefix).lt('week_key',prefix+'\uffff').select('id')
      if(error) throw error
      counts[prefix]=data?.length ?? 0
    }
    return reply(request,{deleted:true,counts})
  } catch {return reply(request,{error:'Deletion failed'},503)}
}
