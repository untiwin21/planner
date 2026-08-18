'use client'

import { useMemo, useState } from 'react'
import { Archive, CheckCircle2, Clock3, Pause, Pencil, Play, Plus, Timer, Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import {
  ROUTINE_WEEKDAYS,
  routineConfig,
  routineKind,
  routineStage,
} from '@/lib/routineSchedule'
import type {
  BadgeColor,
  Routine,
  RoutineConfig,
  RoutineCueType,
  RoutineKind,
  RoutinePeriod,
  RoutineStage,
  RoutineStatus,
} from '@/types'

const COLORS: BadgeColor[] = ['amber', 'purple', 'teal', 'blue', 'coral']
const STAGE_LABELS: Record<RoutineStage, string> = {
  forming: '형성 중',
  maintenance: '유지 중',
  backlog: '보관함',
}

interface Props {
  routines: Routine[]
  onClose: () => void
  onAddRoutine: (name: string, time?: string, period?: RoutinePeriod, config?: RoutineConfig) => void
  onUpdateRoutine: (id: string, patch: Partial<Omit<Routine, 'id'>>) => void
  onSetStatus: (id: string, status: RoutineStatus) => void
  onDeleteRoutine: (id: string) => void
}

interface Draft {
  name: string
  kind: RoutineKind
  time: string
  duration: string
  cueType: RoutineCueType
  cueLabel: string
  minimumVersion: string
  bundle: string
  stage: RoutineStage
  color: BadgeColor
  days: number[]
}

const EMPTY_DRAFT: Draft = {
  name: '',
  kind: 'timed',
  time: '',
  duration: '15',
  cueType: 'time',
  cueLabel: '',
  minimumVersion: '',
  bundle: '',
  stage: 'forming',
  color: 'amber',
  days: [0, 1, 2, 3, 4, 5, 6],
}

function periodFromTime(time: string): RoutinePeriod {
  if (!time) return 'anytime'
  const hour = Number.parseInt(time.split(':')[0], 10)
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  return 'evening'
}

function routineSubtitle(routine: Routine): string {
  const config = routineConfig(routine)
  const schedule = routine.time || config.cue_label || '시간 미지정'
  const days = config.days_of_week.length === 7
    ? '매일'
    : config.days_of_week.map(day => ROUTINE_WEEKDAYS[day]).join('·')
  const kind = routineKind(routine) === 'timed' ? `시간형 · ${config.duration_min}분` : '체크형'
  return `${kind} · ${schedule} · ${days}`
}

export function RoutineManagerDialog({
  routines,
  onClose,
  onAddRoutine,
  onUpdateRoutine,
  onSetStatus,
  onDeleteRoutine,
}: Props) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  const formingCount = routines.filter(routine => routine.status === 'active' && routineStage(routine) === 'forming').length
  const sections = useMemo(() => [
    {
      key: 'forming',
      label: '형성 중',
      hint: '지금 의식적으로 익히는 루틴 · 최대 3개',
      items: routines.filter(routine => routine.status === 'active' && routineStage(routine) === 'forming'),
    },
    {
      key: 'maintenance',
      label: '유지 중',
      hint: '이미 자리를 잡아 계속 유지하는 루틴',
      items: routines.filter(routine => routine.status === 'active' && routineStage(routine) === 'maintenance'),
    },
    {
      key: 'backlog',
      label: '보관함',
      hint: '다음에 시작할 후보',
      items: routines.filter(routine => routine.status === 'active' && routineStage(routine) === 'backlog'),
    },
    {
      key: 'paused',
      label: '일시정지',
      hint: '당분간 오늘 계획에 표시하지 않음',
      items: routines.filter(routine => routine.status === 'paused'),
    },
    {
      key: 'archived',
      label: '보관 기록',
      hint: '완전히 종료한 루틴',
      items: routines.filter(routine => routine.status === 'archived'),
    },
  ], [routines])

  function resetForm() {
    setDraft(EMPTY_DRAFT)
    setEditingId(null)
    setShowForm(false)
    setError('')
  }

  function startEdit(routine: Routine) {
    const config = routineConfig(routine)
    setDraft({
      name: routine.name,
      kind: config.kind,
      time: routine.time ?? '',
      duration: String(config.duration_min),
      cueType: config.cue_type,
      cueLabel: config.cue_label ?? '',
      minimumVersion: config.minimum_version ?? '',
      bundle: config.bundle ?? '',
      stage: config.stage,
      color: config.category_color,
      days: [...config.days_of_week],
    })
    setEditingId(routine.id)
    setShowForm(true)
    setError('')
  }

  function save() {
    const name = draft.name.trim()
    const parsedDuration = Number.parseInt(draft.duration, 10)
    if (!name || draft.days.length === 0 || (draft.kind === 'timed' && (!Number.isFinite(parsedDuration) || parsedDuration < 5))) {
      setError(draft.kind === 'timed' ? '이름, 소요시간, 실행 요일을 확인해주세요.' : '이름과 실행 요일을 확인해주세요.')
      return
    }
    const duration = Math.max(5, parsedDuration || 5)
    const editingRoutine = routines.find(routine => routine.id === editingId)
    const enteringForming = draft.stage === 'forming' && (!editingRoutine || routineStage(editingRoutine) !== 'forming')
    if (enteringForming && formingCount >= 3) {
      setError('형성 중 루틴은 최대 3개입니다. 하나를 유지 중이나 보관함으로 옮겨주세요.')
      return
    }
    const config: RoutineConfig = {
      days_of_week: [...draft.days].sort(),
      kind: draft.kind,
      duration_min: draft.kind === 'timed' ? duration : undefined,
      cue_type: draft.cueType,
      cue_label: draft.cueLabel.trim() || undefined,
      minimum_version: draft.kind === 'timed' ? draft.minimumVersion.trim() || undefined : undefined,
      bundle: draft.kind === 'timed' ? draft.bundle.trim() || undefined : undefined,
      stage: draft.stage,
      category_color: draft.color,
    }
    const time = draft.time || undefined
    const period = periodFromTime(draft.time)
    if (editingId) onUpdateRoutine(editingId, { name, time, period, config })
    else onAddRoutine(name, time, period, config)
    resetForm()
  }

  function toggleDay(day: number) {
    setDraft(value => ({
      ...value,
      days: value.days.includes(day) ? value.days.filter(item => item !== day) : [...value.days, day],
    }))
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="루틴 관리"
        className="max-h-[92svh] w-full max-w-3xl overflow-y-auto rounded-t-[22px] bg-white shadow-2xl sm:rounded-[22px]"
        onClick={event => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-white/95 px-5 py-4 backdrop-blur-sm">
          <div>
            <h2 className="text-lg font-bold">루틴 설계실</h2>
            <p className="mt-0.5 text-xs text-[var(--text-3)]">형성 중인 루틴은 적게, 익숙해진 루틴은 묶어서 유지하세요.</p>
          </div>
          <button type="button" aria-label="닫기" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--surface-2)]"><X size={17} /></button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[1fr_1.05fr]">
          <div className="flex flex-col gap-4">
            <div className="rounded-[14px] bg-[var(--amber-bg)] px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[var(--amber-text)]">형성 중 {formingCount}/3</span>
                <span className="text-[11px] text-[var(--amber-text)]">새 루틴은 하나씩</span>
              </div>
            </div>

            {sections.map(section => (
              <section key={section.key}>
                <div className="mb-2 flex items-end justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold">{section.label} <span className="text-xs font-normal text-[var(--text-3)]">{section.items.length}</span></h3>
                    <p className="text-[10px] text-[var(--text-3)]">{section.hint}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  {section.items.map(routine => (
                    <div key={routine.id} className="group flex items-center gap-2 rounded-[11px] border border-[var(--border)] px-3 py-2.5">
                      <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', `cat-${routineConfig(routine).category_color}`)} />
                      <button type="button" onClick={() => startEdit(routine)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm font-semibold">{routine.name}</span>
                        <span className="block truncate text-[10px] text-[var(--text-3)]">{routineSubtitle(routine)}</span>
                      </button>
                      <button type="button" aria-label={`${routine.name} 수정`} onClick={() => startEdit(routine)} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[var(--text-3)] hover:bg-[var(--surface-2)]"><Pencil size={12} /></button>
                      {routine.status === 'active' ? (
                        <button type="button" aria-label={`${routine.name} 일시정지`} onClick={() => onSetStatus(routine.id, 'paused')} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[var(--text-3)] hover:bg-[var(--surface-2)]"><Pause size={12} /></button>
                      ) : (
                        <button type="button" aria-label={`${routine.name} 재개`} onClick={() => onSetStatus(routine.id, 'active')} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[var(--teal)] hover:bg-[var(--teal-bg)]"><Play size={12} /></button>
                      )}
                      {routine.status !== 'archived' ? (
                        <button type="button" aria-label={`${routine.name} 보관`} onClick={() => onSetStatus(routine.id, 'archived')} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[var(--text-3)] hover:bg-[var(--surface-2)]"><Archive size={12} /></button>
                      ) : (
                        <button type="button" aria-label={`${routine.name} 삭제`} onClick={() => onDeleteRoutine(routine.id)} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[var(--red)] hover:bg-[var(--red-bg)]"><Trash2 size={12} /></button>
                      )}
                    </div>
                  ))}
                  {section.items.length === 0 && <p className="rounded-[10px] border border-dashed border-[var(--border)] px-3 py-2 text-xs text-[var(--text-3)]">비어 있음</p>}
                </div>
              </section>
            ))}
          </div>

          <div className="md:sticky md:top-20 md:self-start">
            {!showForm ? (
              <button type="button" onClick={() => setShowForm(true)} className="flex w-full items-center justify-center gap-2 rounded-[13px] bg-[var(--purple)] px-4 py-3 text-sm font-bold text-white"><Plus size={15} /> 새 루틴 설계</button>
            ) : (
              <div className="rounded-[16px] border border-[var(--border)] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-bold">{editingId ? '루틴 수정' : '새 루틴'}</h3>
                  <button type="button" onClick={resetForm} className="text-xs text-[var(--text-3)]">취소</button>
                </div>

                <div className="flex flex-col gap-3">
                  <div>
                    <span className="text-xs font-semibold text-[var(--text-2)]">루틴 종류</span>
                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setDraft(value => ({ ...value, kind: 'timed' }))} className={clsx('rounded-[11px] border px-3 py-3 text-left transition-colors', draft.kind === 'timed' ? 'border-[var(--purple)] bg-[var(--purple-bg)] text-[var(--purple-text)]' : 'border-[var(--border)] bg-white text-[var(--text-3)]')}>
                        <span className="flex items-center gap-1.5 text-xs font-bold"><Timer size={14} /> 시간형</span>
                        <span className="mt-1 block text-[10px] leading-relaxed">러닝·공부처럼 시간을 쓰고 타임라인에 표시</span>
                      </button>
                      <button type="button" onClick={() => setDraft(value => ({ ...value, kind: 'check' }))} className={clsx('rounded-[11px] border px-3 py-3 text-left transition-colors', draft.kind === 'check' ? 'border-[var(--teal)] bg-[var(--teal-bg)] text-[var(--teal-text)]' : 'border-[var(--border)] bg-white text-[var(--text-3)]')}>
                        <span className="flex items-center gap-1.5 text-xs font-bold"><CheckCircle2 size={14} /> 체크형</span>
                        <span className="mt-1 block text-[10px] leading-relaxed">물·영양제처럼 했는지만 한 번 체크</span>
                      </button>
                    </div>
                  </div>

                  <label className="text-xs font-semibold text-[var(--text-2)]">행동
                    <input autoFocus value={draft.name} onChange={event => setDraft(value => ({ ...value, name: event.target.value }))} placeholder="예: 스트레칭" className="mt-1.5 w-full rounded-[10px] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--purple)]" />
                  </label>

                  <div className={clsx('grid gap-2', draft.kind === 'timed' && 'grid-cols-2')}>
                    <label className="text-xs font-semibold text-[var(--text-2)]">{draft.kind === 'timed' ? '시작 시간' : '알림 시간 (선택)'}
                      <div className="mt-1.5 flex items-center gap-1 rounded-[10px] bg-[var(--surface-2)] px-2.5"><Clock3 size={13} className="text-[var(--text-3)]" /><input type="time" value={draft.time} onChange={event => setDraft(value => ({ ...value, time: event.target.value }))} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" /></div>
                    </label>
                    {draft.kind === 'timed' && <label className="text-xs font-semibold text-[var(--text-2)]">소요시간
                      <div className="mt-1.5 flex items-center rounded-[10px] bg-[var(--surface-2)] px-3"><input inputMode="numeric" value={draft.duration} onChange={event => setDraft(value => ({ ...value, duration: event.target.value.replace(/\D/g, '').slice(0, 3) }))} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" /><span className="text-xs text-[var(--text-3)]">분</span></div>
                    </label>}
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-[var(--text-2)]">실행 신호</span>
                    <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-[10px] bg-[var(--surface-2)] p-1">
                      {([['time', '정해진 시간'], ['event', '행동 직후']] as const).map(([value, label]) => <button type="button" key={value} onClick={() => setDraft(item => ({ ...item, cueType: value }))} className={clsx('rounded-[8px] px-2 py-2 text-xs font-semibold', draft.cueType === value ? 'bg-white text-[var(--purple)] shadow-sm' : 'text-[var(--text-3)]')}>{label}</button>)}
                    </div>
                    {draft.cueType === 'event' && <input value={draft.cueLabel} onChange={event => setDraft(value => ({ ...value, cueLabel: event.target.value }))} placeholder="예: 연구실에 도착하면" className="mt-2 w-full rounded-[10px] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--purple)]" />}
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-[var(--text-2)]">실행 요일</span>
                    <div className="mt-1.5 grid grid-cols-7 gap-1">
                      {ROUTINE_WEEKDAYS.map((label, day) => <button type="button" key={label} onClick={() => toggleDay(day)} className={clsx('rounded-[8px] py-2 text-xs font-semibold', draft.days.includes(day) ? 'bg-[var(--purple)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-3)]')}>{label}</button>)}
                    </div>
                  </div>

                  {draft.kind === 'timed' && <label className="text-xs font-semibold text-[var(--text-2)]">최소 버전
                    <input value={draft.minimumVersion} onChange={event => setDraft(value => ({ ...value, minimumVersion: event.target.value }))} placeholder="예: 1분만 하기" className="mt-1.5 w-full rounded-[10px] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--purple)]" />
                  </label>}
                  {draft.kind === 'timed' && <label className="text-xs font-semibold text-[var(--text-2)]">타임라인 묶음
                    <input value={draft.bundle} onChange={event => setDraft(value => ({ ...value, bundle: event.target.value }))} placeholder="예: 기상 루틴" className="mt-1.5 w-full rounded-[10px] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--purple)]" />
                  </label>}

                  <div>
                    <span className="text-xs font-semibold text-[var(--text-2)]">관리 상태</span>
                    <div className="mt-1.5 grid grid-cols-3 gap-1">
                      {(Object.keys(STAGE_LABELS) as RoutineStage[]).map(stage => <button type="button" key={stage} onClick={() => setDraft(value => ({ ...value, stage }))} className={clsx('rounded-[8px] px-1 py-2 text-xs font-semibold', draft.stage === stage ? 'bg-[var(--teal)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-3)]')}>{STAGE_LABELS[stage]}</button>)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text-2)]">색상</span>
                    {COLORS.map(color => <button type="button" key={color} aria-label={color} onClick={() => setDraft(value => ({ ...value, color }))} className={clsx('h-6 w-6 rounded-full', `cat-${color}`, draft.color === color && 'ring-2 ring-[var(--purple)] ring-offset-2')} />)}
                  </div>

                  {error && <p className="rounded-[9px] bg-[var(--red-bg)] px-3 py-2 text-xs font-medium text-[var(--red)]">{error}</p>}
                  <button type="button" onClick={save} className="mt-1 rounded-[11px] bg-[var(--purple)] px-4 py-2.5 text-sm font-bold text-white">{editingId ? '변경 저장' : '루틴 추가'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
