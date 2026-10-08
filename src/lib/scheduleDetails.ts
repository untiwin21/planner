import type { ScheduleDetails } from '@/types'
import { validDate, validTime } from './scheduleConflicts'
export function validateScheduleDetails(value: unknown): ScheduleDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('일정 상세는 객체여야 합니다.')
  const v = value as Record<string, unknown>
  const allowed = ['kind', 'due_time', 'visibility', 'description', 'preparation', 'source_url', 'checked_at', 'result', 'dependencies', 'next_steps']
  if (Object.keys(v).some(k => !allowed.includes(k))) throw new Error('지원하지 않는 일정 상세 항목입니다.')
  if (v.kind !== undefined && !['event', 'deadline'].includes(String(v.kind))) throw new Error('일정 유형이 올바르지 않습니다.')
  if (v.due_time !== undefined && v.due_time !== '' && !validTime(v.due_time)) throw new Error('마감 시각은 HH:mm이어야 합니다.')
  if (v.visibility !== undefined && !['public', 'private'].includes(String(v.visibility))) throw new Error('일정 분류가 올바르지 않습니다.')
  if (v.result !== undefined && !['unknown', 'passed', 'failed'].includes(String(v.result))) throw new Error('전형 결과가 올바르지 않습니다.')
  for (const k of ['description', 'source_url', 'checked_at']) if (v[k] !== undefined && (typeof v[k] !== 'string' || (v[k] as string).length > 20000)) throw new Error('일정 상세 문자열이 올바르지 않습니다.')
  if (v.source_url && !/^https?:\/\//.test(String(v.source_url))) throw new Error('원문 링크는 http 또는 https여야 합니다.')
  if (v.checked_at && !Number.isFinite(Date.parse(String(v.checked_at)))) throw new Error('확인 시각이 올바르지 않습니다.')
  if (v.preparation !== undefined && (!Array.isArray(v.preparation) || v.preparation.length > 100 || v.preparation.some(x => typeof x !== 'string' || x.length > 2000))) throw new Error('준비 절차가 올바르지 않습니다.')
  if (v.dependencies !== undefined && (!Array.isArray(v.dependencies) || v.dependencies.length > 50 || v.dependencies.some(x => !x || typeof x.id !== 'string' || !x.id || !['completed', 'passed'].includes(x.requirement)))) throw new Error('선행 일정이 올바르지 않습니다.')
  if (v.next_steps !== undefined && (!Array.isArray(v.next_steps) || v.next_steps.length > 50 || v.next_steps.some(x => !x || typeof x.title !== 'string' || !x.title.trim() || typeof x.condition !== 'string' || !x.condition.trim() || (x.date !== undefined && !validDate(x.date))))) throw new Error('다음 단계가 올바르지 않습니다.')
  return v as ScheduleDetails
}
