'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, CalendarDays, Save, X } from 'lucide-react'
import clsx from 'clsx'
import type { ScheduleType, ShortGoal } from '@/types'
import { PLAN_CATEGORY_STYLE, PLAN_CATEGORY_TYPES, shortGoalCategory, withShortGoalCategory } from '@/lib/planCategory'

interface Props {
  goal: ShortGoal | null
  onClose: () => void
  onSave: (goalId: string, patch: Partial<ShortGoal>) => void
  onOpenDetail?: (goalId: string) => void
}

export function ShortGoalEditModal({ goal, onClose, onSave, onOpenDetail }: Props) {
  const [title, setTitle] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [note, setNote] = useState('')
  const [categoryType, setCategoryType] = useState<ScheduleType>('personal')

  useEffect(() => {
    if (!goal) return
    setTitle(goal.title)
    setDateFrom(goal.date_from)
    setDateTo(goal.date_to)
    setNote(goal.note ?? '')
    setCategoryType(shortGoalCategory(goal))
  }, [goal])

  if (!goal) return null

  const invalidRange = !!dateFrom && !!dateTo && dateFrom > dateTo
  const canSave = title.trim().length > 0 && !!dateFrom && !!dateTo && !invalidRange

  function save() {
    if (!canSave) return
    onSave(goal!.id, {
      title: title.trim(),
      date_from: dateFrom,
      date_to: dateTo,
      note,
      categories: withShortGoalCategory(goal!.categories, categoryType),
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="단기 목표 수정"
        className="w-full max-w-md rounded-[20px] border border-[var(--border)] bg-white p-5 shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[var(--teal)]">
              <CalendarDays size={16} />
              <h2 className="text-base font-bold">단기 목표 수정</h2>
            </div>
            <p className="mt-1 text-xs text-[var(--text-3)]">기간과 카테고리를 고치면 주간 카드와 월간 캘린더에 함께 반영됩니다.</p>
          </div>
          <button type="button" aria-label="닫기" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-[var(--surface-2)]">
            <X size={17} />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">목표 제목</label>
            <input
              autoFocus
              value={title}
              onChange={event => setTitle(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') save() }}
              className="w-full rounded-[10px] border border-transparent bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--teal)] focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">카테고리</label>
            <div className="grid grid-cols-3 gap-2">
              {PLAN_CATEGORY_TYPES.map(type => {
                const meta = PLAN_CATEGORY_STYLE[type]
                return (
                  <button
                    type="button"
                    key={type}
                    onClick={() => setCategoryType(type)}
                    className={clsx(
                      'flex items-center justify-center gap-1.5 rounded-[9px] border px-2 py-2 text-xs font-semibold transition-all',
                      meta.event,
                      categoryType === type ? 'ring-2 ring-offset-1 ring-[var(--purple)]' : 'opacity-70 hover:opacity-100',
                    )}
                  >
                    <span className={clsx('h-2 w-2 rounded-full', meta.dot)} />
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">시작일</label>
              <input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="w-full rounded-[10px] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--teal)]" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">종료일</label>
              <input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className="w-full rounded-[10px] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--teal)]" />
            </div>
          </div>
          {invalidRange && <p className="-mt-2 text-xs font-medium text-red-500">종료일은 시작일보다 빠를 수 없습니다.</p>}

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">메모</label>
            <textarea value={note} onChange={event => setNote(event.target.value)} rows={3} placeholder="목표를 기억하는 데 필요한 내용을 적어두세요." className="w-full resize-none rounded-[10px] border border-transparent bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--teal)] focus:bg-white" />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          {onOpenDetail && (
            <button type="button" onClick={() => { onOpenDetail(goal.id); onClose() }} className="flex items-center gap-1.5 rounded-[10px] px-3 py-2.5 text-sm font-semibold text-[var(--text-2)] hover:bg-[var(--surface-2)]">
              상세 관리 <ArrowRight size={14} />
            </button>
          )}
          <button type="button" disabled={!canSave} onClick={save} className="ml-auto flex items-center justify-center gap-1.5 rounded-[10px] bg-[var(--teal)] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
            <Save size={14} /> 저장
          </button>
        </div>
      </div>
    </div>
  )
}
