'use client'
import { useState, useMemo, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Search, Trash2 } from 'lucide-react'
import { Textarea } from '@/components/ui'
import type { DayEntry, ShortGoal, JournalEntry, NoteEntry } from '@/types'
import clsx from 'clsx'

type JournalSource = 'day' | 'goal' | 'week'

interface JournalItem {
  id: string
  title: string
  body: string
  createdAt: string
  source: JournalSource
  sourceLabel: string
  sourceId: string
  secondaryId?: string
}

interface Props {
  days: DayEntry[]
  goals: ShortGoal[]
  onUpdateDayNote: (date: string, noteId: string, title: string, body: string) => void
  onDeleteDayNote: (date: string, noteId: string) => void
  onUpdateGoalNote: (goalId: string, noteId: string, text: string) => void
  onDeleteGoalNote: (goalId: string, noteId: string) => void
}

function highlightText(text: string, query: string) {
  if (!query.trim()) return text
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-[var(--amber-bg)] text-[var(--amber-text)] rounded-[2px] px-0.5">{part}</mark>
      : part
  )
}

export function JournalView({ days, goals, onUpdateDayNote, onDeleteDayNote, onUpdateGoalNote, onDeleteGoalNote }: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<JournalSource | 'all'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')

  const allItems = useMemo(() => {
    const items: JournalItem[] = []

    for (const day of days) {
      for (const note of (day.meta.notes ?? [])) {
        items.push({
          id: note.id,
          title: note.title,
          body: note.body,
          createdAt: note.createdAt,
          source: 'day',
          sourceLabel: format(parseISO(day.date), 'M월 d일', { locale: ko }),
          sourceId: day.date,
        })
      }
    }

    for (const goal of goals) {
      for (const note of (goal.notes ?? [])) {
        items.push({
          id: note.id,
          title: goal.title,
          body: note.text,
          createdAt: note.createdAt,
          source: 'goal',
          sourceLabel: goal.title,
          sourceId: goal.id,
        })
      }
    }

    if (typeof window !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith('planr_weekly_review_') && key.endsWith('_journal')) {
          try {
            const entries: JournalEntry[] = JSON.parse(localStorage.getItem(key) ?? '[]')
            const weekLabel = key.replace('planr_weekly_review_', '').replace('_journal', '')
            for (const entry of entries) {
              items.push({
                id: entry.id,
                title: entry.title,
                body: entry.body,
                createdAt: entry.createdAt,
                source: 'week',
                sourceLabel: weekLabel,
                sourceId: key,
                secondaryId: entry.id,
              })
            }
          } catch { /* ignore */ }
        }
      }
    }

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return items
  }, [days, goals])

  const filtered = useMemo(() => {
    let result = allItems
    if (filter !== 'all') result = result.filter(i => i.source === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(i =>
        i.title.toLowerCase().includes(q) || i.body.toLowerCase().includes(q)
      )
    }
    return result
  }, [allItems, filter, search])

  function handleSave(item: JournalItem) {
    if (item.source === 'day') {
      onUpdateDayNote(item.sourceId, item.id, editTitle.trim(), editBody.trim())
    } else if (item.source === 'goal') {
      onUpdateGoalNote(item.sourceId, item.id, editBody.trim())
    }
    setEditingId(null)
  }

  function handleDelete(item: JournalItem) {
    if (item.source === 'day') {
      onDeleteDayNote(item.sourceId, item.id)
    } else if (item.source === 'goal') {
      onDeleteGoalNote(item.sourceId, item.id)
    }
  }

  const filterPills: Array<{ key: JournalSource | 'all'; label: string }> = [
    { key: 'all', label: '전체' },
    { key: 'day', label: '일간' },
    { key: 'goal', label: '목표' },
    { key: 'week', label: '주간 회고' },
  ]

  const sourceBg: Record<JournalSource, string> = {
    day: 'bg-[var(--purple-bg)] text-[var(--purple-text)]',
    goal: 'bg-[var(--teal-bg)] text-[var(--teal-text)]',
    week: 'bg-[var(--amber-bg)] text-[var(--amber-text)]',
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-base font-bold">기록</h2>

      {/* Search + filters */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="메모 검색..."
            className="w-full pl-8 pr-3 py-2 rounded-[10px] text-sm bg-[var(--surface-2)] outline-none focus:ring-1 focus:ring-[var(--purple)]"
          />
        </div>
        <div className="flex gap-1">
          {filterPills.map(p => (
            <button key={p.key}
              onClick={() => setFilter(p.key)}
              className={clsx('px-2.5 py-1 rounded-full text-[11px] font-medium transition-all',
                filter === p.key ? 'bg-[var(--purple)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-3)] hover:bg-[var(--border)]'
              )}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-[var(--text-3)]">
            {search ? '검색 결과가 없습니다.' : '아직 기록이 없습니다. 일간 뷰나 목표 상세에서 메모를 작성해보세요.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map(item => {
            const isEditing = editingId === item.id
            let dateLabel = ''
            try { dateLabel = format(parseISO(item.createdAt), 'yyyy.M.d EEE HH:mm', { locale: ko }) } catch { dateLabel = item.createdAt }

            return (
              <div key={item.id} className="relative group/item">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={clsx('px-1.5 py-0.5 rounded-[4px] text-[10px] font-medium', sourceBg[item.source])}>
                    {item.sourceLabel}
                  </span>
                  <span className="text-[11px] text-[var(--text-3)]">{dateLabel}</span>
                </div>

                {isEditing ? (
                  <div className="p-4 rounded-[14px] bg-white border border-[var(--purple)] shadow-sm">
                    {item.source === 'day' && (
                      <input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="제목"
                        className="w-full px-3 py-2 mb-2 rounded-[10px] text-sm font-medium bg-[var(--surface-2)] outline-none" />
                    )}
                    <Textarea autoFocus value={editBody} onChange={e => setEditBody(e.target.value)}
                      rows={4} className="text-sm" />
                    <div className="flex gap-2 mt-2 justify-end">
                      <button onClick={() => setEditingId(null)} className="px-3 py-1 rounded-[8px] text-xs text-[var(--text-2)] hover:bg-[var(--border)]">취소</button>
                      <button onClick={() => handleSave(item)} className="px-3 py-1 rounded-[8px] text-xs font-medium bg-[var(--purple)] text-white">저장</button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-[14px] bg-[var(--surface-2)] hover:bg-white hover:border-[var(--border)] border border-transparent transition-all">
                    {item.title && item.source === 'day' && (
                      <h4 className="text-sm font-semibold text-[var(--text)] mb-1">{search ? highlightText(item.title, search) : item.title}</h4>
                    )}
                    <p onClick={() => {
                      if (item.source !== 'week') {
                        setEditingId(item.id)
                        setEditTitle(item.title)
                        setEditBody(item.body)
                      }
                    }}
                      className={clsx('text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap', item.source !== 'week' && 'cursor-text')}>
                      {search ? highlightText(item.body, search) : item.body}
                    </p>
                    {item.source !== 'week' && (
                      <button onClick={() => handleDelete(item)}
                        className="absolute top-8 right-3 opacity-0 group-hover/item:opacity-100 w-6 h-6 flex items-center justify-center text-[var(--text-3)] hover:text-[var(--coral)] rounded-[6px] hover:bg-[var(--coral-bg)] transition-all">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
