from pathlib import Path

p = Path('src/lib/aiExport.ts')
s = p.read_text()

s = s.replace(
"import { isRoutineScheduledOn, routineConfig } from '@/lib/routineSchedule'\n",
"import { isRoutineScheduledOn, routineConfig } from '@/lib/routineSchedule'\nimport { isActualOnlyTask } from '@/lib/taskVisibility'\n",
1,
)

s = s.replace(
"  fixed: boolean\n  schedule_type?: string\n",
"  fixed: boolean\n  actual_only: boolean\n  schedule_type?: string\n",
1,
)

s = s.replace(
"  estimated_min: number\n  actual_min: number\n  estimation_ratio: number | null\n",
"  estimated_min: number\n  planned_actual_min: number\n  unplanned_actual_min: number\n  actual_min: number\n  actual_covered_min: number\n  estimation_ratio: number | null\n",
1,
)

s = s.replace(
"    estimated_task_min: number\n    actual_task_min: number\n    estimation_ratio: number | null\n",
"    estimated_task_min: number\n    planned_actual_task_min: number\n    unplanned_actual_task_min: number\n    actual_task_min: number\n    actual_covered_min: number\n    estimation_ratio: number | null\n",
1,
)

marker = """function taskProgressLabel(task: Task): string | undefined {
  if (typeof task.progress_target !== 'number') return undefined
  return `${task.progress_current ?? 0}/${task.progress_target}${task.progress_unit ? ` ${task.progress_unit}` : ''}`
}

"""
insert = marker + """function sleepHoursFromMinutes(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.round((value / 60) * 10) / 10
}

function plannerClockMinute(value?: string): number | null {
  if (!value) return null
  const [hour, minute] = value.split(':').map(Number)
  if (![hour, minute].every(Number.isFinite)) return null
  const raw = hour * 60 + minute
  return raw < 5 * 60 ? raw + 24 * 60 : raw
}

function taskActualIntervals(task: Task, plannerDate: string): Array<[number, number]> {
  const dayStart = 5 * 60
  const dayEnd = 29 * 60
  const intervals: Array<[number, number]> = []

  if ((task.actual_sessions ?? []).length > 0) {
    const base = new Date(`${plannerDate}T00:00:00`)
    for (const session of task.actual_sessions ?? []) {
      const started = new Date(session.started_at)
      const ended = new Date(session.ended_at)
      if (Number.isNaN(started.getTime())) continue
      const startRaw = (started.getTime() - base.getTime()) / 60_000
      const endRaw = Number.isNaN(ended.getTime())
        ? startRaw + session.duration_min
        : (ended.getTime() - base.getTime()) / 60_000
      const start = Math.max(dayStart, startRaw)
      const end = Math.min(dayEnd, endRaw)
      if (end > start) intervals.push([start, end])
    }
    return intervals
  }

  const start = plannerClockMinute(task.actual_start_time)
  const endClock = plannerClockMinute(task.actual_end_time)
  if (start === null || endClock === null) return intervals
  let end = endClock
  if (end <= start) end += 24 * 60
  const clippedStart = Math.max(dayStart, start)
  const clippedEnd = Math.min(dayEnd, end)
  if (clippedEnd > clippedStart) intervals.push([clippedStart, clippedEnd])
  return intervals
}

function uniqueActualCoveredMinutes(tasks: Task[], plannerDate: string): number {
  const intervals = tasks.flatMap(task => taskActualIntervals(task, plannerDate)).sort((a, b) => a[0] - b[0])
  if (!intervals.length) return 0
  let total = 0
  let [start, end] = intervals[0]
  for (const [nextStart, nextEnd] of intervals.slice(1)) {
    if (nextStart <= end) end = Math.max(end, nextEnd)
    else {
      total += end - start
      start = nextStart
      end = nextEnd
    }
  }
  return Math.round((total + end - start) * 10) / 10
}

"""
if marker not in s:
    raise SystemExit('taskProgressLabel marker not found')
s = s.replace(marker, insert, 1)

old_record = """      const estimated = taskEstimatedMinutes(task)
      const actual = taskActualMinutes(task)
      const goal = task.goal_id ? shortGoalMap.get(task.goal_id) : undefined
      return {
"""
new_record = """      const actualOnly = isActualOnlyTask(task)
      const estimated = taskEstimatedMinutes(task)
      const actual = taskActualMinutes(task)
      const goal = task.goal_id ? shortGoalMap.get(task.goal_id) : undefined
      return {
"""
if old_record not in s:
    raise SystemExit('task record marker not found')
s = s.replace(old_record, new_record, 1)
s = s.replace(
"        fixed: !!task.fixed,\n        schedule_type: task.schedule_type,\n",
"        fixed: !!task.fixed,\n        actual_only: actualOnly,\n        schedule_type: task.schedule_type,\n",
1,
)
s = s.replace("        estimated_min: estimated,\n", "        estimated_min: actualOnly ? null : estimated,\n", 1)

old_daily = """  const daily: AiDailyRecord[] = selectedDays.map(day => {
    const meaningfulTasks = (day.tasks ?? []).filter(task => !task.deleted_at && !task.discarded)
    const estimated = meaningfulTasks.map(taskEstimatedMinutes).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
    const actual = meaningfulTasks.map(taskActualMinutes).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
    const scheduledRoutines = source.routines.filter(routine => routine.status === 'active' && isRoutineScheduledOn(routine, day.date))
    const routineDone = scheduledRoutines.filter(routine => selectedLogs.some(log => log.routine_id === routine.id && log.date === day.date && log.done)).length
    return {
      date: day.date,
      sleep_hours: day.meta?.sleep ?? null,
      condition: day.meta?.condition ?? null,
      focus: day.meta?.focus ?? null,
      top3: day.meta?.top3 ?? [],
      note: day.note ?? '',
      tasks_total: meaningfulTasks.length,
      tasks_done: meaningfulTasks.filter(task => task.done).length,
      task_completion_pct: pct(meaningfulTasks.filter(task => task.done).length, meaningfulTasks.length),
      estimated_min: estimated,
      actual_min: actual,
      estimation_ratio: estimated > 0 && actual > 0 ? Math.round(actual / estimated * 100) / 100 : null,
      routines_scheduled: scheduledRoutines.length,
      routines_done: routineDone,
      routine_adherence_pct: pct(routineDone, scheduledRoutines.length),
    }
  })
"""
new_daily = """  const daily: AiDailyRecord[] = selectedDays.map(day => {
    const activeTasks = (day.tasks ?? []).filter(task => !task.deleted_at && !task.discarded)
    const plannedTasks = activeTasks.filter(task => !isActualOnlyTask(task))
    const actualOnlyTasks = activeTasks.filter(task => isActualOnlyTask(task))
    const estimated = plannedTasks.map(taskEstimatedMinutes).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
    const plannedActual = plannedTasks.map(taskActualMinutes).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
    const unplannedActual = actualOnlyTasks.map(taskActualMinutes).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
    const actual = plannedActual + unplannedActual
    const actualCovered = uniqueActualCoveredMinutes(activeTasks, day.date)
    const scheduledRoutines = source.routines.filter(routine => routine.status === 'active' && isRoutineScheduledOn(routine, day.date))
    const routineDone = scheduledRoutines.filter(routine => selectedLogs.some(log => log.routine_id === routine.id && log.date === day.date && log.done)).length
    return {
      date: day.date,
      sleep_hours: sleepHoursFromMinutes(day.meta?.sleep),
      condition: day.meta?.condition ?? null,
      focus: day.meta?.focus ?? null,
      top3: day.meta?.top3 ?? [],
      note: day.note ?? '',
      tasks_total: plannedTasks.length,
      tasks_done: plannedTasks.filter(task => task.done).length,
      task_completion_pct: pct(plannedTasks.filter(task => task.done).length, plannedTasks.length),
      estimated_min: estimated,
      planned_actual_min: plannedActual,
      unplanned_actual_min: unplannedActual,
      actual_min: actual,
      actual_covered_min: actualCovered,
      estimation_ratio: estimated > 0 && plannedActual > 0 ? Math.round(plannedActual / estimated * 100) / 100 : null,
      routines_scheduled: scheduledRoutines.length,
      routines_done: routineDone,
      routine_adherence_pct: pct(routineDone, scheduledRoutines.length),
    }
  })
"""
if old_daily not in s:
    raise SystemExit('daily marker not found')
s = s.replace(old_daily, new_daily, 1)

old_overview_calc = """  const activeTaskRecords = taskRecords.filter(task => !task.discarded && !task.deleted)
  const completedTasks = activeTaskRecords.filter(task => task.done).length
  const taskEstimated = activeTaskRecords.map(task => task.estimated_min).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
  const taskActual = activeTaskRecords.map(task => task.actual_min).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
"""
new_overview_calc = """  const activeTaskRecords = taskRecords.filter(task => !task.discarded && !task.deleted)
  const plannedTaskRecords = activeTaskRecords.filter(task => !task.actual_only)
  const actualOnlyTaskRecords = activeTaskRecords.filter(task => task.actual_only)
  const completedTasks = plannedTaskRecords.filter(task => task.done).length
  const taskEstimated = plannedTaskRecords.map(task => task.estimated_min).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
  const plannedTaskActual = plannedTaskRecords.map(task => task.actual_min).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
  const unplannedTaskActual = actualOnlyTaskRecords.map(task => task.actual_min).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
  const taskActual = plannedTaskActual + unplannedTaskActual
  const actualCovered = daily.reduce((sum, day) => sum + day.actual_covered_min, 0)
"""
if old_overview_calc not in s:
    raise SystemExit('overview calc marker not found')
s = s.replace(old_overview_calc, new_overview_calc, 1)

s = s.replace(
"      task_completion_pct: pct(completedTasks, activeTaskRecords.length),\n",
"      task_completion_pct: pct(completedTasks, plannedTaskRecords.length),\n",
1,
)
s = s.replace(
"      estimated_task_min: taskEstimated,\n      actual_task_min: taskActual,\n      estimation_ratio: taskEstimated > 0 && taskActual > 0 ? Math.round(taskActual / taskEstimated * 100) / 100 : null,\n",
"      estimated_task_min: taskEstimated,\n      planned_actual_task_min: plannedTaskActual,\n      unplanned_actual_task_min: unplannedTaskActual,\n      actual_task_min: taskActual,\n      actual_covered_min: actualCovered,\n      estimation_ratio: taskEstimated > 0 && plannedTaskActual > 0 ? Math.round(plannedTaskActual / taskEstimated * 100) / 100 : null,\n",
1,
)

s = s.replace(
"    rows.push(['task', task.date, task.goal_title ?? task.goal_id ?? '', task.text, task.discarded ? 'discarded' : task.done ? 'done' : 'open', task.category, task.planned_start ?? '', task.planned_end ?? '', task.estimated_min, task.actual_start ?? '', task.actual_end ?? '', task.actual_min, '', task.progress ?? '', task.schedule_type ?? ''])\n",
"    rows.push(['task', task.date, task.goal_title ?? task.goal_id ?? '', task.text, task.actual_only ? 'actual_only' : task.discarded ? 'discarded' : task.done ? 'done' : 'open', task.category, task.planned_start ?? '', task.planned_end ?? '', task.estimated_min, task.actual_start ?? '', task.actual_end ?? '', task.actual_min, '', task.progress ?? '', [task.schedule_type, task.actual_only ? 'retrospective-only' : 'planned'].filter(Boolean).join(' | ')])\n",
1,
)

old_summary = """  lines.push(`- 할 일 완료율: ${optional(snapshot.overview.task_completion_pct)}${snapshot.overview.task_completion_pct !== null ? '%' : ''}`)
  lines.push(`- 루틴 실행률: ${optional(snapshot.overview.routine_adherence_pct)}${snapshot.overview.routine_adherence_pct !== null ? '%' : ''}`)
  lines.push(`- 예상 작업시간: ${formatHours(snapshot.overview.estimated_task_min)}`)
  lines.push(`- 실제 기록시간: ${formatHours(snapshot.overview.actual_task_min)}`)
  lines.push(`- 실제/예상 시간 비율: ${optional(snapshot.overview.estimation_ratio)}`)
"""
new_summary = """  lines.push(`- 계획 할 일 완료율: ${optional(snapshot.overview.task_completion_pct)}${snapshot.overview.task_completion_pct !== null ? '%' : ''}`)
  lines.push(`- 루틴 실행률: ${optional(snapshot.overview.routine_adherence_pct)}${snapshot.overview.routine_adherence_pct !== null ? '%' : ''}`)
  lines.push(`- 계획 예상 총시간: ${formatHours(snapshot.overview.estimated_task_min)}`)
  lines.push(`- 계획 항목 실제시간: ${formatHours(snapshot.overview.planned_actual_task_min)}`)
  lines.push(`- 계획 외 실제기록 합계: ${formatHours(snapshot.overview.unplanned_actual_task_min)}`)
  lines.push(`- 전체 실제 활동시간 합계: ${formatHours(snapshot.overview.actual_task_min)} (동시 활동은 중복 합산될 수 있음)`)
  lines.push(`- 실제 타임라인 커버리지: ${formatHours(snapshot.overview.actual_covered_min)} (겹치는 시간대는 1회만 계산)`)
  lines.push(`- 계획 항목 실제/예상 시간 비율: ${optional(snapshot.overview.estimation_ratio)}`)
"""
if old_summary not in s:
    raise SystemExit('markdown summary marker not found')
s = s.replace(old_summary, new_summary, 1)

old_daily_md = """    lines.push(`- 할 일: ${day.tasks_done}/${day.tasks_total} (${day.task_completion_pct ?? '-'}%)`)
    lines.push(`- 루틴: ${day.routines_done}/${day.routines_scheduled} (${day.routine_adherence_pct ?? '-'}%)`)
    lines.push(`- 예상/실제 작업시간: ${formatHours(day.estimated_min)} / ${formatHours(day.actual_min)}`)
    lines.push(`- 수면/컨디션/집중: ${optional(day.sleep_hours)} / ${optional(day.condition)} / ${optional(day.focus)}`)
"""
new_daily_md = """    lines.push(`- 계획 할 일: ${day.tasks_done}/${day.tasks_total} (${day.task_completion_pct ?? '-'}%)`)
    lines.push(`- 루틴: ${day.routines_done}/${day.routines_scheduled} (${day.routine_adherence_pct ?? '-'}%)`)
    lines.push(`- 계획 예상/계획 항목 실제: ${formatHours(day.estimated_min)} / ${formatHours(day.planned_actual_min)}`)
    lines.push(`- 계획 외 실제기록: ${formatHours(day.unplanned_actual_min)} · 전체 활동 합계 ${formatHours(day.actual_min)} · 실제 커버리지 ${formatHours(day.actual_covered_min)}`)
    lines.push(`- 수면/컨디션/집중: ${day.sleep_hours !== null ? `${day.sleep_hours}시간` : '기록 없음'} / ${optional(day.condition)} / ${optional(day.focus)}`)
"""
if old_daily_md not in s:
    raise SystemExit('daily markdown marker not found')
s = s.replace(old_daily_md, new_daily_md, 1)

old_task_md = """  for (const task of snapshot.tasks) {
    const status = task.discarded ? '폐기' : task.done ? '완료' : '미완료'
    const timing = `예상 ${task.estimated_min ?? '-'}분 / 실제 ${task.actual_min ?? '-'}분`
    lines.push(`- ${task.date} · ${status} · [${task.category}] ${task.text} · ${timing}${task.goal_title ? ` · 목표: ${task.goal_title}` : ''}`)
  }
"""
new_task_md = """  for (const task of snapshot.tasks) {
    const status = task.actual_only ? '실제기록 전용' : task.discarded ? '폐기' : task.done ? '완료' : '미완료'
    const timing = task.actual_only
      ? `계획 예상시간 없음 / 실제 ${task.actual_min ?? '-'}분`
      : `예상 ${task.estimated_min ?? '-'}분 / 실제 ${task.actual_min ?? '-'}분`
    lines.push(`- ${task.date} · ${status} · [${task.category}] ${task.text} · ${timing}${task.goal_title ? ` · 목표: ${task.goal_title}` : ''}`)
  }
"""
if old_task_md not in s:
    raise SystemExit('task markdown marker not found')
s = s.replace(old_task_md, new_task_md, 1)

s = s.replace(
"AI 피드백 지침: 1) 계획 변경 이력을 시간순으로 복원해 처음 계획→재배치/취소→최종 실행을 설명한다. 2) 계획 타임라인과 실제 타임라인을 비교해 계획과 다르게 행동한 구간을 구체적으로 짚는다. 3) 실제 기록이 비어 있는 시간은 딴짓이라고 단정하지 말고 '미기록 시간'으로 표현한다. 4) 폐기/취소를 무조건 실패로 해석하지 말고 합리적 계획 수정인지 구분한다. 5) 막연한 격려보다 잘된 행동, 반복 패턴, 추정오차, 회복력, 다음에 바꿀 가장 작은 행동을 근거와 함께 제시한다.",
"AI 피드백 지침: 1) 계획 변경 이력을 시간순으로 복원해 처음 계획→재배치/취소→최종 실행을 설명한다. 2) 계획 타임라인과 실제 타임라인을 비교해 계획과 다르게 행동한 구간을 구체적으로 짚는다. 3) 실제 기록이 비어 있는 시간은 딴짓이라고 단정하지 말고 '미기록 시간'으로 표현한다. 4) 폐기/취소를 무조건 실패로 해석하지 말고 합리적 계획 수정인지 구분한다. 5) 막연한 격려보다 잘된 행동, 반복 패턴, 추정오차, 회복력, 다음에 바꿀 가장 작은 행동을 근거와 함께 제시한다. 6) '실제기록 전용' 항목은 사후 활동 로그이며 계획한 할 일/예상시간/완료율에 포함하지 않는다. 7) 전체 실제 활동시간 합계는 동시 활동 때문에 중복될 수 있으므로 하루 시간 사용량을 판단할 때는 실제 타임라인 커버리지와 함께 본다.",
1,
)

p.write_text(s)
