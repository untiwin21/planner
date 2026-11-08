import { readRows, legacyTasksFor } from './plannerQueries'
const { assessment } = require('./visionAssessment.cjs')

/** Owner is supplied by server configuration, never by a caller. No raw journal leaves this boundary. */
export async function readVisionAssessment(db: any, owner: string, cycleStart: unknown, now = Date.now()) {
  if (typeof cycleStart !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(cycleStart) || !Number.isFinite(Date.parse(cycleStart)) || new Date(cycleStart+'T00:00:00Z').toISOString().slice(0,10)!==cycleStart) throw new Error('Invalid cycle')
  const today = new Date(now + 9*3600000).toISOString().slice(0,10)
  const to = [new Date(Date.parse(cycleStart+'T00:00:00Z')+83*86400000).toISOString().slice(0,10), today].sort()[0]
  if (to < cycleStart) return assessment({ cycleStart, now })
  const [days, goals, routines, logs] = await Promise.all([
    readRows(() => db.from('day_entries').select('id,date,tasks:meta->_tasks,sleep:meta->sleep,review:meta->review,routineActual:meta->routineActual,linkedGoalTaskIds:meta->linkedGoalTaskIds,linkedGoalSubtaskIds:meta->linkedGoalSubtaskIds').eq('user_id',owner).gte('date',cycleStart).lte('date',to)),
    readRows(() => db.from('short_goals').select('id,date_from,date_to,tasks').eq('user_id',owner).lte('date_from',to).gte('date_to',cycleStart)),
    readRows(() => db.from('routines').select('id,status,created_at,updated_at,config').eq('user_id',owner)),
    // Older schemas keep actual routine windows in day_entries.meta.routineActual.
    readRows(() => db.from('routine_logs').select('*').eq('user_id',owner).gte('date',cycleStart).lte('date',to))
  ])
  const [dayLegacy, goalLegacy] = await Promise.all([
    legacyTasksFor(owner,'day_id',days.filter(d=>d.tasks==null).map(d=>d.id),db),
    legacyTasksFor(owner,'goal_id',goals.filter(g=>!g.tasks?.length).map(g=>g.id),db)
  ])
  return assessment({cycleStart,now,days:days.map(d=>({...d,tasks:d.tasks??dayLegacy.filter(t=>t.day_id===d.id)})),goals:goals.map(g=>({...g,tasks:g.tasks?.length?g.tasks:goalLegacy.filter(t=>t.goal_id===g.id)})),routines,logs})
}
