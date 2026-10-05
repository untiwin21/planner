import { createClient } from '@supabase/supabase-js'
import { assistantTools, createAssistantRunner, type AssistantToolName } from '@/lib/plannerAssistant'
import { authorizedAssistant } from '@/lib/assistantApiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers })

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const owner = process.env.PLANNER_ASSISTANT_USER_ID
  const hash = process.env.PLANNER_ASSISTANT_TOKEN_SHA256
  if (!url || !key || !owner || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner)
    || !hash || !/^[a-f0-9]{64}$/i.test(hash)) return null
  return { url, key, owner, hash }
}

function access(request: Request) {
  const config = configuration()
  if (!config) return { error: reply({ error: 'Assistant connection is not configured.' }, 503) }
  if (!authorizedAssistant(request.headers.get('authorization'), config.hash)) {
    return { error: reply({ error: 'Unauthorized' }, 401) }
  }
  return { config }
}

export async function GET(request: Request) {
  const result = access(request)
  if (result.error) return result.error
  return reply({ ready: true, timezone: 'Asia/Seoul', tools: assistantTools })
}

export async function POST(request: Request) {
  const result = access(request)
  if (result.error) return result.error
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'JSON required' }, 415)
  // Bound streamed bodies too, rather than trusting Content-Length.
  const reader = request.body?.getReader()
  if (!reader) return reply({ error: 'JSON required' }, 400)
  let body = '', size = 0
  const decoder = new TextDecoder()
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 65536) { await reader.cancel(); return reply({ error: 'Payload too large' }, 413) }
      body += decoder.decode(chunk.value, { stream: true })
    }
    body += decoder.decode()
    const parsed = JSON.parse(body)
    if (!parsed || Array.isArray(parsed) || Object.keys(parsed).some(k => !['tool', 'input'].includes(k))) throw new Error('Invalid command')
    const tool = assistantTools.find(item => item.name === parsed.tool)
    if (!tool || !parsed.input || typeof parsed.input !== 'object' || Array.isArray(parsed.input)) throw new Error('Invalid command')
    if (Object.keys(parsed.input).some(k => !(k in tool.properties))) throw new Error('Invalid input field')
    const { url, key, owner } = result.config!
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    const run = createAssistantRunner(client, owner)
    const output = await run(tool.name as AssistantToolName, parsed.input)
    return reply(output)
  } catch {
    // Database/auth errors may contain private details; do not echo them or secrets.
    return reply({ error: 'Command failed. Read current records and verify input before retrying.' }, 400)
  }
}
