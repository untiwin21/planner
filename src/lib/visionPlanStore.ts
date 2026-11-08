import { randomUUID } from 'node:crypto'

// Same schema as Vision Board; only this dedicated owner namespace is accessed.
const metrics = require('./visionPlanMetrics.cjs')
const KEY = '__vision_plan_document_v1__'
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
export class PlanDocumentConflict extends Error {}
export function createVisionPlanStore(db: any, owner: string) {
  async function row() {
    const { data, error } = await db.from('weekly_reviews').select('content').eq('user_id', owner).eq('week_key', KEY).maybeSingle()
    if (error) throw error
    return data?.content ? JSON.parse(data.content) : null
  }
  async function read() {
    const stored = await row()
    return { revision: stored?.revision ?? null, document: stored?.document ?? null }
  }
  async function write(body: any) {
    if (Object.keys(body).some(k => !['op', 'expectedRevision', 'requestId', 'document'].includes(k)) || (body.expectedRevision !== null && !uuid(body.expectedRevision)) || !uuid(body.requestId)) throw new Error('Invalid revision')
    const document = metrics.validate(body.document)
    if (JSON.stringify(document).length > 2 * 1024 * 1024) throw new Error('Document too large')
    const previous = await row()
    if (previous?.revision === body.requestId) return { saved: true, revision: previous.revision }
    if ((previous?.revision ?? null) !== body.expectedRevision) throw new PlanDocumentConflict()
    const value = { revision: body.requestId, document, updatedAt: new Date().toISOString(), previous: previous ? { revision: previous.revision, document: previous.document, updatedAt: previous.updatedAt } : null }
    const content = JSON.stringify(value)
    if (!previous) {
      const { error } = await db.from('weekly_reviews').insert({ id: randomUUID(), user_id: owner, week_key: KEY, content })
      if (error?.code === '23505') throw new PlanDocumentConflict()
      if (error) throw error
    } else {
      // Short prefix predicate is atomic and avoids placing a large private
      // document in a PostgREST URL. UUIDs cannot contain LIKE wildcards.
      const { data, error } = await db.from('weekly_reviews').update({ content }).eq('user_id', owner).eq('week_key', KEY).like('content', '{"revision":"' + body.expectedRevision + '",%').select('id')
      if (error) throw error
      if (!data?.length) throw new PlanDocumentConflict()
    }
    return { saved: true, revision: body.requestId }
  }
  return { read, write }
}
