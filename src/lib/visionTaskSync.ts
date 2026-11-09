import { createHash, randomUUID } from 'node:crypto'
import { legacyTasksFor } from './plannerQueries'

export const VISION_TASK_PREFIX = 'vision-plan:'
const validDate = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v
const taskId = (id: string) => VISION_TASK_PREFIX + createHash('sha256').update(id).digest('hex')
export class VisionConflict extends Error {
  constructor(public partial = false) {
    super('Planner changed. Refresh before retrying.')
  }
}

export function validateVisionTask(input: any) {
  if (
    !input ||
    Object.keys(input).some(
      (k) =>
        ![
          'id',
          'title',
          'date',
          'previousDate',
          'done',
          'completedAt',
          'dueDate',
          'archived',
          'expectedUpdatedAt',
          'mutationId',
          'categoryId',
          'subtasks'
        ].includes(k)
    ) ||
    typeof input.id !== 'string' ||
    !input.id ||
    input.id.length > 100 ||
    typeof input.title !== 'string' ||
    !input.title.trim() ||
    input.title.length > 300 ||
    (input.date !== null && !validDate(input.date)) ||
    (input.previousDate !== null && !validDate(input.previousDate)) ||
    !validDate(input.dueDate) ||
    typeof input.done !== 'boolean' ||
    typeof input.archived !== 'boolean' ||
    (input.completedAt !== null &&
      (typeof input.completedAt !== 'string' || !Number.isFinite(Date.parse(input.completedAt)))) ||
    (input.expectedUpdatedAt !== null &&
      (!Number.isSafeInteger(input.expectedUpdatedAt) || input.expectedUpdatedAt < 0)) ||
    (input.categoryId != null &&
      (typeof input.categoryId !== 'string' ||
        !input.categoryId ||
        input.categoryId.length > 100)) ||
    typeof input.mutationId !== 'string' ||
    !input.mutationId ||
    input.mutationId.length > 120
  )
    throw new Error('Invalid task')
  if (input.subtasks !== undefined) {
    if (!Array.isArray(input.subtasks) || input.subtasks.length > 500)
      throw new Error('Invalid subtasks')
    const ids = new Set<string>()
    for (const child of input.subtasks) {
      if (child?.subtasks !== undefined) throw new Error('Only one subtask level is supported')
      validateVisionTask(child)
      if (
        child.id === input.id ||
        ids.has(child.id) ||
        child.date !== input.date ||
        (child.categoryId ?? null) !== (input.categoryId ?? null)
      )
        throw new Error('Invalid subtask relation')
      ids.add(child.id)
    }
  }
  return { ...input, title: input.title.trim() }
}

/** Scoped to Vision-owned tasks. Other task fields and all day metadata survive. */
export function createVisionTaskSync(
  db: any,
  owner: string,
  category: { id: string; name: string; color: string },
  categories = [category]
) {
  async function load(date: string) {
    const { data, error } = await db
      .from('day_entries')
      .select('id,date,note,meta')
      .eq('user_id', owner)
      .eq('date', date)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const records =
      '_tasks' in (data.meta ?? {})
        ? (data.meta._tasks ?? [])
        : await legacyTasksFor(owner, 'day_id', [data.id], db)
    return { ...data, meta: { ...data.meta, _tasks: records } }
  }
  async function change(date: string, transform: (records: any[], dayId: string) => any[]) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = await load(date),
        id = row?.id ?? randomUUID(),
        records = transform(row?.meta._tasks ?? [], id)
      if (!row) {
        const { error } = await db
          .from('day_entries')
          .insert({ id, user_id: owner, date, note: '', meta: { _tasks: records } })
        if (error?.code === '23505') continue
        if (error) throw error
        return records
      }
      // Compare the original stored body, not a synthesized legacy snapshot.
      const { data: original, error: readError } = await db
        .from('day_entries')
        .select('meta')
        .eq('user_id', owner)
        .eq('id', row.id)
        .maybeSingle()
      if (readError || !original) throw readError ?? new VisionConflict()
      const expected = original.meta ?? {}
      if (
        '_tasks' in expected &&
        JSON.stringify(expected._tasks) !== JSON.stringify(row.meta._tasks)
      )
        continue
      const { data: saved, error } = await db.rpc('planner_compare_and_swap_day', {
        p_user_id: owner,
        p_day_id: row.id,
        p_expected: expected,
        p_next: { ...expected, _tasks: records }
      })
      if (error) throw error
      if (saved?.length) return records
    }
    throw new VisionConflict()
  }
  const childClientId = (child: any, parentId: string) =>
    child.vision_plan?.client_id ??
    'planner-sub-' +
      createHash('sha256')
        .update(parentId + ':' + child.id)
        .digest('hex')
  // Walk only a complete native audit chain. A missing event, a shared-field
  // change or a different writer stops the proof; never guess from timestamps.
  function metadataOnlySince(task: any) {
    const shared = (state: any) =>
      JSON.stringify({
        text: state.text,
        done: !!state.done,
        category: state.category_id ?? null,
        discarded: !!state.discarded,
        subtasks: (state.subtasks ?? []).map((child: any) => ({
          id: child.id,
          text: child.text,
          done: !!child.done,
          discarded: !!child.discarded
        }))
      })
    let version = task.updated_at ?? 0
    const signature = shared(task)
    const history = task.history ?? []
    for (let index = history.length - 1; index > 0; index--) {
      const event = history[index]
      const previous = Date.parse(history[index - 1].at)
      if (
        task.deleted_at ||
        !event.id?.startsWith('hist-') ||
        ![
          'edited',
          'planned',
          'rescheduled',
          'unplanned',
          'actual_recorded',
          'focus_session'
        ].includes(event.kind) ||
        Date.parse(event.at) !== version ||
        !Number.isSafeInteger(previous) ||
        previous >= version ||
        !event.before ||
        !event.after ||
        shared(event.before) !== signature ||
        shared(event.after) !== signature
      )
        break
      version = previous
    }
    return version
  }
  function publicTask(t: any, date: string) {
    const lastCompletion = (t.history ?? [])
      .filter((h: any) => h.kind === 'completed' && Number.isFinite(Date.parse(h.at)))
      .at(-1)
    return {
      id: t.vision_plan.client_id,
      title: t.text,
      date,
      categoryId: t.category_id ?? null,
      done: t.done,
      archived: !!t.deleted_at || !!t.discarded,
      updatedAt: t.updated_at ?? 0,
      metadataOnlySince: metadataOnlySince(t),
      completedAt: t.done
        ? lastCompletion && lastCompletion.note !== 'Vision Plan 동기화'
          ? lastCompletion.at
          : (t.vision_plan.completed_at ?? null)
        : null,
      dueDate: t.vision_plan.due_date,
      mutationId: t.vision_plan.mutation_id,
      ...(t.vision_plan.is_group
        ? {
            kind: 'task-group',
            migrationPending: !!t.vision_plan.migration_pending,
            subtasks: (t.subtasks ?? []).map((child: any) => ({
              id: childClientId(child, t.vision_plan.client_id),
              title: child.text,
              date,
              categoryId: t.category_id ?? null,
              done: !!child.done,
              archived: !!child.discarded || !!t.vision_plan.unassigned,
              updatedAt: t.updated_at ?? 0,
              metadataOnlySince: metadataOnlySince(t),
              completedAt: child.done
                ? child.vision_plan?.done === child.done
                  ? (child.vision_plan.completed_at ?? null)
                  : new Date(child.updated_at ?? t.updated_at).toISOString()
                : null,
              dueDate: child.vision_plan?.due_date ?? t.vision_plan.due_date,
              mutationId:
                child.vision_plan?.mutation_id ??
                new Date(child.updated_at ?? t.updated_at).toISOString()
            }))
          }
        : {})
    }
  }
  async function read(from: string, to: string) {
    if (
      !validDate(from) ||
      !validDate(to) ||
      to < from ||
      Date.parse(to) - Date.parse(from) > 366 * 86400000
    )
      throw new Error('Invalid range')
    const { data, error } = await db
      .from('day_entries')
      .select('id,date,note,meta')
      .eq('user_id', owner)
      .gte('date', from)
      .lte('date', to)
    if (error) throw error
    const result = new Map<string, any>()
    for (const row of data ?? [])
      for (const t of row.meta?._tasks ?? [])
        if (t.id?.startsWith(VISION_TASK_PREFIX) && t.vision_plan?.client_id) {
          const next = publicTask(t, row.date),
            prior = result.get(next.id)
          if (prior && !prior.archived && !next.archived) {
            // Quarantine only this identity. Other tasks must remain readable.
            result.set(next.id, { ...prior, syncConflict: true })
            continue
          }
          if (
            !prior ||
            (!next.archived && prior.archived) ||
            (next.archived === prior.archived && next.updatedAt > prior.updatedAt)
          )
            result.set(next.id, { ...next, ...(prior?.syncConflict ? { syncConflict: true } : {}) })
        }
    const nested = new Set(
      [...result.values()].flatMap((task) => (task.subtasks ?? []).map((child: any) => child.id))
    )
    return [...result.values()].filter((task) => !nested.has(task.id))
  }
  async function syncGroup(input: any) {
    const id = taskId(input.id)
    const sourceDate =
      input.previousDate ??
      input.date ??
      input.subtasks.find((child: any) => child.previousDate)?.previousDate
    if (!sourceDate) return { saved: true, task: null }
    const source = await load(sourceDate)
    const existing = source?.meta._tasks.find((task: any) => task.id === id)
    const selected = input.categoryId
      ? categories.find((item) => item.id === input.categoryId)
      : (categories.find((item) => item.id === existing?.category_id) ?? category)
    if (!selected) throw new Error('Invalid task category')
    function matches(task: any) {
      if (
        !task ||
        task.vision_plan?.mutation_id !== input.mutationId ||
        task.vision_plan?.due_date !== input.dueDate ||
        (task.vision_plan?.completed_at ?? null) !== input.completedAt ||
        task.text !== input.title ||
        task.done !== input.done ||
        task.category_id !== selected!.id ||
        !!task.deleted_at !== (input.archived || input.date === null)
      )
        return false
      const children = (task.subtasks ?? []).filter((child: any) =>
        input.subtasks.some((item: any) => item.id === childClientId(child, input.id))
      )
      return (
        children.length === input.subtasks.length &&
        input.subtasks.every((child: any, index: number) => {
          const saved = children[index]
          return (
            saved &&
            childClientId(saved, input.id) === child.id &&
            saved.text === child.title &&
            saved.done === child.done &&
            !!saved.discarded === child.archived &&
            saved.vision_plan?.mutation_id === child.mutationId &&
            saved.vision_plan?.due_date === child.dueDate
          )
        })
      )
    }
    const alreadyMoved =
      existing?.deleted_at &&
      existing.vision_plan?.mutation_id === input.mutationId &&
      input.date !== sourceDate
    if (
      existing &&
      !matches(existing) &&
      !alreadyMoved &&
      (existing.updated_at ?? 0) !== input.expectedUpdatedAt
    )
      throw new VisionConflict()
    if (!existing && input.expectedUpdatedAt !== null) throw new VisionConflict()
    const date = input.date ?? sourceDate
    const legacy = new Map<string, any>()
    const sources = new Map<string, any>([[sourceDate, source]])
    for (const child of input.subtasks) {
      const prior = existing?.subtasks?.find(
        (item: any) => childClientId(item, input.id) === child.id
      )
      const reference =
        prior?.vision_plan?.migration ??
        (child.previousDate ? { date: child.previousDate, version: child.expectedUpdatedAt } : null)
      if (!reference) continue
      if (!sources.has(reference.date)) sources.set(reference.date, await load(reference.date))
      const standalone = sources
        .get(reference.date)
        ?.meta._tasks.find((item: any) => item.id === taskId(child.id))
      if (standalone) {
        if (!standalone.deleted_at && (standalone.updated_at ?? 0) !== reference.version)
          throw new VisionConflict()
        legacy.set(child.id, { task: standalone, reference })
      }
    }
    const records = await change(date, (current, dayId) => {
      const previous = current.find((task) => task.id === id)
      if (matches(previous)) return current
      if (date === sourceDate) {
        if (previous && (previous.updated_at ?? 0) !== input.expectedUpdatedAt)
          throw new VisionConflict()
        if (!previous && input.expectedUpdatedAt !== null) throw new VisionConflict()
      } else if (previous && !previous.deleted_at) throw new VisionConflict()
      const base = existing ?? previous
      const now = Math.max(Date.now(), (previous?.updated_at ?? 0) + 1)
      const subtasks = input.subtasks.map((child: any) => {
        const prior = base?.subtasks?.find(
          (item: any) => childClientId(item, input.id) === child.id
        )
        const original = legacy.get(child.id)
        if (original?.reference.date === date) {
          const live = current.find((item) => item.id === taskId(child.id))
          if (live && !live.deleted_at && (live.updated_at ?? 0) !== original.reference.version)
            throw new VisionConflict()
        }
        return {
          ...(prior ?? original?.task),
          id: prior?.id ?? taskId(child.id),
          text: child.title.trim(),
          done: child.done,
          discarded: child.archived,
          deleted_at: undefined,
          updated_at: now,
          vision_plan: {
            client_id: child.id,
            mutation_id: child.mutationId,
            completed_at: child.completedAt,
            done: child.done,
            due_date: child.dueDate,
            migration: prior?.vision_plan?.migration ?? original?.reference ?? null
          }
        }
      })
      const known = new Set(input.subtasks.map((child: any) => child.id))
      subtasks.push(
        ...(base?.subtasks ?? []).filter((child: any) => !known.has(childClientId(child, input.id)))
      )
      const task = {
        ...base,
        id,
        day_id: dayId,
        text: input.title,
        done: input.done,
        subtasks,
        category_id: selected.id,
        category_name: selected.name,
        category_color: selected.color,
        discarded: false,
        deleted_at: input.archived || input.date === null ? now : undefined,
        updated_at: now,
        vision_plan: {
          client_id: input.id,
          mutation_id: input.mutationId,
          completed_at: input.completedAt,
          due_date: input.dueDate,
          is_group: true,
          unassigned: input.date === null,
          migration_pending: subtasks.some((child: any) => child.vision_plan?.migration)
        },
        history: [
          ...(base?.history ?? []),
          {
            id: randomUUID(),
            at: new Date(now).toISOString(),
            kind: input.done && !base?.done ? 'completed' : 'edited',
            note: 'Vision Plan 동기화'
          }
        ].slice(-160)
      }
      return previous ? current.map((item) => (item.id === id ? task : item)) : [...current, task]
    })
    let destination = records.find((task) => task.id === id)
    // Keep migration markers in the saved parent until every old standalone row
    // is retired. Retries use these original versions, never a guessed version.
    try {
      const migrations = new Map<string, Map<string, any>>()
      for (const child of destination.subtasks ?? []) {
        const reference = child.vision_plan?.migration
        if (!reference) continue
        if (!migrations.has(reference.date)) migrations.set(reference.date, new Map())
        migrations.get(reference.date)!.set(taskId(child.vision_plan.client_id), reference)
      }
      for (const [migrationDate, references] of migrations) {
        await change(migrationDate, (current) =>
          current.map((previous) => {
            const reference = references.get(previous.id)
            if (!reference || previous.deleted_at) return previous
            if ((previous.updated_at ?? 0) !== reference.version) throw new VisionConflict()
            const now = Math.max(Date.now(), (previous.updated_at ?? 0) + 1)
            return {
              ...previous,
              deleted_at: now,
              updated_at: now,
              vision_plan: { ...previous.vision_plan, grouped_into: input.id }
            }
          })
        )
      }
      if (destination.vision_plan.migration_pending) {
        const expected = destination.updated_at
        const final = await change(date, (current) =>
          current.map((task) => {
            if (task.id !== id) return task
            if (task.updated_at !== expected) throw new VisionConflict()
            return {
              ...task,
              updated_at: Math.max(Date.now(), expected + 1),
              vision_plan: { ...task.vision_plan, migration_pending: false }
            }
          })
        )
        destination = final.find((task) => task.id === id)
      }
      if (existing && date !== sourceDate && !existing.deleted_at) {
        await change(sourceDate, (current) =>
          current.map((task) => {
            if (task.id !== id) return task
            if (task.deleted_at && task.vision_plan?.mutation_id === input.mutationId) return task
            if ((task.updated_at ?? 0) !== input.expectedUpdatedAt) throw new VisionConflict()
            const now = Math.max(Date.now(), (task.updated_at ?? 0) + 1)
            return {
              ...task,
              deleted_at: now,
              updated_at: now,
              vision_plan: { ...task.vision_plan, mutation_id: input.mutationId }
            }
          })
        )
      }
    } catch {
      throw new VisionConflict(true)
    }
    return { saved: true, task: publicTask(destination, date) }
  }
  async function sync(raw: any) {
    const input = validateVisionTask(raw)
    if (input.subtasks !== undefined) return syncGroup(input)
    const id = taskId(input.id),
      sourceDate = input.previousDate ?? input.date
    if (!sourceDate) return { saved: true, task: null }
    const source = await load(sourceDate),
      existing = source?.meta._tasks.find((t: any) => t.id === id)
    const selected = input.categoryId
      ? categories.find((c) => c.id === input.categoryId)
      : (categories.find((c) => c.id === existing?.category_id) ?? category)
    if (!selected || ['schedule', 'deadline'].includes(selected.id))
      throw new Error('Invalid task category')
    const matches = (t: any) =>
      t?.vision_plan?.mutation_id === input.mutationId &&
      t.vision_plan?.due_date === input.dueDate &&
      (t.vision_plan?.completed_at ?? null) === input.completedAt &&
      t.text === input.title &&
      t.done === input.done &&
      (!input.categoryId || t.category_id === input.categoryId) &&
      !!t.deleted_at === (input.archived || input.date === null)
    const alreadyMoved =
      existing?.deleted_at &&
      existing.vision_plan?.mutation_id === input.mutationId &&
      input.date !== sourceDate
    if (
      existing &&
      !matches(existing) &&
      !alreadyMoved &&
      (existing.updated_at ?? 0) !== input.expectedUpdatedAt
    )
      throw new VisionConflict()
    if (!existing && input.expectedUpdatedAt !== null) throw new VisionConflict()
    const moving = input.date !== null && input.date !== sourceDate && !input.archived
    let destination: any = null,
      destinationDate = input.date ?? sourceDate
    if (input.date !== null && !input.archived) {
      const records = await change(input.date, (records, dayId) => {
        const previous = records.find((t) => t.id === id)
        if (previous && matches(previous)) return records
        if (input.date === sourceDate) {
          if (previous && (previous.updated_at ?? 0) !== input.expectedUpdatedAt)
            throw new VisionConflict()
          if (!previous && input.expectedUpdatedAt !== null) throw new VisionConflict()
        } else if (previous && !previous.deleted_at) throw new VisionConflict()
        const now = Math.max(Date.now(), (previous?.updated_at ?? 0) + 1)
        const t = {
          ...(moving ? existing : previous),
          id,
          day_id: dayId,
          text: input.title,
          done: input.done,
          deleted_at: undefined,
          discarded: false,
          category_id: selected.id,
          category_name: selected.name,
          category_color: selected.color,
          updated_at: now,
          vision_plan: {
            client_id: input.id,
            mutation_id: input.mutationId,
            completed_at: input.completedAt,
            due_date: input.dueDate
          },
          history: [
            ...((moving ? existing : previous)?.history ?? []),
            {
              id: randomUUID(),
              at: new Date(now).toISOString(),
              kind: input.done && !(moving ? existing : previous)?.done ? 'completed' : 'edited',
              note: 'Vision Plan 동기화'
            }
          ].slice(-160)
        }
        return previous ? records.map((x) => (x.id === id ? t : x)) : [...records, t]
      })
      destination = records.find((t) => t.id === id)
    }
    // Destination is verified before the old date is tombstoned. On a conflict
    // retain both records and report failure; never silently erase a new edit.
    if (existing && (moving || input.archived || input.date === null)) {
      try {
        await change(sourceDate, (records) => {
          const previous = records.find((t) => t.id === id)
          if (previous?.deleted_at && previous.vision_plan?.mutation_id === input.mutationId)
            return records
          if (!previous || (previous.updated_at ?? 0) !== input.expectedUpdatedAt)
            throw new VisionConflict()
          const now = Math.max(Date.now(), (previous.updated_at ?? 0) + 1)
          const t = {
            ...previous,
            text: input.title,
            done: input.done,
            category_id: selected.id,
            category_name: selected.name,
            category_color: selected.color,
            deleted_at: now,
            updated_at: now,
            vision_plan: {
              ...previous.vision_plan,
              mutation_id: input.mutationId,
              completed_at: input.completedAt,
              due_date: input.dueDate
            },
            history: [
              ...(previous.history ?? []),
              {
                id: randomUUID(),
                at: new Date(now).toISOString(),
                kind: 'deleted',
                note: 'Vision Plan 이동 또는 숨김'
              }
            ].slice(-160)
          }
          if (!destination) {
            destination = t
            destinationDate = sourceDate
          }
          return records.map((x) => (x.id === id ? t : x))
        })
      } catch (error) {
        if (destination) throw new VisionConflict(true)
        throw error
      }
    }
    if (!destination && existing) {
      destination = existing
      destinationDate = sourceDate
    }
    return { saved: true, task: destination ? publicTask(destination, destinationDate) : null }
  }
  return { read, sync }
}
