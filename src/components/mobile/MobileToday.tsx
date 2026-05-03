'use client'
import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Check, Moon, Zap, Brain } from 'lucide-react'
import { parseISO, subDays, addDays as addDaysFns } from 'date-fns'
import clsx from 'clsx'
import { formatDate, formatDisplay, isToday, DAY_NAMES } from '@/lib/dates'
import type { DayEntry, Category, ShortGoal, Routine, RoutineLog, DayMeta, Task } from '@/types'
import { DEADLINE_CAT_ID, SCHEDULE_CAT_ID } from '@/types'

function calcStreak(routineId: string, todayStr: string, logs: RoutineLog[]): number {
  let streak = 0
  let date = parseISO(todayStr)
  while (true) {
    const dateStr = formatDate(date)
    if (!logs.find(l => l.routine_id === routineId && l.date === dateStr && l.done)) break
    streak++
    date = subDays(date, 1)
  }
  return streak
}

interface Props {
  date: string
  entry: DayEntry
  categories: Category[]
  goals: ShortGoal[]
  routines: Routine[]
  logs: RoutineLog[]
  onDateChange: (date: string) => void
  onToggleTask: (taskId: string) => void
  onAddTask: (catId: string, text: string, time?: string) => void
  onDeleteTask: (taskId: string) => void
  onMetaChange: (patch: Partial<DayMeta>) => void
  onToggleRoutine: (routineId: string, date: string) => void
  onToggleLinkedTask: (goalId: string, taskId: string) => void
  onLinkGoalTask: (taskId: string) => void
  onUnlinkGoalTask: (taskId: string) => void
}

const SLEEP_OPTIONS = [360, 390, 420, 450, 480, 510, 540, 570, 600]
const SLEEP_LABELS: Record<number, string> = {
  360: '6h', 390: '6.5h', 420: '7h', 450: '7.5h',
  480: '8h', 510: '8.5h', 540: '9h', 570: '9.5h', 600: '10h',
}
const SCORE_OPTIONS = [1, 2, 3, 4, 5]

export function MobileToday({
  date, entry, categories, goals, routines, logs,
  onDateChange, onToggleTask, onAddTask, onDeleteTask,
  onMetaChange, onToggleRoutine,
  onToggleLinkedTask, onLinkGoalTask, onUnlinkGoalTask,
}: Props) {
  const [addingCatId, setAddingCatId] = useState<string | null>(null)
  const [addText, setAddText] = useState('')
  const [addTime, setAddTime] = useState('')
  const [fabOpen, setFabOpen] = useState(false)
  const [fabMode, setFabMode] = useState<'task' | 'goal'>('task')
  const [qaText, setQaText] = useState('')
  const [qaGoalTitle, setQaGoalTitle] = useState('')
  const [qaGoalFrom, setQaGoalFrom] = useState(date)
  const [qaGoalTo, setQaGoalTo] = useState(date)
  const [importPickerCatId, setImportPickerCatId] = useState<string | null>(null)

  const dateObj = parseISO(date)
  const dayName = DAY_NAMES[dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1]
  const todayStr = isToday(dateObj) ? '오늘' : null

  const activeRoutines = useMemo(() => routines.filter(r => r.status === 'active'), [routines])
  const linkedIds: string[] = entry.meta.linkedGoalTaskIds ?? []

  // All goal tasks for this day (linked ones)
  const linkedGoalTasks = useMemo(() => {
    const result: { task: Task; goal: ShortGoal }[] = []
    for (const g of goals) {
      for (const t of g.tasks) {
        if (linkedIds.includes(t.id)) result.push({ task: t, goal: g })
      }
    }
    return result
  }, [goals, linkedIds])

  // Available goal tasks for import per category
  function getAvailableForImport(catId: string) {
    const result: { task: Task; goal: ShortGoal }[] = []
    for (const g of goals) {
      for (const t of g.tasks) {
        if (t.category_id === catId && !linkedIds.includes(t.id)) {
          result.push({ task: t, goal: g })
        }
      }
    }
    return result
  }

  // Built-in + custom categories in display order
  const DEADLINE_CAT: Category = { id: DEADLINE_CAT_ID, name: '데드라인', color: 'red' }
  const SCHEDULE_CAT: Category = { id: SCHEDULE_CAT_ID, name: '일정', color: 'blue' }
  const allCats: Category[] = [DEADLINE_CAT, SCHEDULE_CAT, ...categories]

  function submitAdd(catId: string) {
    const text = addText.trim()
    if (!text) { setAddingCatId(null); return }
    onAddTask(catId, text, catId === SCHEDULE_CAT_ID && addTime ? addTime : undefined)
    setAddText('')
    setAddTime('')
    setAddingCatId(null)
  }

  function handleQaTask() {
    if (!qaText.trim()) return
    // Add to first available category
    const cat = categories[0]
    if (cat) { onAddTask(cat.id, qaText.trim()) }
    setQaText('')
    setFabOpen(false)
  }

  const meta = entry.meta

  return (
    <div className="flex flex-col gap-3 pb-32">
      {/* ── Date header ── */}
      <div className="flex items-center justify-between px-4 pt-4">
        <button
          onClick={() => onDateChange(formatDate(subDays(dateObj, 1)))}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[var(--surface-2)] active:bg-[var(--border)]"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-base font-bold">
            {formatDisplay(dateObj)}
            <span className="ml-1.5 text-[var(--text-3)] font-normal">({dayName})</span>
          </p>
          {todayStr && <p className="text-xs text-[var(--purple)] font-medium mt-0.5">{todayStr}</p>}
        </div>
        <button
          onClick={() => onDateChange(formatDate(addDaysFns(dateObj, 1)))}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[var(--surface-2)] active:bg-[var(--border)]"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* ── Sleep / Condition / Focus ── */}
      <div className="mx-4 bg-white rounded-[14px] border border-[var(--border)] p-3">
        <div className="grid grid-cols-3 gap-2">
          {/* Sleep */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1 text-[11px] text-[var(--text-3)]">
              <Moon size={11} /> 수면
            </div>
            <select
              value={meta.sleep ?? ''}
              onChange={e => onMetaChange({ sleep: e.target.value ? Number(e.target.value) : null })}
              className="w-full px-2 py-1 rounded-[8px] text-xs bg-[var(--surface-2)] outline-none appearance-none text-center"
            >
              <option value="">-</option>
              {SLEEP_OPTIONS.map(v => <option key={v} value={v}>{SLEEP_LABELS[v]}</option>)}
            </select>
          </div>
          {/* Condition */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1 text-[11px] text-[var(--text-3)]">
              <Zap size={11} /> 컨디션
            </div>
            <div className="flex justify-center gap-0.5">
              {SCORE_OPTIONS.map(n => (
                <button key={n} onClick={() => onMetaChange({ condition: meta.condition === n ? null : n })}
                  className={clsx('w-5 h-5 rounded-full text-[10px] font-bold transition-colors',
                    meta.condition === n ? 'bg-[var(--amber)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-3)]')}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          {/* Focus */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1 text-[11px] text-[var(--text-3)]">
              <Brain size={11} /> 집중도
            </div>
            <div className="flex justify-center gap-0.5">
              {SCORE_OPTIONS.map(n => (
                <button key={n} onClick={() => onMetaChange({ focus: meta.focus === n ? null : n })}
                  className={clsx('w-5 h-5 rounded-full text-[10px] font-bold transition-colors',
                    meta.focus === n ? 'bg-[var(--teal)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-3)]')}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Routines ── */}
      {activeRoutines.length > 0 && (
        <div className="mx-4 bg-white rounded-[14px] border border-[var(--border)] p-3">
          <p className="text-xs font-semibold text-[var(--text-2)] mb-2">루틴</p>
          <div className="flex flex-col gap-1">
            {activeRoutines.map(r => {
              const done = !!logs.find(l => l.routine_id === r.id && l.date === date && l.done)
              const streak = calcStreak(r.id, date, logs)
              return (
                <button key={r.id}
                  onClick={() => onToggleRoutine(r.id, date)}
                  className={clsx(
                    'flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] transition-all text-left',
                    done ? 'bg-[var(--teal-bg)]' : 'bg-[var(--surface-2)]',
                  )}>
                  <div className={clsx(
                    'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                    done ? 'bg-[var(--teal)] text-white' : 'border-2 border-[var(--border-strong)]',
                  )}>
                    {done && <Check size={11} strokeWidth={3} />}
                  </div>
                  <span className={clsx('flex-1 text-sm', done ? 'line-through text-[var(--text-3)]' : 'text-[var(--text)]')}>
                    {r.name}
                  </span>
                  {streak > 0 && (
                    <span className="text-[10px] text-[var(--teal-text)] bg-[var(--teal-bg)] px-1.5 py-0.5 rounded-full font-medium">
                      🔥{streak}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Task categories ── */}
      {allCats.map(cat => {
        const catTasks = entry.tasks.filter(t => t.category_id === cat.id)
        const linkedCatTasks = linkedGoalTasks.filter(({ task }) => task.category_id === cat.id)
        const availableImports = getAvailableForImport(cat.id)
        const isAdding = addingCatId === cat.id
        const isPicking = importPickerCatId === cat.id

        if (catTasks.length === 0 && linkedCatTasks.length === 0 && !isAdding && !isPicking) {
          // Still show a minimal card so user can add
        }

        return (
          <div key={cat.id} className="mx-4 bg-white rounded-[14px] border border-[var(--border)]">
            {/* Category header */}
            <div className={clsx('flex items-center justify-between px-3 py-2 rounded-t-[14px]', `cat-${cat.color}`)}>
              <span className="text-xs font-semibold">{cat.name}</span>
              <div className="flex items-center gap-1">
                {availableImports.length > 0 && (
                  <button
                    onClick={() => setImportPickerCatId(isPicking ? null : cat.id)}
                    className="text-[10px] opacity-70 hover:opacity-100 px-1.5 py-0.5 rounded bg-white/30 font-medium"
                  >
                    불러오기
                  </button>
                )}
                <button
                  onClick={() => { setAddingCatId(isAdding ? null : cat.id); setAddText(''); setAddTime('') }}
                  className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/40"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>

            {/* Import picker */}
            {isPicking && availableImports.length > 0 && (
              <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--teal-bg)]">
                <p className="text-[10px] text-[var(--teal-text)] font-semibold mb-1.5">단기 목표에서 불러오기</p>
                {availableImports.map(({ task, goal }) => (
                  <button key={task.id}
                    onClick={() => { onLinkGoalTask(task.id); setImportPickerCatId(null) }}
                    className="flex items-start gap-2 w-full text-left py-1.5 px-2 rounded-[8px] hover:bg-[var(--teal-bg)] group">
                    <span className="text-xs flex-1 text-[var(--text)]">{task.text}</span>
                    <span className="text-[10px] text-[var(--teal-text)] shrink-0">{goal.title}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Linked goal tasks */}
            {linkedCatTasks.map(({ task, goal }) => (
              <div key={task.id}
                className="flex items-start gap-2.5 px-3 py-2.5 border-l-2 border-[var(--teal)] border-b border-b-[var(--border)]">
                <button
                  onClick={() => onToggleLinkedTask(goal.id, task.id)}
                  className={clsx(
                    'w-4.5 h-4.5 mt-0.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
                    task.done ? 'bg-[var(--teal)] border-[var(--teal)]' : 'border-[var(--border-strong)]',
                  )}>
                  {task.done && <Check size={9} strokeWidth={3} className="text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={clsx('text-sm leading-snug', task.done && 'line-through text-[var(--text-3)]')}>
                    {task.text}
                  </p>
                  <p className="text-[10px] text-[var(--teal-text)] mt-0.5">{goal.title}</p>
                </div>
                <button onClick={() => onUnlinkGoalTask(task.id)} className="p-0.5 text-[var(--text-3)] hover:text-[var(--text-2)]">
                  <X size={12} />
                </button>
              </div>
            ))}

            {/* Regular tasks */}
            {catTasks.length === 0 && linkedCatTasks.length === 0 && !isAdding && (
              <div className="px-3 py-2">
                <p className="text-xs text-[var(--text-3)]">할 일이 없습니다</p>
              </div>
            )}
            {catTasks.map(task => (
              <div key={task.id} className="flex items-start gap-2.5 px-3 py-2.5 border-b border-[var(--border)] last:border-b-0 group">
                <button
                  onClick={() => onToggleTask(task.id)}
                  className={clsx(
                    'w-4.5 h-4.5 mt-0.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
                    task.done ? 'bg-[var(--purple)] border-[var(--purple)]' : 'border-[var(--border-strong)]',
                  )}>
                  {task.done && <Check size={9} strokeWidth={3} className="text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  {task.time && <p className="text-[10px] text-[var(--text-3)] mb-0.5">{task.time}</p>}
                  <p className={clsx('text-sm leading-snug', task.done && 'line-through text-[var(--text-3)]')}>
                    {task.text}
                  </p>
                </div>
                <button
                  onClick={() => onDeleteTask(task.id)}
                  className="p-0.5 text-[var(--text-3)] opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            ))}

            {/* Add input */}
            {isAdding && (
              <div className="px-3 py-2.5 border-t border-[var(--border)]">
                {cat.id === SCHEDULE_CAT_ID && (
                  <input
                    type="time"
                    value={addTime}
                    onChange={e => setAddTime(e.target.value)}
                    className="w-full px-2 py-1 rounded-[8px] text-xs bg-[var(--surface-2)] outline-none mb-1.5"
                  />
                )}
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={addText}
                    onChange={e => setAddText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') submitAdd(cat.id); if (e.key === 'Escape') { setAddingCatId(null); setAddText('') } }}
                    placeholder="할 일 입력..."
                    className="flex-1 px-2.5 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none"
                  />
                  <button onClick={() => submitAdd(cat.id)}
                    className="px-3 py-1.5 rounded-[8px] text-sm font-medium text-white bg-[var(--purple)]">
                    추가
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* ── FAB ── */}
      <div className="fixed bottom-20 right-4 z-30 flex flex-col items-end gap-2">
        {fabOpen && (
          <div className="w-72 bg-white border border-[var(--border)] rounded-[16px] shadow-xl p-4 flex flex-col gap-3 mb-1">
            <div className="flex items-center justify-between">
              <div className="flex gap-1 bg-[var(--surface-2)] rounded-[8px] p-0.5">
                <button onClick={() => setFabMode('task')}
                  className={clsx('px-3 py-1 rounded-[6px] text-xs font-medium transition-all',
                    fabMode === 'task' ? 'bg-white text-[var(--text)] shadow-sm' : 'text-[var(--text-3)]')}>
                  할 일
                </button>
                <button onClick={() => setFabMode('goal')}
                  className={clsx('px-3 py-1 rounded-[6px] text-xs font-medium transition-all',
                    fabMode === 'goal' ? 'bg-white text-[var(--text)] shadow-sm' : 'text-[var(--text-3)]')}>
                  단기 목표
                </button>
              </div>
              <button onClick={() => setFabOpen(false)}
                className="w-6 h-6 flex items-center justify-center text-[var(--text-3)] hover:bg-[var(--surface-2)] rounded-[6px]">
                <X size={14} />
              </button>
            </div>
            {fabMode === 'task' ? (
              <div className="flex gap-2">
                <input value={qaText} onChange={e => setQaText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleQaTask() }}
                  placeholder="할 일 입력..." autoFocus
                  className="flex-1 px-2.5 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none" />
                <button onClick={handleQaTask}
                  className="px-3 py-1.5 rounded-[8px] text-sm font-medium text-white bg-[var(--purple)]">
                  추가
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input value={qaGoalTitle} onChange={e => setQaGoalTitle(e.target.value)}
                  placeholder="목표 제목" autoFocus
                  className="w-full px-2.5 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={qaGoalFrom} onChange={e => setQaGoalFrom(e.target.value)}
                    className="px-2 py-1.5 rounded-[8px] text-xs bg-[var(--surface-2)] outline-none" />
                  <input type="date" value={qaGoalTo} onChange={e => setQaGoalTo(e.target.value)}
                    className="px-2 py-1.5 rounded-[8px] text-xs bg-[var(--surface-2)] outline-none" />
                </div>
                <p className="text-[10px] text-[var(--text-3)]">목표 생성은 주간 탭에서 할 수 있어요</p>
              </div>
            )}
          </div>
        )}
        <button onClick={() => setFabOpen(v => !v)}
          className={clsx(
            'w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg transition-transform active:scale-95',
            fabOpen ? 'bg-[var(--text-2)]' : 'bg-[var(--purple)]',
          )}>
          {fabOpen ? <X size={20} /> : <Plus size={22} />}
        </button>
      </div>
    </div>
  )
}
