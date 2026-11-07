import { createHash, randomUUID } from 'node:crypto'
import { legacyTasksFor } from './plannerQueries'

export const VISION_TASK_PREFIX = 'vision-plan:'
const validDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v + 'T00:00:00Z').toISOString().slice(0,10) === v
const taskId = (id: string) => VISION_TASK_PREFIX + createHash('sha256').update(id).digest('hex')
export class VisionConflict extends Error { constructor(public partial=false){super('Planner changed. Refresh before retrying.')} }

export function validateVisionTask(input: any) {
  if (!input || Object.keys(input).some(k => !['id','title','date','previousDate','done','completedAt','dueDate','archived','expectedUpdatedAt','mutationId','categoryId'].includes(k))
    || typeof input.id !== 'string' || !input.id || input.id.length > 100 || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 300
    || (input.date !== null && !validDate(input.date)) || (input.previousDate !== null && !validDate(input.previousDate)) || !validDate(input.dueDate)
    || typeof input.done !== 'boolean' || typeof input.archived !== 'boolean'
    || (input.completedAt !== null && (typeof input.completedAt !== 'string' || !Number.isFinite(Date.parse(input.completedAt))))
    || (input.expectedUpdatedAt !== null && (!Number.isSafeInteger(input.expectedUpdatedAt) || input.expectedUpdatedAt < 0))
    || (input.categoryId!=null&&(typeof input.categoryId!=='string'||!input.categoryId||input.categoryId.length>100))
    || typeof input.mutationId !== 'string' || !input.mutationId || input.mutationId.length > 120) throw new Error('Invalid task')
  return { ...input, title: input.title.trim() }
}

/** Scoped to Vision-owned tasks. Other task fields and all day metadata survive. */
export function createVisionTaskSync(db: any, owner: string, category: {id:string;name:string;color:string}, categories=[category]) {
  async function load(date: string) {
    const {data,error}=await db.from('day_entries').select('id,date,note,meta').eq('user_id',owner).eq('date',date).maybeSingle()
    if(error)throw error
    if(!data)return null
    const records='_tasks' in (data.meta??{}) ? data.meta._tasks??[] : await legacyTasksFor(owner,'day_id',[data.id],db)
    return {...data,meta:{...data.meta,_tasks:records}}
  }
  async function change(date: string, transform: (records:any[],dayId:string)=>any[]) {
    for(let attempt=0;attempt<4;attempt++) {
      const row=await load(date),id=row?.id??randomUUID(),records=transform(row?.meta._tasks??[],id)
      if(!row){const {error}=await db.from('day_entries').insert({id,user_id:owner,date,note:'',meta:{_tasks:records}});if(error?.code==='23505')continue;if(error)throw error;return records}
      // Compare the original stored body, not a synthesized legacy snapshot.
      const {data:original,error:readError}=await db.from('day_entries').select('meta').eq('user_id',owner).eq('id',row.id).maybeSingle()
      if(readError||!original)throw readError??new VisionConflict()
      const expected=original.meta??{}
      if('_tasks' in expected && JSON.stringify(expected._tasks)!==JSON.stringify(row.meta._tasks))continue
      const {data:saved,error}=await db.rpc('planner_compare_and_swap_day',{p_user_id:owner,p_day_id:row.id,p_expected:expected,p_next:{...expected,_tasks:records}})
      if(error)throw error
      if(saved?.length)return records
    }
    throw new VisionConflict()
  }
  function publicTask(t:any,date:string){
    const lastCompletion=(t.history??[]).filter((h:any)=>h.kind==='completed'&&Number.isFinite(Date.parse(h.at))).at(-1)
    return {id:t.vision_plan.client_id,title:t.text,date,categoryId:t.category_id??null,done:t.done,archived:!!t.deleted_at||!!t.discarded,updatedAt:t.updated_at??0,
      completedAt:t.done?(lastCompletion&&lastCompletion.note!=='Vision Plan 동기화'?lastCompletion.at:t.vision_plan.completed_at??null):null,dueDate:t.vision_plan.due_date,mutationId:t.vision_plan.mutation_id}
  }
  async function read(from:string,to:string){
    if(!validDate(from)||!validDate(to)||to<from||Date.parse(to)-Date.parse(from)>366*86400000)throw new Error('Invalid range')
    const {data,error}=await db.from('day_entries').select('id,date,note,meta').eq('user_id',owner).gte('date',from).lte('date',to)
    if(error)throw error
    const result=new Map<string,any>()
    for(const row of data??[])for(const t of row.meta?._tasks??[])if(t.id?.startsWith(VISION_TASK_PREFIX)&&t.vision_plan?.client_id){
      const next=publicTask(t,row.date),prior=result.get(next.id)
      if(prior&&!prior.archived&&!next.archived)throw new VisionConflict(true)
      if(!prior||(!next.archived&&prior.archived)||(next.archived===prior.archived&&next.updatedAt>prior.updatedAt))result.set(next.id,next)
    }
    return [...result.values()]
  }
  async function sync(raw:any){
    const input=validateVisionTask(raw),id=taskId(input.id),sourceDate=input.previousDate??input.date
    if(!sourceDate)return {saved:true,task:null}
    const source=await load(sourceDate),existing=source?.meta._tasks.find((t:any)=>t.id===id)
    const selected=input.categoryId?categories.find(c=>c.id===input.categoryId):categories.find(c=>c.id===existing?.category_id)??category
    if(!selected||['schedule','deadline'].includes(selected.id))throw new Error('Invalid task category')
    const matches=(t:any)=>t?.vision_plan?.mutation_id===input.mutationId&&t.text===input.title&&t.done===input.done&&(!input.categoryId||t.category_id===input.categoryId)&&!!t.deleted_at===(input.archived||input.date===null)
    const alreadyMoved=existing?.deleted_at&&existing.vision_plan?.mutation_id===input.mutationId&&input.date!==sourceDate
    if(existing&&!matches(existing)&&!alreadyMoved&&((existing.updated_at??0)!==input.expectedUpdatedAt))throw new VisionConflict()
    if(!existing&&input.expectedUpdatedAt!==null)throw new VisionConflict()
    const moving=input.date!==null&&input.date!==sourceDate&&!input.archived
    let destination:any=null,destinationDate=input.date??sourceDate
    if(input.date!==null&&!input.archived){
      const records=await change(input.date,(records,dayId)=>{
        const previous=records.find(t=>t.id===id)
        if(previous&&matches(previous))return records
        if(input.date===sourceDate){if(previous&&(previous.updated_at??0)!==input.expectedUpdatedAt)throw new VisionConflict();if(!previous&&input.expectedUpdatedAt!==null)throw new VisionConflict()}
        else if(previous&&!previous.deleted_at)throw new VisionConflict()
        const now=Math.max(Date.now(),(previous?.updated_at??0)+1)
        const t={...(moving?existing:previous),id,day_id:dayId,text:input.title,done:input.done,deleted_at:undefined,discarded:false,
          category_id:selected.id,category_name:selected.name,category_color:selected.color,updated_at:now,
          vision_plan:{client_id:input.id,mutation_id:input.mutationId,completed_at:input.completedAt,due_date:input.dueDate},
          history:[...((moving?existing:previous)?.history??[]),{id:randomUUID(),at:new Date(now).toISOString(),kind:input.done&&!(moving?existing:previous)?.done?'completed':'edited',note:'Vision Plan 동기화'}].slice(-160)}
        return previous?records.map(x=>x.id===id?t:x):[...records,t]
      });destination=records.find(t=>t.id===id)
    }
    // Destination is verified before the old date is tombstoned. On a conflict
    // retain both records and report failure; never silently erase a new edit.
    if(existing&&(moving||input.archived||input.date===null)){
      try {await change(sourceDate,records=>{
        const previous=records.find(t=>t.id===id)
        if(previous?.deleted_at&&previous.vision_plan?.mutation_id===input.mutationId)return records
        if(!previous||(previous.updated_at??0)!==input.expectedUpdatedAt)throw new VisionConflict()
        const now=Math.max(Date.now(),(previous.updated_at??0)+1)
        const t={...previous,text:input.title,done:input.done,category_id:selected.id,category_name:selected.name,category_color:selected.color,deleted_at:now,updated_at:now,vision_plan:{...previous.vision_plan,mutation_id:input.mutationId,completed_at:input.completedAt,due_date:input.dueDate},history:[...(previous.history??[]),{id:randomUUID(),at:new Date(now).toISOString(),kind:'deleted',note:'Vision Plan 이동 또는 숨김'}].slice(-160)}
        if(!destination){destination=t;destinationDate=sourceDate}
        return records.map(x=>x.id===id?t:x)
      })}catch(error){if(destination)throw new VisionConflict(true);throw error}
    }
    if(!destination&&existing){destination=existing;destinationDate=sourceDate}
    return {saved:true,task:destination?publicTask(destination,destinationDate):null}
  }
  return {read,sync}
}
