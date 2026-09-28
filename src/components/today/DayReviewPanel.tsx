'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import { format } from 'date-fns'
import clsx from 'clsx'
import type { DayMeta, DayReview } from '@/types'
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

export function DayReviewPanel({ date, meta, onMetaChange, compact = false }: Props) {
  const [draft, setDraft] = useState(() => draftOf(meta.review))
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const editing = useRef(false)

  // Follow the stored review (other devices, date changes) unless the user is typing right now.
  useEffect(() => {
    if (!editing.current) setDraft(draftOf(meta.review))
  }, [date, meta.review])

  useEffect(() => { setSavedAt(null) }, [date])

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
          <h3 className="text-sm font-bold flex items-center gap-1.5"><MessageSquareText size={15} className="text-[var(--purple)]" /> 오늘 회고</h3>
          <p className="text-xs text-[var(--text-3)] mt-0.5">오늘 하루를 돌아보고 내일 바꿀 것을 적어두세요.</p>
        </div>
        {savedAt && <span className="shrink-0 text-[10px] font-semibold text-[var(--teal-text)]">저장됨 {format(savedAt, 'HH:mm')}</span>}
      </div>

      <div className={clsx('grid gap-3', compact ? 'grid-cols-1' : 'lg:grid-cols-3')}>
        {FIELDS.map(field => (
          <label key={field.key} className="block">
            <span className="mb-1 flex items-center gap-2">
              <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', field.tone)}>{field.label}</span>
              <span className="text-[11px] text-[var(--text-3)]">{field.hint}</span>
            </span>
            <Textarea
              rows={compact ? 2 : 3}
              value={draft[field.key]}
              onFocus={() => { editing.current = true }}
              onChange={event => setDraft(prev => ({ ...prev, [field.key]: event.target.value }))}
              onBlur={commit}
              placeholder={field.hint}
              className="text-sm"
            />
          </label>
        ))}
      </div>
    </div>
  )
}
