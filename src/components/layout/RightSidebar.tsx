'use client'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isWithinInterval, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { formatDate } from '@/lib/dates'
import type { LongGoal, ShortGoal } from '@/types'
import clsx from 'clsx'

const CAT_COLORS: Array<LongGoal['color']> = ['purple', 'teal', 'amber', 'coral', 'blue']
const COLOR_DOT: Record<string, string> = { purple: 'var(--purple)', teal: 'var(--teal)', amber: 'var(--amber)', coral: 'var(--coral)', blue: 'var(--blue)' }
const COLOR_BG: Record<string, string> = { purple: 'var(--purple-bg)', teal: 'var(--teal-bg)', amber: 'var(--amber-bg)', coral: 'var(--coral-bg)', blue: 'var(--blue-bg)' }
const COLOR_TEXT: Record<string, string> = { purple: 'var(--purple-text)', teal: 'var(--teal-text)', amber: 'var(--amber-text)', coral: 'var(--coral-text)', blue: 'var(--blue-text)' }
const COLOR_LABELS: Record<string, string> = { purple: '보라', teal: '청록', amber: '호박', coral: '코랄', blue: '파랑' }

interface Props {
  longGoals: LongGoal[]
  shortGoals: ShortGoal[]
  selectedDate: string
  onSelectDate: (date: string) => void
  onAddLongGoal: (g: Omit<LongGoal, 'id'>) => void
  onDeleteLongGoal: (id: string) => void
}

export function RightSidebar({ longGoals, shortGoals, selectedDate, onSelectDate, onAddLongGoal, onDeleteLongGoal }: Props) {
  const [calMonth, setCalMonth] = useState(new Date())
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', date_from: '', date_to: '', color: 'purple' as LongGoal['color'] })

  function handleAdd() {
    if (!form.title.trim() || !form.date_from || !form.date_to) return
    onAddLongGoal({ ...form })
    setForm({ title: '', description: '', date_from: '', date_to: '', color: 'purple' })
    setShowForm(false)
  }

  const monthStart = startOfMonth(calMonth)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(calMonth), { weekStartsOn: 1 })
  const calDays: Date[] = []
  let cur = gridStart
  while (cur <= gridEnd) { calDays.push(cur); cur = addDays(cur, 1) }

  return (
    <div className="flex flex-col gap-4">
      {/* Mini Calendar */}
      <div className="bg-white border border-[var(--border)] rounded-[16px] p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setCalMonth(subMonths(calMonth, 1))} className="w-6 h-6 rounded-[6px] flex items-center justify-center hover:bg-[var(--surface-2)]"><ChevronLeft size={13} /></button>
          <span className="text-xs font-semibold">{format(calMonth, 'yyyy년 M월', { locale: ko })}</span>
          <button onClick={() => setCalMonth(addMonths(calMonth, 1))} className="w-6 h-6 rounded-[6px] flex items-center justify-center hover:bg-[var(--surface-2)]"><ChevronRight size={13} /></button>
        </div>
        <div className="grid grid-cols-7 mb-1">
          {['월','화','수','목','금','토','일'].map(d => (
            <div key={d} className="text-center text-[9px] font-medium text-[var(--text-3)] py-0.5">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {calDays.map((day, i) => {
            const ds = formatDate(day)
            const isThisMonth = isSameMonth(day, calMonth)
            const isSelected = ds === selectedDate
            const isToday = isSameDay(day, new Date())
            const dayLongGoals = longGoals.filter(g => { try { return isWithinInterval(day, { start: parseISO(g.date_from), end: parseISO(g.date_to) }) } catch { return false } })
            const hasShort = shortGoals.some(g => ds >= g.date_from && ds <= g.date_to)
            return (
              <button key={i} onClick={() => onSelectDate(ds)}
                className={clsx('flex flex-col items-center py-0.5 rounded-[6px] transition-all',
                  isSelected ? 'bg-[var(--purple)]' : isToday ? 'bg-[var(--purple-bg)]' : 'hover:bg-[var(--surface-2)]',
                  !isThisMonth && 'opacity-25'
                )}>
                <span className={clsx('text-[11px] font-medium leading-none',
                  isSelected ? 'text-white' : isToday ? 'text-[var(--purple)]' : 'text-[var(--text)]'
                )}>{day.getDate()}</span>
                <div className="flex gap-0.5 mt-0.5 min-h-[4px]">
                  {dayLongGoals.slice(0, 3).map(g => <span key={g.id} className="w-1 h-1 rounded-full" style={{ background: COLOR_DOT[g.color] }} />)}
                  {hasShort && dayLongGoals.length === 0 && <span className="w-1 h-1 rounded-full bg-[var(--teal)]" />}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Long Goals */}
      <div className="bg-white border border-[var(--border)] rounded-[16px] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">장기 목표</h3>
          <button onClick={() => setShowForm(v => !v)} className="w-6 h-6 rounded-[6px] flex items-center justify-center text-[var(--text-3)] hover:bg-[var(--surface-2)]"><Plus size={13} /></button>
        </div>

        {showForm && (
          <div className="mb-3 flex flex-col gap-2 p-3 rounded-[10px] bg-[var(--surface-2)] border border-[var(--border)]">
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="목표 제목" autoFocus
              className="w-full px-2 py-1.5 rounded-[8px] text-sm bg-white border border-[var(--border)] outline-none focus:border-[var(--purple)]" />
            <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="설명 (선택)"
              className="w-full px-2 py-1.5 rounded-[8px] text-sm bg-white border border-[var(--border)] outline-none focus:border-[var(--purple)]" />
            <div className="grid grid-cols-2 gap-1.5">
              <div><label className="text-[9px] text-[var(--text-3)] block mb-0.5">시작</label>
                <input type="date" value={form.date_from} onChange={e => setForm(p => ({ ...p, date_from: e.target.value }))} className="w-full px-2 py-1 rounded-[8px] text-[11px] bg-white border border-[var(--border)] outline-none" /></div>
              <div><label className="text-[9px] text-[var(--text-3)] block mb-0.5">종료</label>
                <input type="date" value={form.date_to} onChange={e => setForm(p => ({ ...p, date_to: e.target.value }))} className="w-full px-2 py-1 rounded-[8px] text-[11px] bg-white border border-[var(--border)] outline-none" /></div>
            </div>
            <div className="flex gap-1 flex-wrap">
              {CAT_COLORS.map(c => (
                <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                  className={clsx('px-2 py-0.5 rounded-[6px] text-[10px] font-medium', form.color === c && 'ring-2 ring-offset-1')}
                  style={{ background: COLOR_BG[c], color: COLOR_TEXT[c] }}>{COLOR_LABELS[c]}</button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <button onClick={handleAdd} className="flex-1 py-1.5 rounded-[8px] text-xs font-medium text-white" style={{ background: COLOR_DOT[form.color] }}>추가</button>
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded-[8px] text-xs text-[var(--text-2)] hover:bg-[var(--border)]">취소</button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          {longGoals.length === 0 && !showForm && <p className="text-xs text-[var(--text-3)]">장기 목표를 추가해보세요.</p>}
          {longGoals.map(g => {
            const from = g.date_from ? format(parseISO(g.date_from), 'yy.M.d') : ''
            const to = g.date_to ? format(parseISO(g.date_to), 'yy.M.d') : ''
            return (
              <div key={g.id} className="flex items-start gap-2 group p-2 rounded-[10px] hover:bg-[var(--surface-2)] transition-colors">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1" style={{ background: COLOR_DOT[g.color] }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: COLOR_TEXT[g.color] }}>{g.title}</p>
                  {g.description && <p className="text-[10px] text-[var(--text-3)] truncate">{g.description}</p>}
                  <p className="text-[9px] text-[var(--text-3)] mt-0.5">{from} — {to}</p>
                </div>
                <button onClick={() => onDeleteLongGoal(g.id)} className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-[var(--text-3)] hover:text-[var(--coral)] transition-all flex-shrink-0">
                  <Trash2 size={11} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
