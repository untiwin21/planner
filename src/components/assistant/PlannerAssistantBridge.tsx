'use client'
import { useEffect, useState } from 'react'
import { assistantTools, runAssistantTool, type AssistantToolName } from '@/lib/plannerAssistant'
import { koreaToday, shiftDate } from '@/lib/scheduleConflicts'

interface ModelContext {
  registerTool: (tool: { name: string; description: string; inputSchema: object; annotations: object; execute: (input: Record<string, unknown>) => Promise<unknown> }, options?: { signal: AbortSignal }) => void | Promise<void>
  unregisterTool?: (name: string) => void
}
/** Browser-bound tools reuse Supabase Auth + RLS. No credentials leave the page. */
export function PlannerAssistantBridge({ userId, syncReady }: { userId: string; syncReady: boolean }) {
  const [state, setState] = useState('연결 확인 중')
  const [from, setFrom] = useState(koreaToday)
  const [to, setTo] = useState(() => shiftDate(koreaToday(), 6))
  const [command, setCommand] = useState('')
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!userId || !syncReady) { setState(userId ? '동기화 중' : '로그인 필요'); return }
    const context = (document as Document & { modelContext?: ModelContext }).modelContext
      ?? (navigator as Navigator & { modelContext?: ModelContext }).modelContext
    if (!context) { setState('일정 조회·수정 준비됨'); return }
    const abort = new AbortController()
    let disposed = false
    const registered: string[] = []
    async function register() {
      try {
        for (const tool of assistantTools) {
          if (disposed) return
          await context!.registerTool({ name: tool.name, description: tool.description,
            inputSchema: { type: 'object', properties: tool.properties, required: tool.required, additionalProperties: false },
            annotations: { readOnlyHint: tool.readOnly, untrustedContentHint: true },
            execute: async input => {
              try {
                const output = await runAssistantTool(tool.name, input)
                setResult(JSON.stringify(output, null, 2))
                return { content: [{ type: 'text', text: JSON.stringify(output) }] }
              } catch (error) {
                const message = error instanceof Error ? error.message : '실행 실패'
                setResult(message)
                return { isError: true, content: [{ type: 'text', text: message }] }
              }
            },
          }, { signal: abort.signal })
          registered.push(tool.name)
        }
        if (!disposed) setState('ChatGPT 일정 도구 준비됨')
      } catch { if (!disposed) setState('일정 조회·수정 준비됨') }
    }
    void register()
    return () => { disposed = true; abort.abort(); registered.forEach(name => { try { context.unregisterTool?.(name) } catch { /* already removed by AbortSignal */ } }) }
  }, [userId, syncReady])
  async function run(name: AssistantToolName, input: Record<string, unknown>) {
    setBusy(true)
    try { setResult(JSON.stringify(await runAssistantTool(name, input), null, 2)) }
    catch (error) { setResult(error instanceof Error ? error.message : '실행 실패') }
    finally { setBusy(false) }
  }
  return <details className="mx-4 mt-3 mb-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm">
    <summary className="cursor-pointer font-medium">ChatGPT 연동 · {state}</summary>
    <p className="mt-2 text-[var(--text-2)]">이 대화에서 일정 조회·등록·수정과 하루 피드백을 요청할 수 있습니다. 첫 연결에는 이 브라우저에서 Planner 로그인이 필요합니다.</p>
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label>조회 시작일<input aria-label="조회 시작일" type="date" value={from} onChange={e => setFrom(e.target.value)} className="block rounded border p-2" /></label>
      <label>조회 종료일<input aria-label="조회 종료일" type="date" value={to} onChange={e => setTo(e.target.value)} className="block rounded border p-2" /></label>
      <button type="button" disabled={busy || !syncReady || !userId} onClick={() => run('planner_read', { from, to })} className="rounded bg-[var(--purple)] px-3 py-2 text-white disabled:opacity-40">일정 조회</button>
    </div>
    <details className="mt-3">
      <summary className="cursor-pointer">연동 명령</summary>
      <label className="block mt-2">Planner 명령<textarea aria-label="Planner 명령" value={command} onChange={e => setCommand(e.target.value)} rows={4} className="mt-1 block w-full rounded border p-2 font-mono" placeholder={'{"tool":"planner_read","input":{"from":"2026-10-04","to":"2026-10-11"}}'} /></label>
      <button type="button" disabled={busy || !syncReady || !userId} onClick={() => {
        try {
          const parsed = JSON.parse(command)
          if (!assistantTools.some(tool => tool.name === parsed.tool) || !parsed.input || typeof parsed.input !== 'object' || Array.isArray(parsed.input)) throw new Error('올바른 tool과 input이 필요합니다.')
          void run(parsed.tool, parsed.input)
        } catch (error) { setResult(error instanceof Error ? error.message : '명령 오류') }
      }} className="mt-2 rounded bg-[var(--purple)] px-3 py-2 text-white disabled:opacity-40">명령 실행</button>
    </details>
    {result && <pre aria-label="Planner 실행 결과" className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--surface-2)] p-3 text-sm">{result}</pre>}
  </details>
}
