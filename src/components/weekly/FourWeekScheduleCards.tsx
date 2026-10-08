'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X, CalendarDays, ListChecks, Link2, ArrowUpRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { DayEntry, ScheduleDetails, ShortGoal, Task, TaskScheduleInput } from '@/types'
import { DEADLINE_CAT_ID, SCHEDULE_CAT_ID } from '@/types'
import { validateScheduleDetails } from '@/lib/scheduleDetails'
import { koreaToday, shiftDate } from '@/lib/scheduleConflicts'
import { withShortGoalCategory } from '@/lib/planCategory'
import { calendarWeekLabel, DETAILS_MARKER, fourWeekCards, scheduleWeekStart, uncertainFourWeekCards, scheduleCards, type ScheduleCard } from '@/lib/scheduleCards'

interface Props {
  days: DayEntry[]
  goals: ShortGoal[]
  onUpdateTask: (date: string, id: string, patch: Partial<Task>) => void
  onUpdateGoal: (id: string, patch: Partial<ShortGoal>) => void
  onAddTask: (date: string, categoryId: string, text: string, schedule?: string | TaskScheduleInput) => void
  onAddGoal: (goal: Omit<ShortGoal, 'id'>) => void
  onSelectDate: (date: string) => void
  onEditGoal?: (id: string) => void
}
const publicStyle = 'border-green-300 bg-gradient-to-br from-green-50 to-lime-100 text-green-900'
const deadlineStyle = 'border-red-400 bg-gradient-to-br from-red-100 to-red-200 text-red-950'
const privateStyle = 'border-sky-300 bg-gradient-to-br from-sky-50 to-blue-100 text-blue-900'
const inputStyle = 'mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100'
const dateLabel = (value: string) => format(parseISO(value), 'M월 d일 (EEE)', { locale: ko })

export function FourWeekScheduleCards({ days, goals, onUpdateTask, onUpdateGoal, onAddGoal, onAddTask, onSelectDate, onEditGoal }: Props) {
  const [today, setToday] = useState(koreaToday)
  useEffect(() => { const timer = setInterval(() => setToday(koreaToday()), 60000); return () => clearInterval(timer) }, [])
  const cards = useMemo(() => scheduleCards(days, goals), [days, goals])
  const visible = fourWeekCards(cards, today)
  const weekStart = scheduleWeekStart(today)
  const undated = uncertainFourWeekCards(cards, today)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const selected = cards.find(card => card.id === selectedId)
  function save(card: ScheduleCard, details: ScheduleDetails) {
    if (card.task) onUpdateTask(card.from, card.id, { schedule_details: details, category_id: details.kind === 'deadline' ? DEADLINE_CAT_ID : SCHEDULE_CAT_ID, category_name: details.kind === 'deadline' ? '데드라인' : '일정', category_color: details.kind === 'deadline' ? 'red' : 'blue', fixed: details.kind !== 'deadline', ...(details.kind === 'deadline' ? { time: undefined, start_time: undefined, end_time: undefined, duration_min: undefined } : {}), schedule_type: details.visibility === 'public' ? 'external' : card.task.schedule_type === 'deep-work' ? 'deep-work' : 'personal' })
    if (card.goal) onUpdateGoal(card.id, { categories: [...withShortGoalCategory(card.goal.categories, details.visibility === 'public' ? 'external' : 'personal').filter(c => c.id !== DETAILS_MARKER), { id: DETAILS_MARKER, details }] })
    setSelectedId(null)
  }
  return <section className="rounded-[18px] border border-[var(--border)] bg-white p-4 md:p-5">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-bold">앞으로 4주 일정</h2><p className="mt-1 text-sm text-[var(--text-3)]">{dateLabel(weekStart)} ~ {dateLabel(shiftDate(weekStart, 27))}</p></div>
      <div className="flex flex-wrap items-center gap-3 text-sm"><span className="rounded-lg border border-red-400 bg-red-100 px-3 py-1 text-red-900">데드라인</span><span className="rounded-lg border border-green-300 bg-gradient-to-br from-green-50 to-lime-100 px-3 py-1 text-green-900">공식 일정</span><span className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1 text-blue-800">개인 일정</span><button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1 rounded-lg bg-[var(--purple)] px-3 py-2 text-white"><Plus size={16} />일정 추가</button></div>
    </div>
    <div className="space-y-6">{Array.from({ length: 4 }, (_, i) => {
      const from = shiftDate(weekStart, i * 7), to = shiftDate(from, 6)
      // Ongoing multi-day plans appear once, in the first intersecting week.
      const week = visible.filter(c => (c.from < weekStart ? weekStart : c.from) >= from && (c.from < weekStart ? weekStart : c.from) <= to)
      return <div key={from}><div className="mb-2 flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{calendarWeekLabel(from)}</h3><span className="text-sm text-[var(--text-3)]">{dateLabel(from)} ~ {dateLabel(to)}</span></div>
        {week.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">{week.map(card => <button key={card.id} aria-label={`${card.title} · ${card.kind === 'deadline' ? '데드라인' : card.visibility === 'public' ? '공식 일정' : '개인 일정'} · ${card.from}`} type="button" onClick={() => setSelectedId(card.id)} className={`min-w-0 min-h-28 rounded-xl border p-4 text-left transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${card.kind === 'deadline' ? deadlineStyle : card.visibility === 'public' ? publicStyle : privateStyle}`}>
          <span className="block break-words text-base font-bold">{card.title}</span><span className="mt-2 block text-sm">{card.details.timing === 'undated' ? '일정 미정' : card.details.timing === 'window' ? (card.details.date_label ?? `${dateLabel(card.from)} ~ ${dateLabel(card.to)}`) + ' · 예정' : card.details.date_label ?? dateLabel(card.from)}{!card.details.timing && card.to !== card.from && ` ~ ${dateLabel(card.to)}`}{card.kind === 'deadline' && ` ${card.details.due_time || ''}까지`}</span>
        </button>)}</div> : <p className="rounded-xl bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-3)]">등록된 일정이 없습니다.</p>}
      </div>
    })}</div>
    <div className="mt-8 border-t border-slate-100 pt-6"><h3 className="mb-2 text-sm font-semibold">일정 미정</h3><div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">{undated.map(card => <button key={card.id} type="button" onClick={() => setSelectedId(card.id)} className={`min-w-0 rounded-xl border p-4 text-left ${card.kind === 'deadline' ? deadlineStyle : card.visibility === 'public' ? publicStyle : privateStyle}`}><span className="block break-words text-base font-bold">{card.title}</span><span className="mt-2 block text-sm">{card.details.date_label ?? `${dateLabel(card.goal?.date_from ?? card.from)} ~ ${dateLabel(card.to)}`} · 예정</span></button>)}</div>{!undated.length && <p className="rounded-xl bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-3)]">4주 범위에 해당하는 미정 일정이 없습니다.</p>}</div>
    {selected && <ScheduleDetail key={selected.id} card={selected} onSave={details => save(selected, details)} onClose={() => setSelectedId(null)} onSelectDate={() => { onSelectDate(selected.from); setSelectedId(null) }} onEditGoal={selected.goal && onEditGoal ? () => { onEditGoal(selected.id); setSelectedId(null) } : undefined} />}
    {creating && <CreateSchedule today={today} onClose={() => setCreating(false)} onAdd={onAddGoal} onAddTask={onAddTask} />}
  </section>
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    return () => previous?.focus()
  }, [])
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={onClose}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()} onKeyDown={e => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Tab') {
      const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href]') ?? []).filter(n => !n.hasAttribute('disabled'))
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last?.focus() }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
  }} className="max-h-[90svh] w-full max-w-xl overflow-y-auto rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl outline-none md:p-8"><div className="mb-6 flex items-start justify-between gap-3"><h2 className="text-xl font-bold tracking-tight break-words">{title}</h2><button type="button" aria-label="상세 닫기" onClick={onClose} className="rounded-full bg-slate-50 p-2 text-slate-500 transition hover:bg-slate-100"><X size={20} /></button></div>{children}</div></div>
}
function ScheduleDetail({ card, onSave, onClose, onSelectDate, onEditGoal }: { card: ScheduleCard; onSave: (details: ScheduleDetails) => void; onClose: () => void; onSelectDate: () => void; onEditGoal?: () => void }) {
  // Hidden assistant metadata stays intact when visible fields are edited.
  const [details, setDetails] = useState<ScheduleDetails>({ ...card.details, visibility: card.visibility, kind: card.kind })
  const [error, setError] = useState('')
  const time = card.task?.start_time ?? card.task?.time
  const uncertain = ['window', 'undated'].includes(card.details.timing ?? '')
  const dateText = card.details.timing === 'undated' ? '일정 미정' : card.details.timing === 'window' ? `${card.details.date_label ?? `${dateLabel(card.goal?.date_from ?? card.from)} ~ ${dateLabel(card.to)}`} · 예정` : card.details.date_label ?? `${dateLabel(card.from)}${card.to !== card.from ? ` ~ ${dateLabel(card.to)}` : ''}`
  const tone = card.kind === 'deadline' ? deadlineStyle : card.visibility === 'public' ? publicStyle : privateStyle
  return <Dialog title={card.title} onClose={onClose}><div className="space-y-6 text-sm text-slate-700">
    <div className={`flex items-start gap-3 rounded-2xl border p-4 ${tone}`}><CalendarDays size={20} className="mt-0.5 shrink-0" /><div><p className="font-semibold leading-relaxed">{dateText}</p>{details.kind === 'deadline' ? <p className="mt-1 text-xs opacity-75">{details.due_time ? `${details.due_time}까지 완료` : '기한까지 완료할 일'}</p> : time && <p className="mt-1 text-xs opacity-75">{time}{card.task?.end_time ? `–${card.task.end_time}` : ''}</p>}</div></div>
    <div className="grid gap-4 sm:grid-cols-2"><label className="block font-medium">일정 유형<select className={inputStyle} value={details.kind === 'deadline' ? 'deadline' : details.visibility} onChange={e => setDetails({ ...details, kind: e.target.value === 'deadline' ? 'deadline' : 'event', ...(e.target.value === 'deadline' ? {} : { visibility: e.target.value as 'public' | 'private' }) })}><option value="deadline">데드라인</option><option value="public">공식 일정</option><option value="private">개인 일정</option></select></label>{details.kind === 'deadline' && <label className="block font-medium">마감 시각<input type="time" className={inputStyle} value={details.due_time ?? ''} onChange={e => setDetails({ ...details, due_time: e.target.value })} /></label>}</div>
    <label className="block font-medium">상세 내용<textarea rows={4} placeholder="이 일정에 필요한 내용을 남겨두세요." className={`${inputStyle} resize-y leading-relaxed font-normal`} value={details.description ?? card.goal?.note ?? ''} onChange={e => setDetails({ ...details, description: e.target.value })} /></label>
    <label className="block font-medium"><span className="flex items-center gap-2"><ListChecks size={17} className="text-slate-400" />준비·제출 절차</span><textarea rows={3} placeholder="한 줄에 하나씩 적어주세요." className={`${inputStyle} resize-y leading-relaxed font-normal`} value={(details.preparation ?? []).join('\n')} onChange={e => setDetails({ ...details, preparation: e.target.value.split('\n') })} /></label>
    {!!card.task?.subtasks?.length && <ul className="space-y-2 rounded-xl bg-slate-50 p-4">{card.task.subtasks.filter(t => !t.discarded).map(t => <li key={t.id}>{t.done ? '완료' : '할 일'} · {t.text}</li>)}</ul>}
    <label className="block font-medium"><span className="flex items-center gap-2"><Link2 size={17} className="text-slate-400" />원문·안내 링크</span><div className="relative"><input type="url" placeholder="https://" className={`${inputStyle} pr-12 font-normal`} value={details.source_url ?? ''} onChange={e => setDetails({ ...details, source_url: e.target.value })} />{/^https?:\/\//.test(details.source_url ?? '') && <a href={details.source_url} target="_blank" rel="noopener noreferrer" aria-label="안내 원문 열기" className="absolute right-3 top-5 rounded-lg p-1 text-violet-600 hover:bg-violet-100"><ArrowUpRight size={18} /></a>}</div></label>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-5">{onEditGoal && <button type="button" onClick={onEditGoal} className="mr-auto rounded-xl px-3 py-2 text-slate-500 hover:bg-slate-50">이름·기간 수정</button>}{!uncertain && <button type="button" onClick={onSelectDate} className="rounded-xl px-3 py-2 text-slate-500 hover:bg-slate-50">날짜 보기</button>}<button type="button" onClick={() => { try { onSave(validateScheduleDetails(details)) } catch (err) { setError(err instanceof Error ? err.message : '상세 내용을 확인하세요.') } }} className="rounded-xl bg-[var(--purple)] px-5 py-2.5 font-semibold text-white shadow-sm transition hover:opacity-90">저장</button></div>
  </div></Dialog>
}
function CreateSchedule({ today, onClose, onAdd, onAddTask }: { today: string; onClose: () => void; onAdd: Props['onAddGoal']; onAddTask: Props['onAddTask'] }) {
  const [title, setTitle] = useState(''), [from, setFrom] = useState(today), [to, setTo] = useState(today)
  const [type, setType] = useState<'deadline' | 'public' | 'private'>('private')
  const [dueTime, setDueTime] = useState('')
  const deadline = type === 'deadline'
  function add() {
    if (deadline) onAddTask(to, DEADLINE_CAT_ID, title.trim(), { fixed: false, schedule_details: { kind: 'deadline', ...(dueTime ? { due_time: dueTime } : {}) } })
    else onAdd({ title: title.trim(), date_from: from, date_to: to, note: '', tasks: [], routines: [], categories: withShortGoalCategory([], type === 'public' ? 'external' : 'personal') })
    onClose()
  }
  return <Dialog title="일정 추가" onClose={onClose}><div className="space-y-3">
    <label className="block text-sm">일정 이름<input className={inputStyle} value={title} onChange={e => setTitle(e.target.value)} /></label>
    <label className="block text-sm">일정 유형<select className={inputStyle} value={type} onChange={e => setType(e.target.value as typeof type)}><option value="deadline">데드라인 · 기한까지 완료</option><option value="public">Public · 공식 일정</option><option value="private">Private · 개인 일정</option></select></label>
    {!deadline && <label className="block text-sm">시작일<input type="date" className={inputStyle} value={from} onChange={e => setFrom(e.target.value)} /></label>}
    <label className="block text-sm">{deadline ? '마감일' : '종료일'}<input type="date" className={inputStyle} value={to} min={deadline ? undefined : from} onChange={e => setTo(e.target.value)} /></label>
    {deadline && <label className="block text-sm">마감 시각 (선택)<input type="time" className={inputStyle} value={dueTime} onChange={e => setDueTime(e.target.value)} /></label>}
    <button type="button" disabled={!title.trim() || !to || (!deadline && (!from || from > to))} onClick={add} className="rounded-lg bg-[var(--purple)] px-4 py-2 text-white disabled:opacity-40">추가</button>
  </div></Dialog>
}
