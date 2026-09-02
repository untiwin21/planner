from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'marker not found in {path}: {old[:100]!r}')
    p.write_text(s.replace(old, new, 1))

# -----------------------------------------------------------------------------
# types: persistent per-task decision / execution history
# -----------------------------------------------------------------------------
replace_once(
    'src/types.ts',
    "export interface Task {\n",
    """export type TaskHistoryKind =
  | 'created'
  | 'edited'
  | 'planned'
  | 'rescheduled'
  | 'unplanned'
  | 'completed'
  | 'reopened'
  | 'discarded'
  | 'restored'
  | 'deleted'
  | 'actual_recorded'
  | 'focus_session'

export interface TaskHistoryEvent {
  id: string
  at: string
  kind: TaskHistoryKind
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  note?: string
}

export interface Task {
""",
)
replace_once(
    'src/types.ts',
    "  subtasks?: SubTask[]\n  // Last-write-wins timestamp",
    "  subtasks?: SubTask[]\n  /** Persistent audit trail used by AI feedback to reconstruct plan changes. */\n  history?: TaskHistoryEvent[]\n  // Last-write-wins timestamp",
)

# -----------------------------------------------------------------------------
# overlap: use a small epsilon so touching blocks never become false overlaps
# -----------------------------------------------------------------------------
replace_once(
    'src/components/today/TimelineOverlapLayout.tsx',
    "const COMPACT_BLOCK_MIN_HEIGHT_PX = 20\n",
    "const COMPACT_BLOCK_MIN_HEIGHT_PX = 20\nconst OVERLAP_EPSILON_PERCENT = (0.5 / TIMELINE_MINUTES) * 100\n",
)
replace_once(
    'src/components/today/TimelineOverlapLayout.tsx',
    "if (cluster.length > 0 && block.start >= clusterEnd) {",
    "if (cluster.length > 0 && block.start + OVERLAP_EPSILON_PERCENT >= clusterEnd) {",
)
replace_once(
    'src/components/today/TimelineOverlapLayout.tsx',
    "let column = columnEnds.findIndex(end => end <= block.start)",
    "let column = columnEnds.findIndex(end => end <= block.start + OVERLAP_EPSILON_PERCENT)",
)

# -----------------------------------------------------------------------------
# store: append meaningful task history, cascade category edits, stable reordering
# -----------------------------------------------------------------------------
replace_once(
    'src/hooks/usePlanrStore.ts',
    "import type { DayEntry, ShortGoal, Routine, RoutineConfig, RoutineLog, RoutineLogPatch, Category, Task, DayMeta, LongGoal, RoutineStatus, NoteEntry, JournalEntry, RoutinePeriod, TaskScheduleInput } from '@/types'",
    "import type { DayEntry, ShortGoal, Routine, RoutineConfig, RoutineLog, RoutineLogPatch, Category, Task, TaskHistoryKind, DayMeta, LongGoal, RoutineStatus, NoteEntry, JournalEntry, RoutinePeriod, TaskScheduleInput } from '@/types'",
)
replace_once(
    'src/hooks/usePlanrStore.ts',
    "function uid() { return Math.random().toString(36).slice(2, 10) }\nfunction now() { return Date.now() }\n",
    """function uid() { return Math.random().toString(36).slice(2, 10) }
function now() { return Date.now() }

function taskAuditState(task: Task): Record<string, unknown> {
  return {
    text: task.text,
    category: task.category_name,
    category_id: task.category_id,
    done: task.done,
    discarded: !!task.discarded,
    fixed: !!task.fixed,
    schedule_type: task.schedule_type,
    planned_start: task.start_time ?? task.time,
    planned_end: task.end_time,
    estimated_min: task.duration_min,
    actual_start: task.actual_start_time,
    actual_end: task.actual_end_time,
    actual_min: task.actual_duration_min,
    actual_sessions: task.actual_sessions?.length ?? 0,
    progress_current: task.progress_current,
    progress_target: task.progress_target,
    progress_unit: task.progress_unit,
    subtasks: (task.subtasks ?? []).map(subtask => ({
      id: subtask.id,
      text: subtask.text,
      done: subtask.done,
      discarded: !!subtask.discarded,
      planned_start: subtask.start_time,
      planned_end: subtask.end_time,
      estimated_min: subtask.duration_min,
      actual_start: subtask.actual_start_time,
      actual_end: subtask.actual_end_time,
    })),
  }
}

function taskMutationKind(before: Task, after: Task): TaskHistoryKind {
  if (!!before.discarded !== !!after.discarded) return after.discarded ? 'discarded' : 'restored'
  if (before.done !== after.done) return after.done ? 'completed' : 'reopened'
  const beforeStart = before.start_time ?? before.time
  const afterStart = after.start_time ?? after.time
  if (beforeStart !== afterStart || before.end_time !== after.end_time) {
    if (!beforeStart && afterStart) return 'planned'
    if (beforeStart && !afterStart) return 'unplanned'
    return 'rescheduled'
  }
  if (
    before.actual_start_time !== after.actual_start_time ||
    before.actual_end_time !== after.actual_end_time ||
    before.actual_duration_min !== after.actual_duration_min ||
    (before.actual_sessions?.length ?? 0) !== (after.actual_sessions?.length ?? 0)
  ) return 'actual_recorded'
  return 'edited'
}

function appendTaskHistory(task: Task, kind: TaskHistoryKind, before?: Task, note?: string): Task {
  const event = {
    id: `hist-${now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    kind,
    ...(before ? { before: taskAuditState(before) } : {}),
    after: taskAuditState(task),
    ...(note ? { note } : {}),
  }
  return { ...task, history: [...(task.history ?? []), event].slice(-160) }
}
""",
)
replace_once(
    'src/hooks/usePlanrStore.ts',
    """    const updatedTask: Task = {
      ...task,
      done: nextDone,
      discarded: false,
      ...(updatedSubtasks ? { subtasks: updatedSubtasks } : {}),
      ...(nextDone && task.progress_target
        ? { progress_current: task.progress_target }
        : !nextDone
          ? { progress_current: undefined, progress_target: undefined, progress_unit: undefined }
          : {}),
      updated_at: now(),
    }
""",
    """    const updatedTask = appendTaskHistory({
      ...task,
      done: nextDone,
      discarded: false,
      ...(updatedSubtasks ? { subtasks: updatedSubtasks } : {}),
      ...(nextDone && task.progress_target
        ? { progress_current: task.progress_target }
        : !nextDone
          ? { progress_current: undefined, progress_target: undefined, progress_unit: undefined }
          : {}),
      updated_at: now(),
    }, nextDone ? 'completed' : 'reopened', task)
""",
)
replace_once(
    'src/hooks/usePlanrStore.ts',
    """    const task: Task = {
      id: uid(), text, done: false,
      category_id: categoryId, day_id: entry.id,
      category_name: category.name, category_color: category.color,
      updated_at: now(),
      ...scheduleFields,
      ...(legacyTime ? { time: legacyTime } : {}),
      ...(categoryId === SCHEDULE_CAT_ID ? { fixed: true } : {}),
    }
""",
    """    const task = appendTaskHistory({
      id: uid(), text, done: false,
      category_id: categoryId, day_id: entry.id,
      category_name: category.name, category_color: category.color,
      updated_at: now(),
      ...scheduleFields,
      ...(legacyTime ? { time: legacyTime } : {}),
      ...(categoryId === SCHEDULE_CAT_ID ? { fixed: true } : {}),
    }, 'created')
""",
)
replace_once(
    'src/hooks/usePlanrStore.ts',
    "const tombstone: Task = { ...task, done: false, deleted_at: deletedAt, updated_at: deletedAt }",
    "const tombstone = appendTaskHistory({ ...task, done: false, deleted_at: deletedAt, updated_at: deletedAt }, 'deleted', task)",
)
replace_once(
    'src/hooks/usePlanrStore.ts',
    "const updated: Task = { ...task, ...patch, updated_at: now() }",
    "const nextTask: Task = { ...task, ...patch, updated_at: now() }\n    const updated = appendTaskHistory(nextTask, taskMutationKind(task, nextTask), task)",
)
replace_once(
    'src/hooks/usePlanrStore.ts',
    """  function updateGlobalCategory(id: string, patch: Partial<Omit<Category, 'id'>>) {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }
""",
    """  function updateGlobalCategory(id: string, patch: Partial<Omit<Category, 'id'>>) {
    const current = categoriesRef.current.find(category => category.id === id)
    if (!current) return
    const updated = { ...current, ...patch }
    setCategories(prev => prev.map(category => category.id === id ? updated : category))

    // Tasks cache their category label/color for historical rendering. Keep those
    // embedded values aligned with the global category so edits are visible everywhere.
    for (const day of daysRef.current) {
      for (const task of day.tasks.filter(item => item.category_id === id)) {
        updateTask(day.date, task.id, { category_name: updated.name, category_color: updated.color })
      }
    }
    for (const goal of goalsRef.current) {
      for (const task of goal.tasks.filter(item => item.category_id === id)) {
        updateGoalTask(goal.id, task.id, { category_name: updated.name, category_color: updated.color })
      }
    }
  }
""",
)
replace_once(
    'src/hooks/usePlanrStore.ts',
    """      // Reorder is a meta-level change; bump meta.updated_at.
      updatedEntry = { ...d, tasks: [...rest, ...reordered], meta: { ...d.meta, updated_at: now() } }
""",
    """      // Preserve positions of other categories while replacing this category's
      // slots with the new order. This keeps repeated reorders deterministic.
      let categoryCursor = 0
      const nextTasks = d.tasks.map(task => task.category_id === categoryId ? reordered[categoryCursor++] : task)
      updatedEntry = { ...d, tasks: nextTasks, meta: { ...d.meta, updated_at: now() } }
""",
)

# -----------------------------------------------------------------------------
# Today dashboard: category editing/reordering, task reordering, drag-out unplan
# -----------------------------------------------------------------------------
replace_once(
    'src/components/today/TodayDashboard.tsx',
    "  onDeleteCategory?: (categoryId: string) => void\n",
    "  onDeleteCategory?: (categoryId: string) => void\n  onUpdateCategory?: (categoryId: string, patch: Partial<Omit<Category, 'id'>>) => void\n  onReorderCategory?: (draggedId: string, targetId: string) => void\n  onReorderTask?: (categoryId: string, draggedId: string, targetId: string) => void\n",
)
replace_once(
    'src/components/today/TodayDashboard.tsx',
    "  onDeleteCategory,\n  onToggleRoutine,",
    "  onDeleteCategory,\n  onUpdateCategory,\n  onReorderCategory,\n  onReorderTask,\n  onToggleRoutine,",
)
replace_once(
    'src/components/today/TodayDashboard.tsx',
    "  const [newCategoryColor, setNewCategoryColor] = useState<BadgeColor>('purple')\n",
    """  const [newCategoryColor, setNewCategoryColor] = useState<BadgeColor>('purple')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [editingCategoryColor, setEditingCategoryColor] = useState<BadgeColor>('purple')
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null)
""",
)
replace_once(
    'src/components/today/TodayDashboard.tsx',
    "  const pointerTaskIdRef = useRef<string | null>(null)\n",
    "  const pointerTaskIdRef = useRef<string | null>(null)\n  const timelineDropHandledRef = useRef(false)\n",
)
replace_once(
    'src/components/today/TodayDashboard.tsx',
    """  function addCategory() {
    const name = newCategoryName.trim()
    if (!name || !onAddCategory) return
    onAddCategory({ name, color: newCategoryColor })
    setNewCategoryName('')
    setShowCategoryForm(false)
  }
""",
    """  function addCategory() {
    const name = newCategoryName.trim()
    if (!name || !onAddCategory) return
    onAddCategory({ name, color: newCategoryColor })
    setNewCategoryName('')
    setShowCategoryForm(false)
  }

  function beginCategoryEdit(category: Category) {
    setEditingCategoryId(category.id)
    setEditingCategoryName(category.name)
    setEditingCategoryColor(category.color)
  }

  function saveCategoryEdit() {
    if (!editingCategoryId || !editingCategoryName.trim() || !onUpdateCategory) return
    onUpdateCategory(editingCategoryId, { name: editingCategoryName.trim(), color: editingCategoryColor })
    setEditingCategoryId(null)
  }
""",
)
replace_once(
    'src/components/today/TodayDashboard.tsx',
    """  function placeTimelineItem(token: string, minute: number, side: TimelineSide) {
    if (side === 'actual') placeActualItem(token, minute)
    else placePlanItem(token, minute)
  }
""",
    """  function placeTimelineItem(token: string, minute: number, side: TimelineSide) {
    if (side === 'actual') placeActualItem(token, minute)
    else placePlanItem(token, minute)
  }

  function removePlanPlacement(token: string) {
    if (token.startsWith('subtask:')) {
      const [, taskId, subtaskId] = token.split(':')
      const task = entry.tasks.find(item => item.id === taskId)
      if (!task) return
      onUpdateTask(taskId, {
        subtasks: (task.subtasks ?? []).map(subtask => subtask.id === subtaskId
          ? { ...subtask, start_time: undefined, end_time: undefined, updated_at: Date.now() }
          : subtask),
      })
      return
    }
    if (!token.startsWith('task:')) return
    const taskId = token.slice(5)
    const task = entry.tasks.find(item => item.id === taskId)
    if (!task || isFixedTask(task)) return
    onUpdateTask(taskId, { start_time: undefined, end_time: undefined, time: undefined })
  }
""",
)
replace_once(
    'src/components/today/TodayDashboard.tsx',
    """              onDrop={event => {
                event.preventDefault()
                const taskId = draggedTaskId ?? event.dataTransfer.getData('text/plain')
                const rect = event.currentTarget.getBoundingClientRect()
                const side: TimelineSide = event.clientX >= rect.left + rect.width / 2 ? 'actual' : 'plan'
                if (taskId) placeTimelineItem(taskId, timelineMinuteFromPointer(event.clientY, event.currentTarget), side)
              }}
""",
    """              onDrop={event => {
                event.preventDefault()
                const taskId = draggedTaskId ?? event.dataTransfer.getData('text/plain')
                const rect = event.currentTarget.getBoundingClientRect()
                const side: TimelineSide = event.clientX >= rect.left + rect.width / 2 ? 'actual' : 'plan'
                timelineDropHandledRef.current = true
                if (taskId) placeTimelineItem(taskId, timelineMinuteFromPointer(event.clientY, event.currentTarget), side)
              }}
""",
)
replace_once(
    'src/components/today/TodayDashboard.tsx',
    """                    onDragStart={event => {
                      if (done) return
                      setDraggedTaskId(token)
                      event.dataTransfer.setData('text/plain', token)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => { setDraggedTaskId(null); setDragPreviewMinute(null) }}
""",
    """                    onDragStart={event => {
                      if (done) return
                      timelineDropHandledRef.current = false
                      setDraggedTaskId(token)
                      event.dataTransfer.setData('text/plain', token)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => {
                      if (!timelineDropHandledRef.current && !fixed) removePlanPlacement(token)
                      timelineDropHandledRef.current = false
                      setDraggedTaskId(null)
                      setDragPreviewMinute(null)
                    }}
""",
)
# Inline category manager
replace_once(
    'src/components/today/TodayDashboard.tsx',
    """                      {selectableCategories.map(category => (
                        <div key={category.id} className=\"flex items-center gap-1 group\">
                          <button type=\"button\" onClick={() => { setCategoryId(category.id); setShowCategories(false) }} className=\"flex-1 px-2 py-2 rounded-[8px] hover:bg-[var(--surface-2)] text-sm text-left flex items-center gap-2\">
                            <CategoryDot color={category.color} /> {category.name}
                          </button>
                          {onDeleteCategory && selectableCategories.length > 1 && (
                            <button type=\"button\" aria-label={`${category.name} 삭제`} onClick={() => onDeleteCategory(category.id)} className=\"w-7 h-7 rounded-[7px] text-[var(--text-3)] opacity-0 group-hover:opacity-100 hover:text-[var(--red)] hover:bg-[var(--red-bg)] flex items-center justify-center\"><Trash2 size={12} /></button>
                          )}
                        </div>
                      ))}
""",
    """                      {selectableCategories.map(category => (
                        <div
                          key={category.id}
                          draggable={Boolean(onReorderCategory) && editingCategoryId !== category.id}
                          onDragStart={() => setDraggedCategoryId(category.id)}
                          onDragOver={event => { if (draggedCategoryId && draggedCategoryId !== category.id) event.preventDefault() }}
                          onDrop={event => {
                            event.preventDefault()
                            if (draggedCategoryId && draggedCategoryId !== category.id) onReorderCategory?.(draggedCategoryId, category.id)
                            setDraggedCategoryId(null)
                          }}
                          onDragEnd={() => setDraggedCategoryId(null)}
                          className={clsx('group rounded-[8px]', draggedCategoryId === category.id && 'opacity-45')}
                        >
                          {editingCategoryId === category.id ? (
                            <div className=\"rounded-[9px] bg-[var(--surface-2)] p-2\">
                              <input autoFocus value={editingCategoryName} onChange={event => setEditingCategoryName(event.target.value)} onKeyDown={event => event.key === 'Enter' && saveCategoryEdit()} className=\"w-full rounded-[7px] bg-white px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[var(--purple)]\" />
                              <div className=\"mt-2 flex items-center gap-1\">
                                {CATEGORY_COLORS.map(color => <button type=\"button\" key={color} aria-label={color} onClick={() => setEditingCategoryColor(color)} className={clsx(`h-4 w-4 rounded-full cat-${color}`, editingCategoryColor === color && 'ring-2 ring-[var(--purple)] ring-offset-1')} />)}
                                <button type=\"button\" onClick={saveCategoryEdit} className=\"ml-auto flex h-6 w-6 items-center justify-center rounded-[6px] bg-[var(--purple)] text-white\"><Check size={11} /></button>
                                <button type=\"button\" onClick={() => setEditingCategoryId(null)} className=\"flex h-6 w-6 items-center justify-center rounded-[6px] text-[var(--text-3)] hover:bg-white\"><X size={11} /></button>
                              </div>
                            </div>
                          ) : (
                            <div className=\"flex items-center gap-1\">
                              {onReorderCategory && <span className=\"flex h-7 w-5 cursor-grab items-center justify-center text-[var(--text-3)] opacity-50\"><GripVertical size={12} /></span>}
                              <button type=\"button\" onClick={() => { setCategoryId(category.id); setShowCategories(false) }} className=\"flex-1 px-1.5 py-2 rounded-[8px] hover:bg-[var(--surface-2)] text-sm text-left flex items-center gap-2\">
                                <CategoryDot color={category.color} /> <span className=\"truncate\">{category.name}</span>
                              </button>
                              {onUpdateCategory && <button type=\"button\" aria-label={`${category.name} 수정`} onClick={() => beginCategoryEdit(category)} className=\"w-7 h-7 rounded-[7px] text-[var(--text-3)] opacity-0 group-hover:opacity-100 hover:text-[var(--purple)] hover:bg-[var(--purple-bg)] flex items-center justify-center\"><Pencil size={12} /></button>}
                              {onDeleteCategory && selectableCategories.length > 1 && (
                                <button type=\"button\" aria-label={`${category.name} 삭제`} onClick={() => onDeleteCategory(category.id)} className=\"w-7 h-7 rounded-[7px] text-[var(--text-3)] opacity-0 group-hover:opacity-100 hover:text-[var(--red)] hover:bg-[var(--red-bg)] flex items-center justify-center\"><Trash2 size={12} /></button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
""",
)
# Task card accepts the same drag token for within-category ordering.
replace_once(
    'src/components/today/TodayDashboard.tsx',
    """                    <div
                      key={task.id}
                      className={clsx('rounded-[12px] border px-3 py-2.5 group', task.discarded ? 'border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] opacity-65' : task.done ? 'bg-[var(--surface-2)] border-transparent opacity-60' : isPartial ? 'bg-[var(--amber-bg)]/45 border-amber-200' : 'bg-white border-[var(--border)]', draggedTaskId === token && 'opacity-50 ring-2 ring-[var(--purple)]')}
                    >
""",
    """                    <div
                      key={task.id}
                      onDragOver={event => {
                        if (!onReorderTask || !draggedTaskId?.startsWith('task:') || draggedTaskId === token) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={event => {
                        const source = draggedTaskId ?? event.dataTransfer.getData('text/plain')
                        if (!onReorderTask || !source.startsWith('task:') || source === token) return
                        event.preventDefault()
                        onReorderTask(category.id, source.slice(5), task.id)
                        setDraggedTaskId(null)
                      }}
                      className={clsx('rounded-[12px] border px-3 py-2.5 group', task.discarded ? 'border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] opacity-65' : task.done ? 'bg-[var(--surface-2)] border-transparent opacity-60' : isPartial ? 'bg-[var(--amber-bg)]/45 border-amber-200' : 'bg-white border-[var(--border)]', draggedTaskId === token && 'opacity-50 ring-2 ring-[var(--purple)]')}
                    >
""",
)
replace_once(
    'src/components/today/TodayDashboard.tsx',
    "카테고리별로 모아보고, 드래그해 왼쪽 타임라인에 배치하세요.",
    "카테고리 안에서는 드래그로 순서를 바꾸고, 왼쪽 타임라인에 놓으면 시간을 배치할 수 있습니다.",
)

# -----------------------------------------------------------------------------
# page: wire the store capabilities into TodayDashboard
# -----------------------------------------------------------------------------
replace_once(
    'src/app/page.tsx',
    """                    onAddCategory={store.addGlobalCategory}
                    onDeleteCategory={store.deleteGlobalCategory}
""",
    """                    onAddCategory={store.addGlobalCategory}
                    onDeleteCategory={store.deleteGlobalCategory}
                    onUpdateCategory={store.updateGlobalCategory}
                    onReorderCategory={store.reorderCategory}
                    onReorderTask={(categoryId, draggedId, targetId) => store.reorderDayTasks(selectedDate, categoryId, draggedId, targetId)}
""",
)

# -----------------------------------------------------------------------------
# focus stopwatch: history event for exact focus sessions
# -----------------------------------------------------------------------------
replace_once(
    'src/components/today/TaskExecutionLayer.tsx',
    "import type { DayEntry, FocusSessionRecord, SubTask, Task } from '@/types'",
    "import type { DayEntry, FocusSessionRecord, SubTask, Task, TaskHistoryEvent } from '@/types'",
)
replace_once(
    'src/components/today/TaskExecutionLayer.tsx',
    """      const updatedTask: FocusTask = {
        ...task,
        actual_start_time: firstSession ? wallClock(new Date(firstSession.started_at).getTime()) : wallClock(session.firstStartedAt),
        actual_end_time: lastSession ? wallClock(new Date(lastSession.ended_at).getTime()) : wallClock(finishedAt),
        actual_status: 'recorded',
        actual_duration_min: totalMinutes,
        actual_sessions: sessions,
        updated_at: Date.now(),
      }
""",
    """      const historyEvent: TaskHistoryEvent = {
        id: uid(),
        at: new Date(finishedAt).toISOString(),
        kind: 'focus_session',
        before: {
          actual_min: previousMinutes,
          sessions: task.actual_sessions?.length ?? 0,
        },
        after: {
          actual_min: totalMinutes,
          sessions: sessions.length,
          added_sessions: newSessions.map(item => ({ started_at: item.started_at, ended_at: item.ended_at, duration_min: item.duration_min })),
        },
        note: `Focus Mode에서 ${Math.round(activeMinutes)}분 기록`,
      }
      const updatedTask: FocusTask = {
        ...task,
        actual_start_time: firstSession ? wallClock(new Date(firstSession.started_at).getTime()) : wallClock(session.firstStartedAt),
        actual_end_time: lastSession ? wallClock(new Date(lastSession.ended_at).getTime()) : wallClock(finishedAt),
        actual_status: 'recorded',
        actual_duration_min: totalMinutes,
        actual_sessions: sessions,
        history: [...(task.history ?? []), historyEvent].slice(-160),
        updated_at: Date.now(),
      }
""",
)

# -----------------------------------------------------------------------------
# AI export: include tombstones, exact sessions, plan history and side-by-side timeline
# -----------------------------------------------------------------------------
replace_once(
    'src/lib/aiExport.ts',
    "import type { DayEntry, LongGoal, Routine, RoutineLog, ShortGoal, Task } from '@/types'",
    "import type { DayEntry, FocusSessionRecord, LongGoal, Routine, RoutineLog, ShortGoal, Task, TaskHistoryEvent } from '@/types'",
)
replace_once(
    'src/lib/aiExport.ts',
    """  progress?: string
}
""",
    """  progress?: string
  deleted: boolean
  actual_sessions: Array<{ started_at: string; ended_at: string; duration_min: number; source: string }>
}

interface AiTaskHistoryRecord extends TaskHistoryEvent {
  date: string
  task_id: string
  task_text: string
}

interface AiTimelineBlock {
  task_id: string
  text: string
  category: string
  start: string
  end: string
  duration_min: number | null
  source: 'plan' | 'actual' | 'focus'
}

interface AiTimelineDay {
  date: string
  planned: AiTimelineBlock[]
  actual: AiTimelineBlock[]
}
""",
)
replace_once(
    'src/lib/aiExport.ts',
    """  behavior_system: BehaviorSystem | null
  recent_reviews: Array<{ key: string; content: string }>
}
""",
    """  behavior_system: BehaviorSystem | null
  task_history: AiTaskHistoryRecord[]
  timeline: AiTimelineDay[]
  recent_reviews: Array<{ key: string; content: string }>
}
""",
)
# Helpers for next-day labels
replace_once(
    'src/lib/aiExport.ts',
    """function taskProgressLabel(task: Task): string | undefined {
  if (typeof task.progress_target !== 'number') return undefined
  return `${task.progress_current ?? 0}/${task.progress_target}${task.progress_unit ? ` ${task.progress_unit}` : ''}`
}
""",
    """function taskProgressLabel(task: Task): string | undefined {
  if (typeof task.progress_target !== 'number') return undefined
  return `${task.progress_current ?? 0}/${task.progress_target}${task.progress_unit ? ` ${task.progress_unit}` : ''}`
}

function clockLabelFromMinute(minute: number): string {
  const normalized = ((minute % (24 * 60)) + 24 * 60) % (24 * 60)
  const hh = String(Math.floor(normalized / 60)).padStart(2, '0')
  const mm = String(Math.round(normalized % 60)).padStart(2, '0')
  return `${minute >= 24 * 60 ? '다음날 ' : ''}${hh}:${mm}`
}

function plannedRange(task: Task) {
  const startText = task.start_time ?? task.time
  if (!startText) return null
  const [h, m] = startText.split(':').map(Number)
  if (![h, m].every(Number.isFinite)) return null
  let start = h * 60 + m
  if (start < 5 * 60) start += 24 * 60
  let duration = taskEstimatedMinutes(task) ?? 0
  let end = start + duration
  if (task.end_time) {
    const [eh, em] = task.end_time.split(':').map(Number)
    if ([eh, em].every(Number.isFinite)) {
      end = eh * 60 + em
      if (end < 5 * 60) end += 24 * 60
      if (end <= start) end += 24 * 60
      duration = end - start
    }
  }
  return { start, end, duration }
}

function localSessionLabel(iso: string, plannerDate: string) {
  const value = new Date(iso)
  if (Number.isNaN(value.getTime())) return iso
  const time = `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
  const date = localDateString(value)
  if (date === plannerDate) return time
  const next = localDateString(addLocalDays(new Date(`${plannerDate}T12:00:00`), 1))
  if (date === next) return `다음날 ${time}`
  return `${date} ${time}`
}
""",
)
# Task records include tombstones and sessions.
replace_once(
    'src/lib/aiExport.ts',
    """  const taskRecords: AiTaskRecord[] = selectedDays.flatMap(day =>
    (day.tasks ?? []).filter(task => !task.deleted_at).map(task => {
""",
    """  const taskRecords: AiTaskRecord[] = selectedDays.flatMap(day =>
    [...(day.tasks ?? []), ...(day.task_tombstones ?? [])].map(task => {
""",
)
replace_once(
    'src/lib/aiExport.ts',
    """        actual_min: actual,
        progress: taskProgressLabel(task),
      }
""",
    """        actual_min: actual,
        progress: taskProgressLabel(task),
        deleted: !!task.deleted_at,
        actual_sessions: (task.actual_sessions ?? []).map(session => ({
          started_at: session.started_at,
          ended_at: session.ended_at,
          duration_min: session.duration_min,
          source: session.source,
        })),
      }
""",
)
# Insert history/timeline construction before routines.
replace_once(
    'src/lib/aiExport.ts',
    """  const routines: AiRoutineRecord[] = source.routines
""",
    """  const taskHistory: AiTaskHistoryRecord[] = selectedDays.flatMap(day =>
    [...(day.tasks ?? []), ...(day.task_tombstones ?? [])].flatMap(task =>
      (task.history ?? []).map(event => ({ ...event, date: day.date, task_id: task.id, task_text: task.text })),
    ),
  ).sort((a, b) => a.at.localeCompare(b.at))

  const timeline: AiTimelineDay[] = selectedDays.map(day => {
    const planned: AiTimelineBlock[] = []
    const actual: AiTimelineBlock[] = []
    for (const task of day.tasks ?? []) {
      if (task.deleted_at || task.discarded) continue
      const plan = plannedRange(task)
      if (plan) planned.push({
        task_id: task.id,
        text: task.text,
        category: task.category_name,
        start: clockLabelFromMinute(plan.start),
        end: clockLabelFromMinute(plan.end),
        duration_min: Math.round(plan.duration),
        source: 'plan',
      })
      if ((task.actual_sessions ?? []).length > 0) {
        for (const session of task.actual_sessions ?? []) {
          actual.push({
            task_id: task.id,
            text: task.text,
            category: task.category_name,
            start: localSessionLabel(session.started_at, day.date),
            end: localSessionLabel(session.ended_at, day.date),
            duration_min: Math.round(session.duration_min * 10) / 10,
            source: 'focus',
          })
        }
      } else if (task.actual_start_time && task.actual_end_time) {
        const duration = timeDiffMinutes(task.actual_start_time, task.actual_end_time)
        actual.push({
          task_id: task.id,
          text: task.text,
          category: task.category_name,
          start: task.actual_start_time,
          end: task.actual_end_time,
          duration_min: duration,
          source: 'actual',
        })
      }
    }
    return { date: day.date, planned, actual }
  })

  const routines: AiRoutineRecord[] = source.routines
""",
)
replace_once(
    'src/lib/aiExport.ts',
    """    behavior_system: behaviorSystem,
    recent_reviews: reviews,
""",
    """    behavior_system: behaviorSystem,
    task_history: taskHistory,
    timeline,
    recent_reviews: reviews,
""",
)
# CSV history/timeline rows before return.
replace_once(
    'src/lib/aiExport.ts',
    """  if (snapshot.behavior_system) {
    rows.push(['behavior_system', snapshot.meta.period_end, '', 'recovery_protocol', '', '', '', '', '', '', '', '', '', snapshot.behavior_system.resetRule ?? '', [snapshot.behavior_system.minimumRule, snapshot.behavior_system.selfTalk].filter(Boolean).join(' | ')])
  }

  return '\\uFEFF' + [columns, ...rows].map(row => row.map(csvEscape).join(',')).join('\\n')
""",
    """  if (snapshot.behavior_system) {
    rows.push(['behavior_system', snapshot.meta.period_end, '', 'recovery_protocol', '', '', '', '', '', '', '', '', '', snapshot.behavior_system.resetRule ?? '', [snapshot.behavior_system.minimumRule, snapshot.behavior_system.selfTalk].filter(Boolean).join(' | ')])
  }

  for (const event of snapshot.task_history) {
    rows.push(['task_history', event.date, event.task_id, event.task_text, event.kind, '', '', '', '', '', '', '', '', event.at, JSON.stringify({ before: event.before, after: event.after, note: event.note })])
  }
  for (const day of snapshot.timeline) {
    for (const block of [...day.planned, ...day.actual]) {
      rows.push(['timeline', day.date, block.task_id, block.text, block.source, block.category, block.start, block.end, block.source === 'plan' ? block.duration_min : '', block.source !== 'plan' ? block.start : '', block.source !== 'plan' ? block.end : '', block.source !== 'plan' ? block.duration_min : '', '', '', ''])
    }
  }

  return '\\uFEFF' + [columns, ...rows].map(row => row.map(csvEscape).join(',')).join('\\n')
""",
)
# Markdown richer chronology. Insert before recent reviews.
replace_once(
    'src/lib/aiExport.ts',
    """  if (snapshot.recent_reviews.length) {
    lines.push('')
    lines.push('## 8. 최근 회고')
""",
    """  lines.push('')
  lines.push('## 8. 계획 변경 / 의사결정 기록')
  if (snapshot.task_history.length === 0) {
    lines.push('- 변경 이력 없음 (이 기능 적용 이전 기록은 현재 상태만 제공됨)')
  } else {
    for (const event of snapshot.task_history) {
      const note = event.note ? ` · ${event.note}` : ''
      lines.push(`- ${event.at} · ${event.date} · ${event.kind} · ${event.task_text}${note}`)
      if (event.before || event.after) lines.push(`  - before: ${JSON.stringify(event.before ?? {})} / after: ${JSON.stringify(event.after ?? {})}`)
    }
  }

  lines.push('')
  lines.push('## 9. 계획 vs 실제 타임라인')
  for (const day of snapshot.timeline) {
    lines.push(`### ${day.date}`)
    lines.push('- 계획')
    if (day.planned.length === 0) lines.push('  - 시간 배치된 계획 없음')
    for (const block of day.planned) lines.push(`  - ${block.start}–${block.end} · [${block.category}] ${block.text} · ${block.duration_min ?? '-'}분`)
    lines.push('- 실제')
    if (day.actual.length === 0) lines.push('  - 실제 시간 기록 없음')
    for (const block of day.actual) lines.push(`  - ${block.start}–${block.end} · [${block.category}] ${block.text} · ${block.duration_min ?? '-'}분 · ${block.source}`)
  }

  if (snapshot.recent_reviews.length) {
    lines.push('')
    lines.push('## 10. 최근 회고')
""",
)
replace_once(
    'src/lib/aiExport.ts',
    "AI 피드백 시 권장 관점: 막연한 격려보다 데이터에 근거해 잘된 행동, 반복되는 실패 패턴, 계획-실행 오차, 회복력, 다음에 바꿀 수 있는 가장 작은 행동을 구체적으로 제시한다.",
    "AI 피드백 지침: 1) 계획 변경 이력을 시간순으로 복원해 처음 계획→재배치/취소→최종 실행을 설명한다. 2) 계획 타임라인과 실제 타임라인을 비교해 계획과 다르게 행동한 구간을 구체적으로 짚는다. 3) 실제 기록이 비어 있는 시간은 딴짓이라고 단정하지 말고 '미기록 시간'으로 표현한다. 4) 폐기/취소를 무조건 실패로 해석하지 말고 합리적 계획 수정인지 구분한다. 5) 막연한 격려보다 잘된 행동, 반복 패턴, 추정오차, 회복력, 다음에 바꿀 가장 작은 행동을 근거와 함께 제시한다.",
)

# -----------------------------------------------------------------------------
# Data panel: Today by default and clearer no-cost GPT feedback pack wording
# -----------------------------------------------------------------------------
replace_once(
    'src/components/settings/DataPanel.tsx',
    "const [range, setRange] = useState<AiExportRange>(7)",
    "const [range, setRange] = useState<AiExportRange>(1)",
)
replace_once(
    'src/components/settings/DataPanel.tsx',
    "`planr-ai-context-${rangeLabel(range)}-${todayStamp()}.md`",
    "`planr-gpt-feedback-${rangeLabel(range)}-${todayStamp()}.md`",
)
replace_once(
    'src/components/settings/DataPanel.tsx',
    "목표·정체성·루틴·컨디션·할 일·예상/실제 시간을 사람이 읽기 좋은 보고서로 정리합니다.",
    "현재 계획뿐 아니라 계획 변경·취소·재배치 이력, 포커스 세션, 계획/실제 타임라인까지 포함합니다. 파일을 GPT에 올리는 방식이라 별도 API 비용이 없습니다.",
)
replace_once(
    'src/components/settings/DataPanel.tsx',
    "GPT 보고서 .md",
    "GPT 피드백 팩 .md",
)

print('patched')
