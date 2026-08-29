'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, CirclePlus, Compass, Dumbbell, FlaskConical, Heart, Plus, Sparkles, Target, Trash2 } from 'lucide-react'
import type { BadgeColor, LongGoal, Routine, RoutineConfig, RoutineLog, RoutinePeriod } from '@/types'
import { formatDate, getWeekDays } from '@/lib/dates'
import { isRoutineScheduledOn, routineConfig } from '@/lib/routineSchedule'

const IDENTITY_SYNC_KEY = '__identity_profiles__'
const GOAL_NARRATIVE_SYNC_KEY = '__goal_narratives__'

interface IdentityProfile {
  name: string
  statement: string
  meaning: string
  color: BadgeColor
}

interface GoalNarrative {
  why: string
  futureSelf: string
  failureCost: string
  doneDefinition: string
  nextAction: string
}

interface Props {
  routines: Routine[]
  logs: RoutineLog[]
  longGoals: LongGoal[]
  getLongGoalProgress: (id: string) => { done: number; total: number; pct: number }
  getWeeklyReview: (key: string) => string
  onUpdateWeeklyReview: (key: string, content: string) => void
  onAddRoutine: (name: string, time?: string, period?: RoutinePeriod, config?: RoutineConfig) => void
  onAddLongGoal: (goal: Omit<LongGoal, 'id'>) => void
  onUpdateLongGoal: (id: string, patch: Partial<LongGoal>) => void
  onDeleteLongGoal: (id: string) => void
}

const COLORS: BadgeColor[] = ['purple', 'teal', 'amber', 'coral', 'blue']
const COLOR_DOT: Record<BadgeColor, string> = {
  purple: 'var(--purple)', teal: 'var(--teal)', amber: 'var(--amber)', coral: 'var(--coral)',
  blue: 'var(--blue)', gray: 'var(--text-3)', red: 'var(--red)',
}
const COLOR_BG: Record<BadgeColor, string> = {
  purple: 'var(--purple-bg)', teal: 'var(--teal-bg)', amber: 'var(--amber-bg)', coral: 'var(--coral-bg)',
  blue: 'var(--blue-bg)', gray: 'var(--surface-2)', red: 'var(--red-bg)',
}
const COLOR_TEXT: Record<BadgeColor, string> = {
  purple: 'var(--purple-text)', teal: 'var(--teal-text)', amber: 'var(--amber-text)', coral: 'var(--coral-text)',
  blue: 'var(--blue-text)', gray: 'var(--text-2)', red: 'var(--red-text)',
}

const EMPTY_NARRATIVE: GoalNarrative = { why: '', futureSelf: '', failureCost: '', doneDefinition: '', nextAction: '' }

function parseJson<T>(raw: string, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

function bundleName(routine: Routine) {
  return routineConfig(routine).bundle?.trim() || '기타 루틴'
}

function defaultIdentityIcon(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes('연구') || lower.includes('공부') || lower.includes('학습')) return FlaskConical
  if (lower.includes('운동') || lower.includes('강') || lower.includes('건강')) return Dumbbell
  if (lower.includes('마음') || lower.includes('관계') || lower.includes('사람')) return Heart
  return Sparkles
}

export function DirectionDashboard({
  routines,
  logs,
  longGoals,
  getLongGoalProgress,
  getWeeklyReview,
  onUpdateWeeklyReview,
  onAddRoutine,
  onAddLongGoal,
  onUpdateLongGoal,
  onDeleteLongGoal,
}: Props) {
  const [expandedIdentity, setExpandedIdentity] = useState<string | null>(null)
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null)
  const [showIdentityForm, setShowIdentityForm] = useState(false)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [identityForm, setIdentityForm] = useState<IdentityProfile>({ name: '', statement: '', meaning: '', color: 'purple' })
  const [routineDrafts, setRoutineDrafts] = useState<Record<string, { name: string; time: string }>>({})
  const [goalForm, setGoalForm] = useState({ title: '', description: '', date_from: '', date_to: '', color: 'purple' })

  const profiles = parseJson<IdentityProfile[]>(getWeeklyReview(IDENTITY_SYNC_KEY), [])
  const narratives = parseJson<Record<string, GoalNarrative>>(getWeeklyReview(GOAL_NARRATIVE_SYNC_KEY), {})

  const identities = useMemo(() => {
    const profileMap = new Map(profiles.map(profile => [profile.name, profile]))
    const names: string[] = [...profiles.map(profile => profile.name)]
    for (const routine of routines.filter(item => item.status !== 'archived')) {
      const name = bundleName(routine)
      if (!names.includes(name)) names.push(name)
    }
    return names.map(name => {
      const linkedRoutines = routines.filter(routine => routine.status !== 'archived' && bundleName(routine) === name)
      const firstColor = linkedRoutines[0] ? routineConfig(linkedRoutines[0]).category_color : 'purple'
      const profile = profileMap.get(name) ?? { name, statement: '', meaning: '', color: firstColor }
      return { ...profile, routines: linkedRoutines }
    })
  }, [profiles, routines])

  const weekDays = useMemo(() => getWeekDays(new Date()), [])
  const today = formatDate(new Date())

  function saveProfiles(next: IdentityProfile[]) {
    onUpdateWeeklyReview(IDENTITY_SYNC_KEY, JSON.stringify(next))
  }

  function upsertProfile(profile: IdentityProfile) {
    const next = profiles.some(item => item.name === profile.name)
      ? profiles.map(item => item.name === profile.name ? profile : item)
      : [...profiles, profile]
    saveProfiles(next)
  }

  function addIdentity() {
    const name = identityForm.name.trim()
    if (!name) return
    upsertProfile({ ...identityForm, name })
    setIdentityForm({ name: '', statement: '', meaning: '', color: 'purple' })
    setShowIdentityForm(false)
    setExpandedIdentity(name)
  }

  function identityStats(identityName: string, linkedRoutines: Routine[]) {
    const occurrences = weekDays.flatMap(day => {
      const date = formatDate(day)
      return linkedRoutines.filter(routine => isRoutineScheduledOn(routine, date)).map(routine => ({ routine, date }))
    })
    const done = occurrences.filter(({ routine, date }) => logs.some(log => log.routine_id === routine.id && log.date === date && log.done)).length
    const todayRoutines = linkedRoutines.filter(routine => isRoutineScheduledOn(routine, today))
    const todayDone = todayRoutines.filter(routine => logs.some(log => log.routine_id === routine.id && log.date === today && log.done)).length
    return {
      done,
      total: occurrences.length,
      pct: occurrences.length ? Math.round(done / occurrences.length * 100) : 0,
      todayDone,
      todayTotal: todayRoutines.length,
    }
  }

  function addRoutineToIdentity(identity: IdentityProfile) {
    const draft = routineDrafts[identity.name] ?? { name: '', time: '' }
    const name = draft.name.trim()
    if (!name) return
    onAddRoutine(name, draft.time || undefined, undefined, {
      bundle: identity.name,
      category_color: identity.color,
      kind: 'timed',
      duration_min: 20,
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      stage: 'maintenance',
    })
    setRoutineDrafts(prev => ({ ...prev, [identity.name]: { name: '', time: '' } }))
  }

  function updateNarrative(goalId: string, patch: Partial<GoalNarrative>) {
    const current = narratives[goalId] ?? EMPTY_NARRATIVE
    onUpdateWeeklyReview(GOAL_NARRATIVE_SYNC_KEY, JSON.stringify({ ...narratives, [goalId]: { ...current, ...patch } }))
  }

  function addGoal() {
    if (!goalForm.title.trim() || !goalForm.date_from || !goalForm.date_to) return
    onAddLongGoal({ ...goalForm, title: goalForm.title.trim() })
    setGoalForm({ title: '', description: '', date_from: '', date_to: '', color: 'purple' })
    setShowGoalForm(false)
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="overflow-hidden rounded-[22px] border border-[var(--border)] bg-white">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-[var(--purple)]">
              <Compass size={18} />
              <p className="text-xs font-black tracking-[0.14em]">MY DIRECTION</p>
            </div>
            <h2 className="mt-2 text-xl font-black tracking-tight">정체성은 반복해서 증명하고, 목표는 크게 잡습니다.</h2>
            <p className="mt-1 text-sm text-[var(--text-3)]">루틴은 '어떤 사람이 될 것인가'에 연결하고, 목표는 별도의 큰 미션으로 관리합니다.</p>
          </div>
        </div>

        <div className="p-6">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h3 className="text-base font-black">정체성 & 루틴</h3>
              <p className="mt-0.5 text-xs text-[var(--text-3)]">루틴 카테고리 하나를 하나의 정체성으로 봅니다.</p>
            </div>
            <button type="button" onClick={() => setShowIdentityForm(value => !value)} className="inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-2)] hover:border-[var(--purple)] hover:text-[var(--purple)]">
              <Plus size={13} /> 정체성 추가
            </button>
          </div>

          {showIdentityForm && (
            <div className="mb-4 grid gap-2 rounded-[16px] border border-[var(--purple)]/20 bg-[var(--purple-bg)]/30 p-4 md:grid-cols-2">
              <input value={identityForm.name} onChange={event => setIdentityForm(prev => ({ ...prev, name: event.target.value }))} placeholder="정체성 이름 · 예: 연구자" className="rounded-[9px] border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--purple)]" />
              <input value={identityForm.statement} onChange={event => setIdentityForm(prev => ({ ...prev, statement: event.target.value }))} placeholder="나는 이런 사람이다" className="rounded-[9px] border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--purple)]" />
              <textarea value={identityForm.meaning} onChange={event => setIdentityForm(prev => ({ ...prev, meaning: event.target.value }))} placeholder="이 정체성이 내게 중요한 이유" rows={2} className="rounded-[9px] border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--purple)] md:col-span-2" />
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map(color => <button key={color} type="button" onClick={() => setIdentityForm(prev => ({ ...prev, color }))} className="h-7 rounded-full px-3 text-[10px] font-bold" style={{ background: COLOR_BG[color], color: COLOR_TEXT[color], outline: identityForm.color === color ? `2px solid ${COLOR_DOT[color]}` : 'none' }}>{color}</button>)}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowIdentityForm(false)} className="rounded-[8px] px-3 py-2 text-xs font-semibold text-[var(--text-3)]">취소</button>
                <button type="button" onClick={addIdentity} className="rounded-[8px] bg-[var(--purple)] px-4 py-2 text-xs font-bold text-white">추가</button>
              </div>
            </div>
          )}

          <div className="grid gap-3 xl:grid-cols-3">
            {identities.map(identity => {
              const Icon = defaultIdentityIcon(identity.name)
              const stats = identityStats(identity.name, identity.routines)
              const expanded = expandedIdentity === identity.name
              const draft = routineDrafts[identity.name] ?? { name: '', time: '' }
              return (
                <article key={identity.name} className="overflow-hidden rounded-[17px] border border-[var(--border)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <button type="button" onClick={() => setExpandedIdentity(expanded ? null : identity.name)} className="w-full p-4 text-left">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]" style={{ background: COLOR_BG[identity.color], color: COLOR_TEXT[identity.color] }}><Icon size={19} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="truncate text-sm font-black">{identity.name}</h4>
                          <span className="text-lg font-black tabular-nums" style={{ color: COLOR_TEXT[identity.color] }}>{stats.pct}%</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-3)]">{identity.statement || `${identity.name}라는 정체성을 루틴으로 증명합니다.`}</p>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full" style={{ width: `${stats.pct}%`, background: COLOR_DOT[identity.color] }} /></div>
                        <div className="mt-2 flex items-center justify-between text-[10px] font-semibold text-[var(--text-3)]"><span>이번 주 {stats.done}/{stats.total} votes</span><span>오늘 {stats.todayDone}/{stats.todayTotal}</span></div>
                      </div>
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-[var(--border)] bg-[var(--surface-2)]/25 p-4">
                      <label className="text-[10px] font-bold text-[var(--text-3)]">나는 이런 사람이다</label>
                      <textarea defaultValue={identity.statement} onBlur={event => upsertProfile({ ...identity, statement: event.target.value, routines: undefined } as IdentityProfile)} rows={2} className="mt-1 w-full rounded-[9px] border border-[var(--border)] bg-white px-3 py-2 text-xs outline-none focus:border-[var(--purple)]" />
                      <label className="mt-3 block text-[10px] font-bold text-[var(--text-3)]">이 정체성이 중요한 이유</label>
                      <textarea defaultValue={identity.meaning} onBlur={event => upsertProfile({ ...identity, meaning: event.target.value, routines: undefined } as IdentityProfile)} rows={2} className="mt-1 w-full rounded-[9px] border border-[var(--border)] bg-white px-3 py-2 text-xs outline-none focus:border-[var(--purple)]" />

                      <div className="mt-4 space-y-1.5">
                        {identity.routines.map(routine => {
                          const done = logs.some(log => log.routine_id === routine.id && log.date === today && log.done)
                          return <div key={routine.id} className="flex items-center gap-2 rounded-[9px] bg-white px-3 py-2 text-xs"><span className="h-2 w-2 rounded-full" style={{ background: done ? COLOR_DOT[identity.color] : 'var(--border-strong)' }} /><span className="flex-1 font-semibold">{routine.name}</span><span className="text-[10px] text-[var(--text-3)]">{routine.time || '언제든'}</span></div>
                        })}
                        {identity.routines.length === 0 && <p className="rounded-[9px] border border-dashed border-[var(--border)] bg-white px-3 py-4 text-center text-[11px] text-[var(--text-3)]">아직 연결된 루틴이 없습니다.</p>}
                      </div>

                      <div className="mt-3 flex gap-2">
                        <input value={draft.name} onChange={event => setRoutineDrafts(prev => ({ ...prev, [identity.name]: { ...draft, name: event.target.value } }))} placeholder="이 정체성을 증명할 루틴" className="min-w-0 flex-1 rounded-[8px] border border-[var(--border)] bg-white px-2.5 py-2 text-xs outline-none" />
                        <input type="time" value={draft.time} onChange={event => setRoutineDrafts(prev => ({ ...prev, [identity.name]: { ...draft, time: event.target.value } }))} className="w-[104px] rounded-[8px] border border-[var(--border)] bg-white px-2 py-2 text-xs outline-none" />
                        <button type="button" onClick={() => addRoutineToIdentity(identity)} className="flex h-8 w-8 items-center justify-center rounded-[8px] text-white" style={{ background: COLOR_DOT[identity.color] }}><CirclePlus size={15} /></button>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>

          {identities.length === 0 && <div className="rounded-[16px] border border-dashed border-[var(--border-strong)] px-5 py-9 text-center"><p className="text-sm font-bold">먼저 내가 되고 싶은 사람을 하나 만들어보세요.</p><p className="mt-1 text-xs text-[var(--text-3)]">그 정체성 아래에 반복 행동을 추가하면 루틴으로 연결됩니다.</p></div>}
        </div>
      </section>

      <section className="rounded-[22px] border border-[var(--border)] bg-white p-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Target size={17} className="text-[var(--teal)]" /><h3 className="text-base font-black">큰 목표</h3></div>
            <p className="mt-1 text-xs text-[var(--text-3)]">정체성과 억지로 연결하지 않습니다. 크게 이루고 싶은 미션 자체에 집중합니다.</p>
          </div>
          <button type="button" onClick={() => setShowGoalForm(value => !value)} className="inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-2)] hover:border-[var(--teal)] hover:text-[var(--teal)]"><Plus size={13} /> 큰 목표 추가</button>
        </div>

        {showGoalForm && (
          <div className="mb-4 grid gap-2 rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)]/40 p-4 md:grid-cols-2">
            <input value={goalForm.title} onChange={event => setGoalForm(prev => ({ ...prev, title: event.target.value }))} placeholder="큰 목표 제목" className="rounded-[9px] border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none" />
            <input value={goalForm.description} onChange={event => setGoalForm(prev => ({ ...prev, description: event.target.value }))} placeholder="한 문장 정의" className="rounded-[9px] border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none" />
            <input type="date" value={goalForm.date_from} onChange={event => setGoalForm(prev => ({ ...prev, date_from: event.target.value }))} className="rounded-[9px] border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none" />
            <input type="date" value={goalForm.date_to} onChange={event => setGoalForm(prev => ({ ...prev, date_to: event.target.value }))} className="rounded-[9px] border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none" />
            <div className="flex flex-wrap gap-1.5">{COLORS.map(color => <button key={color} type="button" onClick={() => setGoalForm(prev => ({ ...prev, color }))} className="h-7 rounded-full px-3 text-[10px] font-bold" style={{ background: COLOR_BG[color], color: COLOR_TEXT[color], outline: goalForm.color === color ? `2px solid ${COLOR_DOT[color]}` : 'none' }}>{color}</button>)}</div>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowGoalForm(false)} className="rounded-[8px] px-3 py-2 text-xs font-semibold text-[var(--text-3)]">취소</button><button type="button" onClick={addGoal} className="rounded-[8px] bg-[var(--teal)] px-4 py-2 text-xs font-bold text-white">추가</button></div>
          </div>
        )}

        <div className="space-y-3">
          {longGoals.map(goal => {
            const progress = getLongGoalProgress(goal.id)
            const color = (COLORS.includes(goal.color as BadgeColor) ? goal.color : 'purple') as BadgeColor
            const expanded = expandedGoal === goal.id
            const narrative = narratives[goal.id] ?? EMPTY_NARRATIVE
            return (
              <article key={goal.id} className="overflow-hidden rounded-[17px] border border-[var(--border)]">
                <button type="button" onClick={() => setExpandedGoal(expanded ? null : goal.id)} className="w-full px-5 py-4 text-left">
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]" style={{ background: COLOR_BG[color], color: COLOR_TEXT[color] }}><Target size={20} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><h4 className="truncate text-sm font-black">{goal.title}</h4><span className="ml-auto text-lg font-black tabular-nums" style={{ color: COLOR_TEXT[color] }}>{progress.pct}%</span>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</div>
                      <p className="mt-1 truncate text-xs text-[var(--text-3)]">{goal.description || '이 목표가 의미하는 바를 한 문장으로 적어보세요.'}</p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full" style={{ width: `${progress.pct}%`, background: COLOR_DOT[color] }} /></div>
                      <div className="mt-2 flex gap-3 text-[10px] text-[var(--text-3)]"><span>{goal.date_from} → {goal.date_to}</span><span>{progress.done}/{progress.total} 완료</span></div>
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-[var(--border)] bg-[var(--surface-2)]/20 p-5">
                    <div className="grid gap-3 md:grid-cols-2">
                      {[
                        ['왜 이 목표를 이루고 싶은가?', 'why', narrative.why, '내가 이 목표에 시간을 쓰는 진짜 이유'],
                        ['이 목표를 달성하면?', 'futureSelf', narrative.futureSelf, '달성한 뒤 달라진 나와 환경'],
                        ['이 목표를 이루지 못하면?', 'failureCost', narrative.failureCost, '계속 미뤘을 때 잃게 되는 것'],
                        ['Definition of Done', 'doneDefinition', narrative.doneDefinition, '어느 상태가 되면 완료라고 할 것인가'],
                      ].map(([label, key, value, placeholder]) => (
                        <label key={key} className="rounded-[13px] border border-[var(--border)] bg-white p-3">
                          <span className="text-[11px] font-black" style={{ color: COLOR_TEXT[color] }}>{label}</span>
                          <textarea defaultValue={value} onBlur={event => updateNarrative(goal.id, { [key]: event.target.value } as Partial<GoalNarrative>)} rows={3} placeholder={placeholder} className="mt-2 w-full resize-none bg-transparent text-xs leading-relaxed outline-none placeholder:text-[var(--text-3)]" />
                        </label>
                      ))}
                    </div>

                    <label className="mt-3 block rounded-[13px] border border-[var(--purple)]/20 bg-[var(--purple-bg)]/45 p-3">
                      <span className="text-[11px] font-black text-[var(--purple-text)]">지금 바로 할 수 있는 첫 행동</span>
                      <input defaultValue={narrative.nextAction} onBlur={event => updateNarrative(goal.id, { nextAction: event.target.value })} placeholder="딴짓하고 싶을 때 다시 시작할 수 있을 만큼 작게" className="mt-2 w-full bg-transparent text-sm font-semibold outline-none placeholder:font-normal placeholder:text-[var(--text-3)]" />
                    </label>

                    <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                      <input defaultValue={goal.title} onBlur={event => event.target.value.trim() && onUpdateLongGoal(goal.id, { title: event.target.value.trim() })} className="rounded-[9px] border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold outline-none" />
                      <input defaultValue={goal.description} onBlur={event => onUpdateLongGoal(goal.id, { description: event.target.value })} placeholder="한 문장 정의" className="rounded-[9px] border border-[var(--border)] bg-white px-3 py-2 text-xs outline-none" />
                      <button type="button" onClick={() => onDeleteLongGoal(goal.id)} className="flex items-center justify-center gap-1 rounded-[9px] bg-[var(--red-bg)] px-3 py-2 text-xs font-bold text-[var(--red)]"><Trash2 size={13} /> 삭제</button>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
          {longGoals.length === 0 && <div className="rounded-[16px] border border-dashed border-[var(--border-strong)] px-5 py-9 text-center"><p className="text-sm font-bold">아직 큰 목표가 없습니다.</p><p className="mt-1 text-xs text-[var(--text-3)]">작은 할 일보다 먼저, 몇 달 동안 이루고 싶은 미션을 적어보세요.</p></div>}
        </div>
      </section>
    </div>
  )
}
