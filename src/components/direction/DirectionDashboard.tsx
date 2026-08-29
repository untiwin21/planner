'use client'

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { subDays } from 'date-fns'
import {
  Brain,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  Compass,
  Dumbbell,
  FlaskConical,
  Heart,
  PencilLine,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  Zap,
} from 'lucide-react'
import type { BadgeColor, LongGoal, Routine, RoutineConfig, RoutineLog, RoutinePeriod } from '@/types'
import { formatDate, getWeekDays } from '@/lib/dates'
import { isRoutineScheduledOn, routineConfig } from '@/lib/routineSchedule'

const IDENTITY_SYNC_KEY = '__identity_profiles__'
const GOAL_NARRATIVE_SYNC_KEY = '__goal_narratives__'
const BEHAVIOR_SYSTEM_SYNC_KEY = '__behavior_system__'

interface IdentityProfile {
  name: string
  statement: string
  meaning: string
  color: BadgeColor
}

interface GoalNarrative {
  why: string
  futureSelf: string
  obstacle: string
  ifThen: string
  doneDefinition: string
  nextAction: string
  recoveryPlan: string
}

interface BehaviorSystem {
  resetRule: string
  minimumRule: string
  selfTalk: string
}

interface Props {
  routines: Routine[]
  logs: RoutineLog[]
  longGoals: LongGoal[]
  getLongGoalProgress: (id: string) => { done: number; total: number; pct: number }
  getWeeklyReview: (key: string) => string
  onUpdateWeeklyReview: (key: string, content: string) => void
  onAddRoutine: (name: string, time?: string, period?: RoutinePeriod, config?: RoutineConfig) => void
  onUpdateRoutine: (id: string, patch: Partial<Omit<Routine, 'id'>>) => void
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

const EMPTY_NARRATIVE: GoalNarrative = {
  why: '',
  futureSelf: '',
  obstacle: '',
  ifThen: '',
  doneDefinition: '',
  nextAction: '',
  recoveryPlan: '',
}

const DEFAULT_BEHAVIOR_SYSTEM: BehaviorSystem = {
  resetRule: '놓친 날을 실패로 낙인찍지 않고, 다음 예정 시점에 바로 다시 시작한다.',
  minimumRule: '의욕이 없거나 컨디션이 낮은 날에는 최소 버전만 해도 성공으로 인정한다.',
  selfTalk: '한 번의 실패는 데이터다. 내가 통제할 수 있는 다음 행동 하나에 집중한다.',
}

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

function normalizeNarratives(raw: string): Record<string, GoalNarrative> {
  const parsed = parseJson<Record<string, Partial<GoalNarrative> & { failureCost?: string }>>(raw, {})
  return Object.fromEntries(Object.entries(parsed).map(([id, value]) => [id, {
    ...EMPTY_NARRATIVE,
    ...value,
    obstacle: value.obstacle ?? value.failureCost ?? '',
  }]))
}

function scheduledDates(routine: Routine, days: Date[]) {
  return days.map(formatDate).filter(date => isRoutineScheduledOn(routine, date))
}

export function DirectionDashboard({
  routines,
  logs,
  longGoals,
  getLongGoalProgress,
  getWeeklyReview,
  onUpdateWeeklyReview,
  onAddRoutine,
  onUpdateRoutine,
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
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({})
  const [renameError, setRenameError] = useState<Record<string, string>>({})
  const [goalForm, setGoalForm] = useState({ title: '', description: '', date_from: '', date_to: '', color: 'purple' })

  const profiles = parseJson<IdentityProfile[]>(getWeeklyReview(IDENTITY_SYNC_KEY), [])
  const narratives = normalizeNarratives(getWeeklyReview(GOAL_NARRATIVE_SYNC_KEY))
  const behaviorSystem = {
    ...DEFAULT_BEHAVIOR_SYSTEM,
    ...parseJson<Partial<BehaviorSystem>>(getWeeklyReview(BEHAVIOR_SYSTEM_SYNC_KEY), {}),
  }

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
  const last14Days = useMemo(() => Array.from({ length: 14 }, (_, index) => subDays(new Date(), 13 - index)), [])
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

  function renameIdentity(identity: IdentityProfile & { routines: Routine[] }) {
    const oldName = identity.name
    const nextName = (renameDrafts[oldName] ?? oldName).trim()
    if (!nextName || nextName === oldName) return
    if (identities.some(item => item.name === nextName && item.name !== oldName)) {
      setRenameError(prev => ({ ...prev, [oldName]: '이미 같은 이름의 정체성이 있습니다.' }))
      return
    }

    const existingProfile = profiles.find(item => item.name === oldName)
    const nextProfile: IdentityProfile = { ...(existingProfile ?? identity), name: nextName }
    const nextProfiles = profiles.some(item => item.name === oldName)
      ? profiles.map(item => item.name === oldName ? nextProfile : item)
      : [...profiles, nextProfile]
    saveProfiles(nextProfiles)

    for (const routine of identity.routines) {
      onUpdateRoutine(routine.id, {
        config: { ...(routine.config ?? {}), bundle: nextName },
      })
    }

    setRoutineDrafts(prev => {
      const next = { ...prev }
      if (next[oldName]) {
        next[nextName] = next[oldName]
        delete next[oldName]
      }
      return next
    })
    setRenameDrafts(prev => {
      const next = { ...prev }
      delete next[oldName]
      return next
    })
    setRenameError(prev => {
      const next = { ...prev }
      delete next[oldName]
      return next
    })
    setExpandedIdentity(nextName)
  }

  function identityStats(linkedRoutines: Routine[]) {
    const occurrences = weekDays.flatMap(day => {
      const date = formatDate(day)
      return linkedRoutines.filter(routine => isRoutineScheduledOn(routine, date)).map(routine => ({ routine, date }))
    })
    const done = occurrences.filter(({ routine, date }) => logs.some(log => log.routine_id === routine.id && log.date === date && log.done)).length
    const todayRoutines = linkedRoutines.filter(routine => isRoutineScheduledOn(routine, today))
    const todayDone = todayRoutines.filter(routine => logs.some(log => log.routine_id === routine.id && log.date === today && log.done)).length

    let mastery = 0
    let rebounds = 0
    for (const routine of linkedRoutines) {
      const dates = scheduledDates(routine, last14Days)
      dates.forEach((date, index) => {
        const isDone = logs.some(log => log.routine_id === routine.id && log.date === date && log.done)
        if (isDone) mastery += 1
        if (index > 0) {
          const previousDone = logs.some(log => log.routine_id === routine.id && log.date === dates[index - 1] && log.done)
          if (!previousDone && isDone) rebounds += 1
        }
      })
    }

    return {
      done,
      total: occurrences.length,
      pct: occurrences.length ? Math.round(done / occurrences.length * 100) : 0,
      todayDone,
      todayTotal: todayRoutines.length,
      mastery,
      rebounds,
    }
  }

  const totalStats = useMemo(() => {
    const active = identities.flatMap(identity => identity.routines)
    const unique = [...new Map(active.map(routine => [routine.id, routine])).values()]
    return identityStats(unique)
  // identityStats only derives from these values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identities, logs, weekDays, last14Days, today])

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

  function updateRoutineConfig(routine: Routine, patch: Partial<RoutineConfig>) {
    onUpdateRoutine(routine.id, { config: { ...(routine.config ?? {}), ...patch } })
  }

  function updateNarrative(goalId: string, patch: Partial<GoalNarrative>) {
    const current = narratives[goalId] ?? EMPTY_NARRATIVE
    onUpdateWeeklyReview(GOAL_NARRATIVE_SYNC_KEY, JSON.stringify({ ...narratives, [goalId]: { ...current, ...patch } }))
  }

  function updateBehaviorSystem(patch: Partial<BehaviorSystem>) {
    onUpdateWeeklyReview(BEHAVIOR_SYSTEM_SYNC_KEY, JSON.stringify({ ...behaviorSystem, ...patch }))
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
        <div className="border-b border-[var(--border)] px-6 py-5">
          <div className="flex items-center gap-2 text-[var(--purple)]">
            <Compass size={18} />
            <p className="text-xs font-black tracking-[0.14em]">ABOUT ME</p>
          </div>
          <h2 className="mt-2 text-xl font-black tracking-tight">나를 압박하지 않고, 행동하기 쉬운 시스템을 만듭니다.</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--text-3)]">정체성은 루틴으로 증명하고, 큰 목표는 의미·장애물·실행 계획을 구체화합니다. 완벽한 연속 기록보다 작은 성공과 빠른 복귀를 더 중요하게 봅니다.</p>
        </div>

        <div className="grid gap-3 p-6 md:grid-cols-4">
          <MetricCard icon={<Trophy size={16} />} label="이번 주 정체성 증거" value={`${totalStats.done}/${totalStats.total}`} sub={`${totalStats.pct}% 실행`} tone="purple" />
          <MetricCard icon={<Zap size={16} />} label="오늘 행동" value={`${totalStats.todayDone}/${totalStats.todayTotal}`} sub="오늘 예정된 루틴" tone="teal" />
          <MetricCard icon={<Brain size={16} />} label="최근 14일 작은 성공" value={`${totalStats.mastery}회`} sub="자기효능감의 근거" tone="blue" />
          <MetricCard icon={<RotateCcw size={16} />} label="다시 시작한 증거" value={`${totalStats.rebounds}회`} sub="놓친 뒤 다음 기회에 복귀" tone="amber" />
        </div>
      </section>

      <section className="rounded-[22px] border border-[var(--border)] bg-white p-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-black">정체성 & 루틴</h3>
            <p className="mt-1 text-xs text-[var(--text-3)]">정체성은 선언보다 반복 행동으로 강화합니다. 루틴에는 시작 신호와 최소 버전을 함께 둡니다.</p>
          </div>
          <button type="button" onClick={() => setShowIdentityForm(value => !value)} className="inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-2)] hover:border-[var(--purple)] hover:text-[var(--purple)]">
            <Plus size={13} /> 정체성 추가
          </button>
        </div>

        {showIdentityForm && (
          <div className="mb-4 grid gap-2 rounded-[16px] border border-[var(--purple)]/20 bg-[var(--purple-bg)]/30 p-4 md:grid-cols-2">
            <input value={identityForm.name} onChange={event => setIdentityForm(prev => ({ ...prev, name: event.target.value }))} placeholder="정체성 이름 · 예: 연구자" className="rounded-[9px] border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--purple)]" />
            <input value={identityForm.statement} onChange={event => setIdentityForm(prev => ({ ...prev, statement: event.target.value }))} placeholder="나는 어떤 방식으로 행동하는 사람인가?" className="rounded-[9px] border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--purple)]" />
            <textarea value={identityForm.meaning} onChange={event => setIdentityForm(prev => ({ ...prev, meaning: event.target.value }))} placeholder="이 정체성이 나에게 왜 중요한가?" rows={2} className="rounded-[9px] border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--purple)] md:col-span-2" />
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
            const stats = identityStats(identity.routines)
            const expanded = expandedIdentity === identity.name
            const draft = routineDrafts[identity.name] ?? { name: '', time: '' }
            const renameDraft = renameDrafts[identity.name] ?? identity.name
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
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-3)]">{identity.statement || `${identity.name}라는 정체성을 행동으로 증명합니다.`}</p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full" style={{ width: `${stats.pct}%`, background: COLOR_DOT[identity.color] }} /></div>
                      <div className="mt-2 flex items-center justify-between text-[10px] font-semibold text-[var(--text-3)]"><span>이번 주 {stats.done}/{stats.total}</span><span>14일 성공 {stats.mastery} · 복귀 {stats.rebounds}</span></div>
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-[var(--border)] bg-[var(--surface-2)]/25 p-4">
                    <div className="mb-3 rounded-[11px] border border-[var(--border)] bg-white p-3">
                      <div className="flex items-center gap-2 text-[10px] font-black text-[var(--text-3)]"><PencilLine size={12} /> 정체성 이름</div>
                      <div className="mt-2 flex gap-2">
                        <input value={renameDraft} onChange={event => setRenameDrafts(prev => ({ ...prev, [identity.name]: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter') renameIdentity(identity) }} className="min-w-0 flex-1 rounded-[8px] border border-[var(--border)] px-2.5 py-2 text-xs font-bold outline-none focus:border-[var(--purple)]" />
                        <button type="button" onClick={() => renameIdentity(identity)} className="rounded-[8px] bg-[var(--purple)] px-3 text-[11px] font-bold text-white">이름 변경</button>
                      </div>
                      {renameError[identity.name] && <p className="mt-1 text-[10px] font-semibold text-[var(--red)]">{renameError[identity.name]}</p>}
                    </div>

                    <label className="text-[10px] font-bold text-[var(--text-3)]">나는 이런 방식으로 행동하는 사람이다</label>
                    <textarea defaultValue={identity.statement} onBlur={event => upsertProfile({ name: identity.name, statement: event.target.value, meaning: identity.meaning, color: identity.color })} rows={2} className="mt-1 w-full rounded-[9px] border border-[var(--border)] bg-white px-3 py-2 text-xs outline-none focus:border-[var(--purple)]" />
                    <label className="mt-3 block text-[10px] font-bold text-[var(--text-3)]">왜 이 사람이 되고 싶은가?</label>
                    <textarea defaultValue={identity.meaning} onBlur={event => upsertProfile({ name: identity.name, statement: identity.statement, meaning: event.target.value, color: identity.color })} rows={2} className="mt-1 w-full rounded-[9px] border border-[var(--border)] bg-white px-3 py-2 text-xs outline-none focus:border-[var(--purple)]" />

                    <div className="mt-4 space-y-2">
                      {identity.routines.map(routine => {
                        const config = routineConfig(routine)
                        const done = logs.some(log => log.routine_id === routine.id && log.date === today && log.done)
                        return (
                          <div key={routine.id} className="rounded-[11px] border border-[var(--border)] bg-white p-3">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: done ? COLOR_DOT[identity.color] : 'var(--border-strong)' }} />
                              <span className="min-w-0 flex-1 truncate text-xs font-bold">{routine.name}</span>
                              <span className="text-[10px] font-semibold text-[var(--text-3)]">{done ? '오늘 증명함' : '다음 기회가 남아 있음'}</span>
                            </div>
                            <div className="mt-2 grid gap-2 sm:grid-cols-3">
                              <label className="text-[9px] font-bold text-[var(--text-3)]">시작 신호
                                <input defaultValue={config.cue_label ?? ''} onBlur={event => updateRoutineConfig(routine, { cue_label: event.target.value, cue_type: event.target.value ? 'event' : config.cue_type })} placeholder="예: 아침 식사 후" className="mt-1 w-full rounded-[7px] bg-[var(--surface-2)] px-2 py-1.5 text-[10px] font-medium text-[var(--text)] outline-none" />
                              </label>
                              <label className="text-[9px] font-bold text-[var(--text-3)]">최소 버전
                                <input defaultValue={config.minimum_version ?? ''} onBlur={event => updateRoutineConfig(routine, { minimum_version: event.target.value })} placeholder="예: 5분만" className="mt-1 w-full rounded-[7px] bg-[var(--surface-2)] px-2 py-1.5 text-[10px] font-medium text-[var(--text)] outline-none" />
                              </label>
                              <label className="text-[9px] font-bold text-[var(--text-3)]">예정 시간
                                <input type="time" defaultValue={routine.time ?? ''} onBlur={event => onUpdateRoutine(routine.id, { time: event.target.value || undefined })} className="mt-1 w-full rounded-[7px] bg-[var(--surface-2)] px-2 py-1.5 text-[10px] font-medium text-[var(--text)] outline-none" />
                              </label>
                            </div>
                          </div>
                        )
                      })}
                      {identity.routines.length === 0 && <p className="rounded-[9px] border border-dashed border-[var(--border)] bg-white px-3 py-4 text-center text-[11px] text-[var(--text-3)]">아직 연결된 루틴이 없습니다.</p>}
                    </div>

                    <div className="mt-3 flex gap-2">
                      <input value={draft.name} onChange={event => setRoutineDrafts(prev => ({ ...prev, [identity.name]: { ...draft, name: event.target.value } }))} placeholder="이 정체성을 증명할 새 루틴" className="min-w-0 flex-1 rounded-[8px] border border-[var(--border)] bg-white px-2.5 py-2 text-xs outline-none" />
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
      </section>

      <section className="rounded-[22px] border border-[var(--amber)]/20 bg-white p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--amber-bg)] text-[var(--amber-text)]"><ShieldCheck size={19} /></div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-black">회복 프로토콜</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-3)]">실패 자체보다 실패 뒤 무엇을 하는지가 시스템의 일부입니다. 죄책감으로 밀어붙이기보다 다음 행동을 명확히 둡니다.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <BehaviorField label="놓쳤을 때" value={behaviorSystem.resetRule} onSave={value => updateBehaviorSystem({ resetRule: value })} />
          <BehaviorField label="의욕이 없을 때" value={behaviorSystem.minimumRule} onSave={value => updateBehaviorSystem({ minimumRule: value })} />
          <BehaviorField label="나에게 할 말" value={behaviorSystem.selfTalk} onSave={value => updateBehaviorSystem({ selfTalk: value })} />
        </div>
      </section>

      <section className="rounded-[22px] border border-[var(--border)] bg-white p-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Target size={17} className="text-[var(--teal)]" /><h3 className="text-base font-black">큰 목표</h3></div>
            <p className="mt-1 text-xs text-[var(--text-3)]">정체성과 별개로 관리하되, 원하는 미래만 상상하지 않고 현실의 장애물과 대응 계획까지 함께 적습니다.</p>
          </div>
          <button type="button" onClick={() => setShowGoalForm(value => !value)} className="inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-2)] hover:border-[var(--teal)] hover:text-[var(--teal)]"><Plus size={13} /> 큰 목표 추가</button>
        </div>

        {showGoalForm && (
          <div className="mb-4 grid gap-2 rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)]/40 p-4 md:grid-cols-2">
            <input value={goalForm.title} onChange={event => setGoalForm(prev => ({ ...prev, title: event.target.value }))} placeholder="큰 목표 제목" className="rounded-[9px] border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none" />
            <input value={goalForm.description} onChange={event => setGoalForm(prev => ({ ...prev, description: event.target.value }))} placeholder="한 문장으로 명확하게 정의" className="rounded-[9px] border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none" />
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
                      <p className="mt-1 truncate text-xs text-[var(--text-3)]">{goal.description || '구체적이고 도전적인 결과를 한 문장으로 정의해보세요.'}</p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full" style={{ width: `${progress.pct}%`, background: COLOR_DOT[color] }} /></div>
                      <div className="mt-2 flex gap-3 text-[10px] text-[var(--text-3)]"><span>{goal.date_from} → {goal.date_to}</span><span>{progress.done}/{progress.total} 완료</span></div>
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-[var(--border)] bg-[var(--surface-2)]/20 p-5">
                    <div className="grid gap-3 md:grid-cols-2">
                      <GoalField color={color} label="왜 내가 이 목표를 원하는가?" hint="외부 압박이 아니라 나에게 중요한 이유" value={narrative.why} onSave={value => updateNarrative(goal.id, { why: value })} />
                      <GoalField color={color} label="달성한 미래는 어떤 모습인가?" hint="구체적으로 보이는 변화와 감정" value={narrative.futureSelf} onSave={value => updateNarrative(goal.id, { futureSelf: value })} />
                      <GoalField color={color} label="가장 큰 현실의 장애물은?" hint="내 안의 습관·상황·감정 중 반복해서 막는 것" value={narrative.obstacle} onSave={value => updateNarrative(goal.id, { obstacle: value })} />
                      <GoalField color={color} label="If–Then 대응 계획" hint="예: 만약 폰을 켜고 싶어지면, 5분 타이머부터 켠다" value={narrative.ifThen} onSave={value => updateNarrative(goal.id, { ifThen: value })} />
                      <GoalField color={color} label="Definition of Done" hint="언제 완료라고 판단할지 측정 가능한 기준" value={narrative.doneDefinition} onSave={value => updateNarrative(goal.id, { doneDefinition: value })} />
                      <GoalField color={color} label="놓쳤을 때 복귀 규칙" hint="자책 대신 언제, 어떤 최소 행동으로 돌아올지" value={narrative.recoveryPlan} onSave={value => updateNarrative(goal.id, { recoveryPlan: value })} />
                    </div>

                    <label className="mt-3 block rounded-[13px] border border-[var(--purple)]/20 bg-[var(--purple-bg)]/45 p-3">
                      <span className="flex items-center gap-1.5 text-[11px] font-black text-[var(--purple-text)]"><Zap size={12} /> 지금 할 수 있는 가장 작은 다음 행동</span>
                      <input defaultValue={narrative.nextAction} onBlur={event => updateNarrative(goal.id, { nextAction: event.target.value })} placeholder="5분 안에 시작할 수 있을 만큼 작게" className="mt-2 w-full bg-transparent text-sm font-semibold outline-none placeholder:font-normal placeholder:text-[var(--text-3)]" />
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

      <section className="rounded-[18px] border border-[var(--border)] bg-white p-5">
        <p className="text-[10px] font-black tracking-[0.12em] text-[var(--text-3)]">BEHAVIOR DESIGN PRINCIPLES</p>
        <div className="mt-3 grid gap-2 md:grid-cols-5">
          {[
            ['의미', '내가 선택한 이유를 명확히'],
            ['구체성', '결과와 완료 기준을 분명히'],
            ['If–Then', '장애물에 대한 행동을 미리 결정'],
            ['최소 버전', '행동 시작의 마찰을 낮추기'],
            ['빠른 복귀', '연속일수보다 재시작을 보상'],
          ].map(([title, body]) => <div key={title} className="rounded-[11px] bg-[var(--surface-2)] px-3 py-3"><p className="text-[11px] font-black">{title}</p><p className="mt-1 text-[10px] leading-relaxed text-[var(--text-3)]">{body}</p></div>)}
        </div>
      </section>
    </div>
  )
}

function MetricCard({ icon, label, value, sub, tone }: { icon: ReactNode; label: string; value: string; sub: string; tone: BadgeColor }) {
  return (
    <div className="rounded-[15px] border border-[var(--border)] bg-[var(--surface-2)]/25 p-4">
      <div className="flex items-center gap-2 text-[10px] font-bold" style={{ color: COLOR_TEXT[tone] }}><span className="flex h-7 w-7 items-center justify-center rounded-[9px]" style={{ background: COLOR_BG[tone] }}>{icon}</span>{label}</div>
      <p className="mt-3 text-2xl font-black tracking-tight">{value}</p>
      <p className="mt-0.5 text-[10px] text-[var(--text-3)]">{sub}</p>
    </div>
  )
}

function BehaviorField({ label, value, onSave }: { label: string; value: string; onSave: (value: string) => void }) {
  return (
    <label className="rounded-[13px] border border-[var(--border)] bg-[var(--surface-2)]/30 p-3">
      <span className="text-[10px] font-black text-[var(--amber-text)]">{label}</span>
      <textarea defaultValue={value} onBlur={event => onSave(event.target.value)} rows={3} className="mt-2 w-full resize-none bg-transparent text-xs leading-relaxed outline-none" />
    </label>
  )
}

function GoalField({ color, label, hint, value, onSave }: { color: BadgeColor; label: string; hint: string; value: string; onSave: (value: string) => void }) {
  return (
    <label className="rounded-[13px] border border-[var(--border)] bg-white p-3">
      <span className="text-[11px] font-black" style={{ color: COLOR_TEXT[color] }}>{label}</span>
      <span className="mt-0.5 block text-[9px] text-[var(--text-3)]">{hint}</span>
      <textarea defaultValue={value} onBlur={event => onSave(event.target.value)} rows={3} className="mt-2 w-full resize-none bg-transparent text-xs leading-relaxed outline-none placeholder:text-[var(--text-3)]" />
    </label>
  )
}
