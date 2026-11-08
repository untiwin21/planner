'use client'

import { useState } from 'react'
import { ChevronDown, Pencil, Plus, Trash2, X } from 'lucide-react'
import { ROUTINE_WEEKDAYS, routineConfig } from '@/lib/routineSchedule'
import type { Routine, RoutineConfig, RoutinePeriod, RoutineStatus } from '@/types'

interface Props {
  routines: Routine[]
  onClose: () => void
  onAddRoutine: (name: string, time?: string, period?: RoutinePeriod, config?: RoutineConfig) => void
  onUpdateRoutine: (id: string, patch: Partial<Omit<Routine, 'id'>>) => void
  onSetStatus: (id: string, status: RoutineStatus) => void
  onDeleteRoutine: (id: string) => void
}

const inputClass = 'w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--teal)]'

export function RoutineManagerDialog({ routines, onClose, onAddRoutine, onUpdateRoutine, onSetStatus, onDeleteRoutine }: Props) {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [newGroup, setNewGroup] = useState('')
  const [rename, setRename] = useState<string | null>(null)
  const [groupName, setGroupName] = useState('')
  const [editing, setEditing] = useState<Routine | null>(null)
  const [name, setName] = useState('')
  const [days, setDays] = useState([0, 1, 2, 3, 4, 5, 6])
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null)
  const groupOf = (routine: Routine) => routineConfig(routine).bundle?.trim() || '기타 루틴'
  const groups = [...new Set(routines.map(groupOf))]

  function selectGroup(group: string | null) {
    setSelectedGroup(group)
    setEditing(null)
    setName('')
    setDays([0, 1, 2, 3, 4, 5, 6])
    setError('')
  }

  function addGroup() {
    const value = newGroup.trim()
    if (!value) return
    if (!groups.includes(value)) onAddRoutine(value, undefined, 'anytime', { group_only: true, bundle: value, kind: 'check', stage: 'maintenance' })
    setNewGroup('')
    selectGroup(value)
  }

  function saveRoutine() {
    if (!selectedGroup || !name.trim() || !days.length) {
      setError('세부 루틴 이름과 실행 요일을 입력해주세요.')
      return
    }
    const config: RoutineConfig = {
      ...(editing?.config ?? {}),
      bundle: selectedGroup,
      days_of_week: [...days].sort(),
      stage: 'maintenance',
      kind: editing ? routineConfig(editing).kind : 'check',
      category_color: editing ? routineConfig(editing).category_color : 'teal',
    }
    if (editing) onUpdateRoutine(editing.id, { name: name.trim(), config })
    else onAddRoutine(name.trim(), undefined, 'anytime', config)
    setEditing(null)
    setName('')
    setError('')
  }

  function renameGroup(oldName: string) {
    const value = groupName.trim()
    if (!value) return
    if (value !== oldName && groups.includes(value)) {
      setError('이미 있는 묶음 이름입니다. 다른 이름을 입력해주세요.')
      return
    }
    for (const routine of routines.filter(item => groupOf(item) === oldName)) {
      onUpdateRoutine(routine.id, { config: { ...routine.config, bundle: value } })
    }
    if (selectedGroup === oldName) setSelectedGroup(value)
    setRename(null)
    setError('')
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-3" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="루틴 묶음 관리" className="max-h-[90svh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={event => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-bold">루틴 묶음 관리</h2><p className="mt-1 text-xs text-[var(--text-3)]">묶음 이름을 정하고 그 안에 체크할 루틴을 넣으세요.</p></div>
          <button type="button" aria-label="닫기" onClick={onClose} className="rounded-lg p-2 hover:bg-[var(--surface-2)]"><X size={18} /></button>
        </div>
        <form onSubmit={event => { event.preventDefault(); addGroup() }} className="mb-4 flex gap-2">
          <input aria-label="새 루틴 묶음 이름" value={newGroup} onChange={event => setNewGroup(event.target.value)} placeholder="새 묶음 이름 · 예: 아침 준비" className={inputClass} />
          <button type="submit" className="shrink-0 rounded-lg bg-[var(--teal)] px-3 text-sm font-semibold text-white"><Plus size={16} className="inline" /> 묶음 추가</button>
        </form>
        <div className="space-y-3">
          {groups.map(group => {
            const items = routines.filter(routine => !routine.config?.group_only && groupOf(routine) === group).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            return <section key={group} className="overflow-hidden rounded-xl border border-[var(--border)]">
              <div className="flex items-center gap-2 bg-[var(--surface-2)] px-3 py-2">
                {rename === group ? <form onSubmit={event => { event.preventDefault(); renameGroup(group) }} className="flex min-w-0 flex-1 gap-2"><input autoFocus aria-label="묶음 이름 수정" value={groupName} onChange={event => setGroupName(event.target.value)} className={inputClass} /><button type="submit" className="shrink-0 text-xs">저장</button><button type="button" onClick={() => setRename(null)} className="shrink-0 text-xs">취소</button></form> : <>
                  <button type="button" aria-expanded={selectedGroup === group} onClick={() => selectGroup(selectedGroup === group ? null : group)} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-sm font-bold"><ChevronDown size={15} className={selectedGroup === group ? 'rotate-180' : ''} /><span className="break-words">{group}</span><span className="text-xs font-normal text-[var(--text-3)]">{items.length}</span></button>
                  <button type="button" aria-label={`${group} 묶음 삭제`} onClick={() => setDeletingGroup(group)} className="p-2 text-[var(--text-3)]"><Trash2 size={14} /></button>
                  <button type="button" aria-label={`${group} 이름 변경`} onClick={() => { setRename(group); setGroupName(group) }} className="p-2"><Pencil size={14} /></button>
                </>}
              </div>
              {deletingGroup === group && <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] px-3 py-3 text-xs"><span>묶음과 세부 루틴 {items.length}개를 삭제할까요?</span><button type="button" onClick={() => { for (const item of routines.filter(routine => groupOf(routine) === group)) onDeleteRoutine(item.id); setDeletingGroup(null); if (selectedGroup === group) selectGroup(null) }} className="font-bold text-[var(--red)]">삭제 확인</button><button type="button" onClick={() => setDeletingGroup(null)}>취소</button></div>}
              {selectedGroup === group && <div className="space-y-3 p-3">
                {items.map(routine => <div key={routine.id} className="flex items-center gap-2 border-b border-[var(--border)] pb-2 text-sm">
                  <button type="button" onClick={() => { setEditing(routine); setName(routine.name); setDays([...routineConfig(routine).days_of_week]) }} className="min-w-0 flex-1 break-words text-left">{routine.name}{routine.status !== 'active' && <span className="ml-2 text-xs text-[var(--text-3)]">중지됨</span>}</button>
                  <button type="button" aria-label={`${routine.name} 수정`} onClick={() => { setEditing(routine); setName(routine.name); setDays([...routineConfig(routine).days_of_week]) }} className="p-2"><Pencil size={13} /></button>
                  {routine.status !== 'active' && <button type="button" onClick={() => onSetStatus(routine.id, 'active')} className="shrink-0 text-xs text-[var(--teal-text)]">재개</button>}
                  {deleting === routine.id ? <><button type="button" onClick={() => { onDeleteRoutine(routine.id); setDeleting(null); if (editing?.id === routine.id) { setEditing(null); setName('') } }} className="text-xs text-[var(--red)]">삭제 확인</button><button type="button" onClick={() => setDeleting(null)} className="text-xs">취소</button></> : <button type="button" aria-label={`${routine.name} 삭제`} onClick={() => setDeleting(routine.id)} className="p-2 text-[var(--text-3)]"><Trash2 size={13} /></button>}
                </div>)}
                <form onSubmit={event => { event.preventDefault(); saveRoutine() }} className="space-y-3">
                  <label className="block text-xs font-semibold">{editing ? '세부 루틴 수정' : '세부 루틴 추가'}<input aria-label="세부 루틴 이름" value={name} onChange={event => setName(event.target.value)} placeholder="예: 양치하기" className={`${inputClass} mt-1.5`} /></label>
                  <div><p className="mb-1.5 text-xs text-[var(--text-3)]">실행 요일</p><div className="grid grid-cols-7 gap-1">{ROUTINE_WEEKDAYS.map((label, day) => <button type="button" key={day} aria-pressed={days.includes(day)} onClick={() => setDays(current => current.includes(day) ? current.filter(item => item !== day) : [...current, day])} className={`rounded-lg py-2 text-xs ${days.includes(day) ? 'bg-[var(--teal-bg)] text-[var(--teal-text)]' : 'bg-[var(--surface-2)] text-[var(--text-3)]'}`}>{label}</button>)}</div></div>
                  <div className="flex gap-3"><button type="submit" className="rounded-lg bg-[var(--teal)] px-4 py-2 text-xs font-bold text-white">{editing ? '변경 저장' : '세부 루틴 추가'}</button>{editing && <button type="button" onClick={() => { setEditing(null); setName('') }} className="text-xs">취소</button>}</div>
                </form>
              </div>}
            </section>
          })}
          {!groups.length && <p className="py-4 text-center text-sm text-[var(--text-3)]">위에서 첫 루틴 묶음을 만들어보세요.</p>}
        </div>
        {error && <p role="alert" className="mt-3 text-xs text-[var(--red)]">{error}</p>}
        <button type="button" onClick={onClose} className="mt-5 w-full rounded-lg bg-[var(--surface-2)] py-2.5 text-sm font-semibold">완료</button>
      </div>
    </div>
  )
}
