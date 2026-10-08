'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { DayEntry, ScheduleDetails, ShortGoal, Task, TaskScheduleInput } from '@/types'
import { DEADLINE_CAT_ID, SCHEDULE_CAT_ID } from '@/types'
import { validateScheduleDetails } from '@/lib/scheduleDetails'
import { koreaToday, shiftDate } from '@/lib/scheduleConflicts'
import { withShortGoalCategory } from '@/lib/planCategory'
import { dependencyState, DETAILS_MARKER, fourWeekCards, scheduleCards, type ScheduleCard } from '@/lib/scheduleCards'

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
const publicStyle = 'border-pink-300 bg-gradient-to-br from-pink-50 to-pink-100 text-pink-900'
const deadlineStyle = 'border-red-400 bg-gradient-to-br from-red-100 to-red-200 text-red-950'
const privateStyle = 'border-sky-300 bg-gradient-to-br from-sky-50 to-blue-100 text-blue-900'
const inputStyle = 'mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm'
const dateLabel = (value: string) => format(parseISO(value), 'M월 d일 (EEE)', { locale: ko })

export function FourWeekScheduleCards({ days, goals, onUpdateTask, onUpdateGoal, onAddGoal, onAddTask, onSelectDate, onEditGoal }: Props) {
  const [today, setToday] = useState(koreaToday)
  useEffect(() => { const timer = setInterval(() => setToday(koreaToday()), 60000); return () => clearInterval(timer) }, [])
  const cards = useMemo(() => scheduleCards(days, goals), [days, goals])
  const visible = fourWeekCards(cards, today)
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
      <div><h2 className="text-lg font-bold">앞으로 4주 일정</h2><p className="mt-1 text-sm text-[var(--text-3)]">{dateLabel(today)} ~ {dateLabel(shiftDate(today, 27))}</p></div>
      <div className="flex flex-wrap items-center gap-3 text-sm"><span className="rounded-lg border border-red-400 bg-red-100 px-3 py-1 text-red-900">데드라인</span><span className="rounded-lg border border-pink-300 bg-pink-50 px-3 py-1 text-pink-900">공식 일정</span><span className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1 text-blue-800">개인 일정</span><button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1 rounded-lg bg-[var(--purple)] px-3 py-2 text-white"><Plus size={16} />일정 추가</button></div>
    </div>
    <div className="space-y-6">{Array.from({ length: 4 }, (_, i) => {
      const from = shiftDate(today, i * 7), to = shiftDate(from, 6)
      // Ongoing multi-day plans appear once, in the first intersecting week.
      const week = visible.filter(c => (c.from < today ? today : c.from) >= from && (c.from < today ? today : c.from) <= to)
      return <div key={from}><div className="mb-2 flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{i + 1}주차</h3><span className="text-sm text-[var(--text-3)]">{dateLabel(from)} ~ {dateLabel(to)}</span></div>
        {week.length ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{week.map(card => <button key={card.id} aria-label={`${card.title} · ${card.kind === 'deadline' ? '데드라인' : card.visibility === 'public' ? '공식 일정' : '개인 일정'} · ${card.from}`} type="button" onClick={() => setSelectedId(card.id)} className={`min-h-28 rounded-xl border p-4 text-left transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${card.kind === 'deadline' ? deadlineStyle : card.visibility === 'public' ? publicStyle : privateStyle}`}>
          <span className="block break-words text-base font-bold">{card.title}</span><span className="mt-2 block text-sm">{dateLabel(card.from)}{card.to !== card.from && ` ~ ${dateLabel(card.to)}`}{card.kind === 'deadline' && ` ${card.details.due_time || ''}까지`}</span>
        </button>)}</div> : <p className="rounded-xl bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-3)]">등록된 일정이 없습니다.</p>}
      </div>
    })}</div>
    {selected && <ScheduleDetail key={selected.id} card={selected} cards={cards} onSave={details => save(selected, details)} onClose={() => setSelectedId(null)} onSelectDate={() => { onSelectDate(selected.from); setSelectedId(null) }} onEditGoal={selected.goal && onEditGoal ? () => { onEditGoal(selected.id); setSelectedId(null) } : undefined} />}
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
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4" onClick={onClose}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()} onKeyDown={e => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Tab') {
      const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href]') ?? []).filter(n => !n.hasAttribute('disabled'))
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last?.focus() }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
  }} className="max-h-[90svh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl outline-none"><div className="mb-4 flex items-start justify-between gap-3"><h2 className="text-lg font-bold break-words">{title}</h2><button type="button" aria-label="상세 닫기" onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100"><X size={20} /></button></div>{children}</div></div>
}
function ScheduleDetail({ card, cards, onSave, onClose, onSelectDate, onEditGoal }: { card: ScheduleCard; cards: ScheduleCard[]; onSave: (details: ScheduleDetails) => void; onClose: () => void; onSelectDate: () => void; onEditGoal?: () => void }) {
  const [details, setDetails] = useState<ScheduleDetails>({ ...card.details, visibility: card.visibility, kind: card.kind, ...(card.kind === 'deadline' && !card.details.due_time && (card.task?.start_time || card.task?.time) ? { due_time: card.task.start_time || card.task.time } : {}) })
  const dependencies = dependencyState({ ...card, details }, cards)
  const [error, setError] = useState('')
  const [dependencyId, setDependencyId] = useState('')
  const [requirement, setRequirement] = useState<'passed' | 'completed'>('passed')
  const [nextTitle, setNextTitle] = useState('')
  const [condition, setCondition] = useState('합격 확인 후')
  const time = card.task?.start_time ?? card.task?.time
  return <Dialog title={card.title} onClose={onClose}><div className="space-y-4 text-sm">
    <p className="text-base">{details.kind === 'deadline' ? `${dateLabel(card.goal?.date_to ?? card.to)} ${details.due_time || ''}까지 완료` : <>{dateLabel(card.from)}{card.to !== card.from && ` ~ ${dateLabel(card.to)}`} · {time ? `${time}${card.task?.end_time ? `–${card.task.end_time}` : ' (종료 미정)'}` : '시간 미정'}</>}</p>
    <label className="block">일정 유형<select className={inputStyle} value={details.kind === 'deadline' ? 'deadline' : details.visibility} onChange={e => setDetails({ ...details, kind: e.target.value === 'deadline' ? 'deadline' : 'event', ...(e.target.value === 'deadline' ? {} : { visibility: e.target.value as 'public' | 'private' }) })}><option value="deadline">데드라인 · 기한까지 완료</option><option value="public">Public · 공식 일정</option><option value="private">Private · 개인 일정</option></select></label>
    {details.kind === 'deadline' && <label className="block">마감 시각 (선택)<input type="time" className={inputStyle} value={details.due_time ?? ''} onChange={e => setDetails({ ...details, due_time: e.target.value })} /></label>}
    <label className="block">상세 내용<textarea rows={4} className={inputStyle} value={details.description ?? card.goal?.note ?? ''} onChange={e => setDetails({ ...details, description: e.target.value })} /></label>
    <label className="block">준비·제출 절차 (한 줄에 하나)<textarea rows={3} className={inputStyle} value={(details.preparation ?? []).join('\n')} onChange={e => setDetails({ ...details, preparation: e.target.value.split('\n') })} /></label>
    {!!card.task?.subtasks?.length && <ul className="space-y-1">{card.task.subtasks.filter(t => !t.discarded).map(t => <li key={t.id}>{t.done ? '완료' : '할 일'} · {t.text}</li>)}</ul>}
    <label className="block">원문·안내 링크<input type="url" className={inputStyle} value={details.source_url ?? ''} onChange={e => setDetails({ ...details, source_url: e.target.value })} /></label>
    {/^https?:\/\//.test(details.source_url ?? '') && <a href={details.source_url} target="_blank" rel="noopener noreferrer" className="inline-block text-blue-700 underline">안내 원문 열기</a>}
    <label className="block">전형 결과<select className={inputStyle} value={details.result ?? 'unknown'} onChange={e => setDetails({ ...details, result: e.target.value as ScheduleDetails['result'] })}><option value="unknown">결과 미확인</option><option value="passed">합격 확인</option><option value="failed">불합격 확인</option></select></label>
    <div><h3 className="font-semibold">먼저 충족해야 할 일정</h3><ul className="mt-2 space-y-2">{dependencies.map(dep => <li key={dep.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 p-2"><span>{dep.title} · {dep.requirement === 'passed' ? '합격 필요' : '완료 필요'} · {dep.satisfied ? '충족' : dep.failed ? '진행 불가' : '확인 대기'}</span><button type="button" aria-label={`${dep.title} 연결 해제`} onClick={() => setDetails({ ...details, dependencies: details.dependencies?.filter(d => d.id !== dep.id) })}>해제</button></li>)}</ul>
      {!dependencies.length && <p className="mt-1 text-gray-500">연결된 선행 일정이 없습니다.</p>}
      <div className="mt-2 flex flex-wrap gap-2"><select aria-label="선행 일정 선택" className={`${inputStyle} flex-1 min-w-40`} value={dependencyId} onChange={e => setDependencyId(e.target.value)}><option value="">선행 일정 선택</option>{cards.filter(c => c.id !== card.id && !details.dependencies?.some(d => d.id === c.id)).map(c => <option key={c.id} value={c.id}>{c.title} · {c.from}</option>)}</select><select aria-label="선행 조건" className={`${inputStyle} !w-auto`} value={requirement} onChange={e => setRequirement(e.target.value as 'passed' | 'completed')}><option value="passed">합격</option><option value="completed">완료</option></select><button type="button" disabled={!dependencyId} onClick={() => { setDetails({ ...details, dependencies: [...(details.dependencies ?? []), { id: dependencyId, requirement }] }); setDependencyId('') }} className="px-3 disabled:opacity-40">연결</button></div>
    </div>
    <div><h3 className="font-semibold">다음 단계</h3><ul className="mt-2 space-y-2">{(details.next_steps ?? []).map((step, i) => <li key={i} className="flex justify-between gap-2 rounded-lg bg-gray-50 p-2"><span>{step.title} · {step.condition} · {step.date ?? '일정 미정'}{details.result === 'failed' ? ' · 진행 불가' : details.result === 'passed' ? ' · 다음 안내 확인 필요' : ' · 조건 확인 대기'}</span><button type="button" aria-label={`${step.title} 다음 단계 삭제`} onClick={() => setDetails({ ...details, next_steps: details.next_steps?.filter((_, index) => index !== i) })}>삭제</button></li>)}</ul>
      <div className="mt-2 grid gap-2 sm:grid-cols-2"><input aria-label="다음 단계 이름" placeholder="예: 1차 면접" className={inputStyle} value={nextTitle} onChange={e => setNextTitle(e.target.value)} /><input aria-label="다음 단계 진행 조건" className={inputStyle} value={condition} onChange={e => setCondition(e.target.value)} /></div><button type="button" disabled={!nextTitle.trim() || !condition.trim()} className="mt-2 disabled:opacity-40" onClick={() => { setDetails({ ...details, next_steps: [...(details.next_steps ?? []), { title: nextTitle.trim(), condition: condition.trim() }] }); setNextTitle('') }}>다음 단계 추가</button>
    </div>
    <p className="text-gray-500">마지막 확인: {details.checked_at ? new Date(details.checked_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '미확인'}</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2">{onEditGoal && <button type="button" onClick={onEditGoal} className="rounded-lg border px-3 py-2">이름·기간 수정</button>}<button type="button" onClick={onSelectDate} className="rounded-lg border px-3 py-2">날짜 선택</button><button type="button" onClick={() => { try { onSave(validateScheduleDetails(details)) } catch (err) { setError(err instanceof Error ? err.message : '상세 내용을 확인하세요.') } }} className="rounded-lg bg-[var(--purple)] px-4 py-2 text-white">저장</button></div>
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
