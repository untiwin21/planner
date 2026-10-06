import { createClient } from '@supabase/supabase-js'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

// Authenticate the browser JWT, derive the owner on the server, then use the
// existing atomic CAS RPC. Large task histories never enter the request URL.
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return reply({ error: 'Sync unavailable' }, 503)
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1]
  if (!token) return reply({ error: 'Unauthorized' }, 401)
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const { data, error } = await db.auth.getUser(token)
    if (error || !data.user) return reply({ error: 'Unauthorized' }, 401)
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'JSON required' }, 415)
    const reader = request.body?.getReader()
    if (!reader) return reply({ error: 'Invalid input' }, 400)
    const chunks: Uint8Array[] = []; let size = 0
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 2 * 1024 * 1024) { await reader.cancel(); return reply({ error: 'Payload too large' }, 413) }
      chunks.push(chunk.value)
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const object = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v)
    if (!body || typeof body.id !== 'string' || body.id.length > 200 || !object(body.expected) || !object(body.next)
      || typeof body.note !== 'string' || typeof body.expectedNote !== 'string'
      || Object.keys(body).some(k => !['id','expected','next','note','expectedNote'].includes(k))) return reply({ error: 'Invalid input' }, 400)
    const { data: rows, error: writeError } = await db.rpc('planner_compare_and_swap_day', {
      p_user_id: data.user.id, p_day_id: body.id, p_expected: body.expected, p_next: body.next,
    })
    if (writeError) return reply({ error: 'Save failed' }, 500)
    if (!rows?.length) return reply({ saved: false })
    if (body.note !== body.expectedNote) {
      const { error: noteError } = await db.from('day_entries').update({ note: body.note })
        .eq('id', body.id).eq('user_id', data.user.id).eq('note', body.expectedNote)
      if (noteError) return reply({ error: 'Save failed' }, 500)
    }
    return reply({ saved: true })
  } catch { return reply({ error: 'Sync failed' }, 400) }
}
