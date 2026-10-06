import type { Task } from '@/types'
import { SCHEDULE_CAT_ID, DEADLINE_CAT_ID } from '@/types'

/** Cards summarize commitments; all events remain in the day editor and timeline. */
export function isImportantSchedule(task: Task): boolean {
  if (task.deleted_at || task.discarded || ![SCHEDULE_CAT_ID, DEADLINE_CAT_ID].includes(task.category_id)) return false
  if (typeof task.important === 'boolean') return task.important
  return /면접|인적성|적성검사|역량검사|필기|몬스터|시험|중간고사|기말고사|사전환경테스트|카공|약속|회의|미팅|모임|스터디|면담|\b(?:PAT|DCAT|GSAT|HMAT|interview|exam|meeting|meetup)\b|(?:way|cns)?\s*fit\s*test/i.test(task.text)
}
