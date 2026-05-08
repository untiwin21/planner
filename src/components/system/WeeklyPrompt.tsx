'use client'
import { useState, useEffect } from 'react'
import { formatDate } from '@/lib/dates'
import { X } from 'lucide-react'

interface Props {
  weekKey: string
  onGoToBig3: () => void
  onGoToReview: () => void
}

export function WeeklyPrompt({ weekKey, onGoToBig3, onGoToReview }: Props) {
  const [dismissed, setDismissed] = useState(true)
  const [promptType, setPromptType] = useState<'monday' | 'sunday' | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const today = new Date()
    const dayOfWeek = today.getDay()
    const dismissKey = `planr_prompt_dismissed_${formatDate(today)}`
    if (localStorage.getItem(dismissKey)) { setDismissed(true); return }

    if (dayOfWeek === 1) {
      const big3Key = `planr_week_big3_${weekKey}`
      if (!localStorage.getItem(big3Key)) {
        setPromptType('monday')
        setDismissed(false)
      }
    } else if (dayOfWeek === 0) {
      const journalKey = `planr_weekly_review_${weekKey}_journal`
      try {
        const entries = JSON.parse(localStorage.getItem(journalKey) ?? '[]')
        if (entries.length === 0) {
          setPromptType('sunday')
          setDismissed(false)
        }
      } catch {
        setPromptType('sunday')
        setDismissed(false)
      }
    }
  }, [weekKey])

  function handleDismiss() {
    setDismissed(true)
    localStorage.setItem(`planr_prompt_dismissed_${formatDate(new Date())}`, '1')
  }

  if (dismissed || !promptType) return null

  return (
    <div className={`flex items-center gap-3 p-4 rounded-[14px] bg-white border-l-4 border ${
      promptType === 'monday' ? 'border-l-[var(--purple)] border-[var(--border)]' : 'border-l-[var(--teal)] border-[var(--border)]'
    }`}>
      <div className="flex-1">
        {promptType === 'monday' ? (
          <>
            <p className="text-sm font-semibold text-[var(--text)]">이번 주의 핵심 3가지를 정해보세요</p>
            <p className="text-xs text-[var(--text-3)] mt-0.5">Big 3를 설정하면 주간 집중도가 높아집니다.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-[var(--text)]">이번 주를 돌아볼 시간입니다</p>
            <p className="text-xs text-[var(--text-3)] mt-0.5">주간 회고를 작성하고 다음 주를 준비하세요.</p>
          </>
        )}
      </div>
      <button onClick={promptType === 'monday' ? onGoToBig3 : onGoToReview}
        className={`px-3 py-1.5 rounded-[8px] text-xs font-medium text-white ${
          promptType === 'monday' ? 'bg-[var(--purple)]' : 'bg-[var(--teal)]'
        }`}>
        {promptType === 'monday' ? 'Big 3 설정하기' : '주간 회고 작성'}
      </button>
      <button onClick={handleDismiss}
        className="w-6 h-6 flex items-center justify-center text-[var(--text-3)] hover:bg-[var(--surface-2)] rounded-[6px]">
        <X size={14} />
      </button>
    </div>
  )
}
