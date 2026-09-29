'use client'

import { Fragment, useEffect, useState } from 'react'
import { Bot, Pencil } from 'lucide-react'
import { format } from 'date-fns'
import type { DayMeta } from '@/types'
import { Textarea } from '@/components/ui'

interface Props {
  date: string
  meta: DayMeta
  onMetaChange: (patch: Partial<DayMeta>) => void
}

/** JARVIS's final feedback for the day, kept at the top of the today view. */
export function JarvisReviewPanel({ date, meta, onMetaChange }: Props) {
  const content = meta.jarvisReview?.content ?? ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content)

  useEffect(() => { setEditing(false) }, [date])

  function startEdit() {
    setDraft(content)
    setEditing(true)
  }

  function save() {
    const next = draft.trim()
    if (next !== content) onMetaChange({ jarvisReview: { content: next, updated_at: Date.now() } })
    setEditing(false)
  }

  const updatedAt = meta.jarvisReview?.updated_at

  return (
    <div className="mb-3 rounded-[16px] border border-[var(--teal)]/30 bg-[var(--teal-bg)]/40 px-4 py-3">
      <div className="flex items-center gap-2">
        <Bot size={15} className="text-[var(--teal)]" />
        <h3 className="text-sm font-bold">JARVIS 최종 피드백</h3>
        {updatedAt && content && !editing && (
          <span className="text-[10px] text-[var(--text-3)] tabular-nums">
            {format(updatedAt, 'M/d HH:mm')} · {meta.jarvisReview?.jarvis_id ? '자동 기록' : '직접 수정'}
          </span>
        )}
        {!editing && (
          <button type="button" onClick={startEdit} className="ml-auto flex items-center gap-1 rounded-[8px] px-2 py-1 text-[11px] font-semibold text-[var(--teal-text)] hover:bg-white/70">
            <Pencil size={11} /> {content ? '수정' : '기록하기'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <Textarea autoFocus rows={6} value={draft} onChange={event => setDraft(event.target.value)}
            placeholder={'JARVIS가 준 오늘의 최종 피드백을 붙여 넣으세요.\n### Summary / ### Keep / ### Problem / ### Try 형식도 그대로 보입니다.'}
            className="text-sm bg-white" />
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={save} className="flex-1 rounded-[8px] bg-[var(--teal)] py-1.5 text-xs font-semibold text-white hover:opacity-90">저장</button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-[8px] px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-white/70">취소</button>
          </div>
        </div>
      ) : content ? (
        <div className="mt-2"><FeedbackMarkdown text={content} /></div>
      ) : (
        <p className="mt-1 text-xs text-[var(--text-3)]">JARVIS가 하루 회고를 마치면 여기에 자동으로 기록됩니다.</p>
      )}
    </div>
  )
}

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <Fragment key={index}>{part}</Fragment>)
}

/** Just enough markdown for the Summary / Keep / Problem / Try format. */
function FeedbackMarkdown({ text }: { text: string }) {
  const lines = text.split('\n').map(line => line.trimEnd()).filter(line => line.trim())
  return (
    <div className="flex flex-col gap-0.5 text-[13px] leading-relaxed text-[var(--text)]">
      {lines.map((line, index) => {
        const heading = line.match(/^#{1,6}\s+(.*)$/)
        if (heading) return <p key={index} className="mt-1.5 first:mt-0 text-[11px] font-bold uppercase tracking-wide text-[var(--teal-text)]">{inline(heading[1])}</p>
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
        if (bullet) return <p key={index} className="relative pl-3 before:absolute before:left-0 before:text-[var(--text-3)] before:content-['•']">{inline(bullet[1])}</p>
        return <p key={index}>{inline(line)}</p>
      })}
    </div>
  )
}
