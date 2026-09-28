'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { Bot, ChevronDown, MessageSquareText } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import clsx from 'clsx'
import type { DayMeta, DayReview, JarvisFeedbackEntry } from '@/types'
import { Textarea } from '@/components/ui'

type ReviewField = 'keep' | 'problem' | 'try'

const FIELDS: Array<{ key: ReviewField; label: string; hint: string; tone: string }> = [
  { key: 'keep', label: 'Keep', hint: '잘 된 것, 계속할 것', tone: 'text-[var(--teal-text)] bg-[var(--teal-bg)]' },
  { key: 'problem', label: 'Problem', hint: '막혔던 것, 아쉬운 것', tone: 'text-[var(--amber-text)] bg-[var(--amber-bg)]' },
  { key: 'try', label: 'Try', hint: '내일 바꿔볼 작은 행동', tone: 'text-[var(--purple-text)] bg-[var(--purple-bg)]' },
]

interface Props {
  date: string
  meta: DayMeta
  onMetaChange: (patch: Partial<DayMeta>) => void
  compact?: boolean
}

function draftOf(review?: DayReview): Record<ReviewField, string> {
  return { keep: review?.keep ?? '', problem: review?.problem ?? '', try: review?.try ?? '' }
}

export function DayFeedbackPanel({ date, meta, onMetaChange, compact = false }: Props) {
  const [draft, setDraft] = useState(() => draftOf(meta.review))
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const editing = useRef(false)
  const feedback = [...(meta.jarvisFeedback ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const [openId, setOpenId] = useState<string | null>(null)
  const expandedId = openId ?? feedback[0]?.id ?? null

  // Follow the stored review (other devices, date changes) unless the user is typing right now.
  useEffect(() => {
    if (!editing.current) setDraft(draftOf(meta.review))
  }, [date, meta.review])

  useEffect(() => { setOpenId(null); setSavedAt(null) }, [date])

  function commit() {
    editing.current = false
    const stored = draftOf(meta.review)
    if (FIELDS.every(({ key }) => stored[key] === draft[key])) return
    const at = Date.now()
    onMetaChange({ review: { keep: draft.keep, problem: draft.problem, try: draft.try, updated_at: at } })
    setSavedAt(at)
  }

  return (
    <div className="bg-white border border-[var(--border)] rounded-[18px] p-4 mt-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-1.5"><MessageSquareText size={15} className="text-[var(--purple)]" /> 하루 피드백</h3>
          <p className="text-xs text-[var(--text-3)] mt-0.5">오늘을 돌아보고, JARVIS가 보낸 점검·회고도 여기서 함께 봅니다.</p>
        </div>
        {savedAt && <span className="shrink-0 text-[10px] font-semibold text-[var(--teal-text)]">저장됨 {format(savedAt, 'HH:mm')}</span>}
      </div>

      <div className={clsx('grid gap-4', compact ? 'grid-cols-1' : 'lg:grid-cols-2')}>
        <section className="flex flex-col gap-2.5">
          <h4 className="text-xs font-bold text-[var(--text-2)]">내 피드백</h4>
          {FIELDS.map(field => (
            <label key={field.key} className="block">
              <span className="mb-1 flex items-center gap-2">
                <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', field.tone)}>{field.label}</span>
                <span className="text-[11px] text-[var(--text-3)]">{field.hint}</span>
              </span>
              <Textarea
                rows={2}
                value={draft[field.key]}
                onFocus={() => { editing.current = true }}
                onChange={event => setDraft(prev => ({ ...prev, [field.key]: event.target.value }))}
                onBlur={commit}
                placeholder={field.hint}
                className="text-sm"
              />
            </label>
          ))}
        </section>

        <section className="flex flex-col gap-2 min-w-0">
          <h4 className="text-xs font-bold text-[var(--text-2)] flex items-center gap-1.5"><Bot size={13} className="text-[var(--teal)]" /> JARVIS 피드백</h4>
          {feedback.length === 0 ? (
            <p className="rounded-[12px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)]/50 px-3 py-5 text-center text-xs text-[var(--text-3)] leading-relaxed">
              아직 받은 피드백이 없어요.<br />JARVIS가 중간 점검이나 하루 회고를 마치면 여기로 자동으로 들어옵니다.
            </p>
          ) : feedback.map(item => (
            <JarvisFeedbackCard key={item.id} item={item} open={item.id === expandedId}
              onToggle={() => setOpenId(item.id === expandedId ? '' : item.id)} />
          ))}
        </section>
      </div>
    </div>
  )
}

function JarvisFeedbackCard({ item, open, onToggle }: { item: JarvisFeedbackEntry; open: boolean; onToggle: () => void }) {
  const at = parseISO(item.created_at)
  const time = Number.isNaN(at.getTime()) ? '' : format(at, 'M/d HH:mm')
  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--teal-bg)]/25">
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <span className="rounded-full bg-[var(--teal-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--teal-text)]">{item.label || item.kind}</span>
        <span className="text-[11px] text-[var(--text-3)] tabular-nums">{time}</span>
        <ChevronDown size={14} className={clsx('ml-auto text-[var(--text-3)] transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-3 pb-3"><FeedbackMarkdown text={item.content} /></div>}
    </div>
  )
}

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <Fragment key={index}>{part}</Fragment>)
}

/** Just enough markdown for JARVIS's Summary / Keep / Problem / Try format. */
function FeedbackMarkdown({ text }: { text: string }) {
  const lines = text.split('\n').map(line => line.trimEnd()).filter(line => line.trim())
  return (
    <div className="flex flex-col gap-1 text-[13px] leading-relaxed text-[var(--text)]">
      {lines.map((line, index) => {
        const heading = line.match(/^#{1,6}\s+(.*)$/)
        if (heading) return <p key={index} className="mt-1.5 first:mt-0 text-[11px] font-bold uppercase tracking-wide text-[var(--teal-text)]">{inline(heading[1])}</p>
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
        if (bullet) return <p key={index} className="pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-[var(--text-3)]">{inline(bullet[1])}</p>
        return <p key={index}>{inline(line)}</p>
      })}
    </div>
  )
}
