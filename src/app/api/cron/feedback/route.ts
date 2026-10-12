import { createHash, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createAssistantRunner } from '@/lib/plannerAssistant'
import { claimFeedback, generateFeedback, saveDailyFeedback } from '@/lib/dailyFeedback'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 32) return reply({ error: 'Cron authentication is not configured' }, 503)
  const digest = (value: string) => createHash('sha256').update(value).digest()
  if (!timingSafeEqual(digest(request.headers.get('authorization') ?? ''), digest(`Bearer ${secret}`))) return reply({ error: 'Unauthorized' }, 401)
  // Production account/date are derived on the server; callers cannot override them.
  if (new URL(request.url).search) return reply({ error: 'Parameters are not accepted' }, 400)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const owner = process.env.PLANNER_ASSISTANT_USER_ID, apiKey = process.env.OPENAI_API_KEY
  if (!url || !key || !apiKey || !owner || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner)) return reply({ error: 'Feedback service is not configured' }, 503)
  const now = new Date()
  const korea = new Date(now.getTime() + 9 * 3600000).toISOString()
  const date = korea.slice(0, 10), asOf = korea.slice(11, 16)
  if (asOf < '22:00') return reply({ saved: false, skipped: 'before_daily_window' })
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  let finish: Awaited<ReturnType<typeof claimFeedback>> = null
  try {
    finish = await claimFeedback(db, owner, date, now.getTime())
    if (!finish) return reply({ saved: false, skipped: 'already_attempted_today' })
    const run = createAssistantRunner(db, owner, undefined, true)
    const result = await saveDailyFeedback(run, date, asOf, input => generateFeedback(input, apiKey, process.env.PLANNER_FEEDBACK_MODEL ?? 'gpt-4.1-mini'))
    await finish(result.saved ? 'saved' : 'skipped')
    return reply(result)
  } catch {
    try { await finish?.('failed') } catch { /* keep the durable lock on uncertain outcomes */ }
    // Provider responses and journal data must not enter Vercel logs or responses.
    return reply({ saved: false, error: 'Feedback generation or save failed. Check service configuration.' }, 500)
  }
}
