'use client'
import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { tasksProgress } from '@/lib/taskProgress'
import type { LongGoal, ShortGoal } from '@/types'
import clsx from 'clsx'

const COLOR_DOT: Record<string, string> = { purple: 'var(--purple)', teal: 'var(--teal)', amber: 'var(--amber)', coral: 'var(--coral)', blue: 'var(--blue)' }
const COLOR_BG: Record<string, string> = { purple: 'var(--purple-bg)', teal: 'var(--teal-bg)', amber: 'var(--amber-bg)', coral: 'var(--coral-bg)', blue: 'var(--blue-bg)' }
const COLOR_TEXT: Record<string, string> = { purple: 'var(--purple-text)', teal: 'var(--teal-text)', amber: 'var(--amber-text)', coral: 'var(--coral-text)', blue: 'var(--blue-text)' }
const CAT_COLORS: Array<LongGoal['color']> = ['purple', 'teal', 'amber', 'coral', 'blue']
const COLOR_LABELS: Record<string, string> = { purple: '보라', teal: '청록', amber: '호박', coral: '코랄', blue: '파랑' }

interface Props {
  longGoals: LongGoal[]
  shortGoals: ShortGoal[]
  getLongGoalProgress: (id: string) => { done: number; total: number; pct: number }
  selectedGoalId: string | null
  onSelectGoal: (id: string | null) => void
  onAddLongGoal: (g: Omit<LongGoal, 'id'>) => void
  onDeleteLongGoal: (id: string) => void
}

export function GoalHierarchyView({
  longGoals, shortGoals, getLongGoalProgress, selectedGoalId, onSelectGoal,
  onAddLongGoal, onDeleteLongGoal,
}: Props) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', date_from: '', date_to: '', color: 'purple' as LongGoal['color'] })
  const [expandedLong, setExpandedLong] = useState<Set<string>>(new Set(longGoals.map(g => g.id)))

  function handleAdd() {
    if (!form.title.trim() || !form.date_from || !form.date_to) return
    onAddLongGoal({ ...form })
    setForm({ title: '', description: '', date_from: '', date_to: '', color: 'purple' })
    setShowForm(false)
  }

  function toggleExpanded(id: string) {
    setExpandedLong(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const orphanGoals = shortGoals.filter(g => !g.long_goal_id)

  return (
    <div className="bg-white border border-[var(--border)] rounded-[16px] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">목표 현황</h3>
        <button onClick={() => setShowForm(v => !v)} className="w-6 h-6 rounded-[6px] flex items-center justify-center text-[var(--text-3)] hover:bg-[var(--surface-2)]">
          <Plus size={13} />
        </button>
      </div>

      {showForm && (
        <div className="mb-3 flex flex-col gap-2 p-3 rounded-[10px] bg-[var(--surface-2)] border border-[var(--border)]">
          <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="장기 목표 제목" autoFocus
            className="w-full px-2 py-1.5 rounded-[8px] text-sm bg-white border border-[var(--border)] outline-none focus:border-[var(--purple)]" />
          <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="설명 (선택)"
            className="w-full px-2 py-1.5 rounded-[8px] text-sm bg-white border border-[var(--border)] outline-none focus:border-[var(--purple)]" />
          <div className="grid grid-cols-2 gap-1.5">
            <div><label className="text-[11px] text-[var(--text-3)] block mb-0.5">시작</label>
              <input type="date" value={form.date_from} onChange={e => setForm(p => ({ ...p, date_from: e.target.value }))} className="w-full px-2 py-1 rounded-[8px] text-[13px] bg-white border border-[var(--border)] outline-none" /></div>
            <div><label className="text-[11px] text-[var(--text-3)] block mb-0.5">종료</label>
              <input type="date" value={form.date_to} onChange={e => setForm(p => ({ ...p, date_to: e.target.value }))} className="w-full px-2 py-1 rounded-[8px] text-[13px] bg-white border border-[var(--border)] outline-none" /></div>
          </div>
          <div className="flex gap-1 flex-wrap">
            {CAT_COLORS.map(c => (
              <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                className={clsx('px-2 py-0.5 rounded-[6px] text-[11px] font-medium', form.color === c && 'ring-2 ring-offset-1')}
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
        {longGoals.map(lg => {
          const progress = getLongGoalProgress(lg.id)
          const linked = shortGoals.filter(g => g.long_goal_id === lg.id)
          const isExpanded = expandedLong.has(lg.id)
          return (
            <div key={lg.id}>
              <div className="flex items-center gap-2 group p-2 rounded-[10px] hover:bg-[var(--surface-2)] transition-colors">
                <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: COLOR_DOT[lg.color] }} />
                <button onClick={() => toggleExpanded(lg.id)} className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-[var(--text-3)]">
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold truncate" style={{ color: COLOR_TEXT[lg.color] }}>{lg.title}</p>
                    {progress.total > 0 && (
                      <span className="text-[11px] text-[var(--text-3)] flex-shrink-0 tabular-nums">{progress.pct}%</span>
                    )}
                  </div>
                  {progress.total > 0 && (
                    <div className="h-1 rounded-full bg-[var(--border)] mt-1">
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress.pct}%`, background: COLOR_DOT[lg.color] }} />
                    </div>
                  )}
                </div>
                <button onClick={() => onDeleteLongGoal(lg.id)} className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-[var(--text-3)] hover:text-[var(--coral)] transition-all flex-shrink-0">
                  <Trash2 size={11} />
                </button>
              </div>

              {isExpanded && linked.length > 0 && (
                <div className="pl-6 mt-0.5 mb-1">
                  {linked.map(sg => {
                    const sgProgress = tasksProgress(sg.tasks)
                    const sgTotal = sgProgress.total
                    const sgDone = sgProgress.done
                    const isActive = selectedGoalId === sg.id
                    return (
                      <button key={sg.id}
                        onClick={() => onSelectGoal(isActive ? null : sg.id)}
                        className={clsx('w-full text-left p-2 rounded-[8px] transition-all mb-0.5',
                          isActive ? 'bg-[var(--teal-bg)] ring-1 ring-[var(--teal)]' : 'hover:bg-[var(--surface-2)]')}>
                        <div className="flex items-center gap-2">
                          <span className={clsx('text-[12px] font-medium truncate flex-1',
                            isActive ? 'text-[var(--teal-text)]' : 'text-[var(--text-2)]')}>
                            {sg.title}
                          </span>
                          <div className="flex gap-0.5 flex-shrink-0">
                            {sg.tasks.map(t => (
                              <span key={t.id} className={clsx('w-1.5 h-1.5 rounded-full', t.done ? 'bg-[var(--teal)]' : 'bg-[var(--border)]')} />
                            ))}
                          </div>
                          {sgTotal > 0 && (
                            <span className="text-[10px] text-[var(--text-3)] flex-shrink-0 tabular-nums">{sgDone}/{sgTotal}</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {orphanGoals.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-[var(--text-3)] uppercase font-semibold tracking-wider">연결 없는 단기 목표들</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>
            {orphanGoals.map(sg => {
              const sgTotal = sg.tasks.length
              const sgDone = sg.tasks.filter(t => t.done).length
              const isActive = selectedGoalId === sg.id
              return (
                <button key={sg.id}
                  onClick={() => onSelectGoal(isActive ? null : sg.id)}
                  className={clsx('w-full text-left p-2 rounded-[8px] transition-all mb-0.5',
                    isActive ? 'bg-[var(--teal-bg)] ring-1 ring-[var(--teal)]' : 'hover:bg-[var(--surface-2)]')}>
                  <div className="flex items-center gap-2">
                    <span className={clsx('text-[12px] font-medium truncate flex-1',
                      isActive ? 'text-[var(--teal-text)]' : 'text-[var(--text-2)]')}>
                      {sg.title}
                    </span>
                    {sgTotal > 0 && (
                      <span className="text-[10px] text-[var(--text-3)] flex-shrink-0 tabular-nums">{sgDone}/{sgTotal}</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {longGoals.length === 0 && orphanGoals.length === 0 && !showForm && (
          <p className="text-xs text-[var(--text-3)]">목표를 추가해보세요.</p>
        )}
      </div>
    </div>
  )
}
