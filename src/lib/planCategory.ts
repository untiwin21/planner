import type { ScheduleType, ShortGoal } from '@/types'

export const PLAN_CATEGORY_MARKER_ID = '__plan_category__'
export const PLAN_CATEGORY_TYPES: ScheduleType[] = ['personal', 'external', 'deep-work']

export const PLAN_CATEGORY_STYLE: Record<ScheduleType, {
  label: string
  event: string
  dot: string
  accent: string
}> = {
  personal: {
    label: '개인',
    event: 'border-[#AFCBED] bg-[#EEF5FF] text-[#315A9E]',
    dot: 'bg-[#4F8EDC]',
    accent: '#4F8EDC',
  },
  external: {
    label: '외부',
    event: 'border-[#A9D7BC] bg-[#ECF8F0] text-[#26734D]',
    dot: 'bg-[#4FA773]',
    accent: '#4FA773',
  },
  'deep-work': {
    label: 'Deep Work',
    event: 'border-[#EDB5CF] bg-[#FDECF4] text-[#A43A6C]',
    dot: 'bg-[#D96B9D]',
    accent: '#D96B9D',
  },
}

export function isPlanCategoryType(value: unknown): value is ScheduleType {
  return value === 'personal' || value === 'external' || value === 'deep-work'
}

export function shortGoalCategory(goal: Pick<ShortGoal, 'categories'>): ScheduleType {
  const marker = (goal.categories ?? []).find((item: any) => item?.id === PLAN_CATEGORY_MARKER_ID)
  return isPlanCategoryType(marker?.type) ? marker.type : 'personal'
}

export function withShortGoalCategory(categories: any[] | undefined, type: ScheduleType): any[] {
  return [
    ...(categories ?? []).filter((item: any) => item?.id !== PLAN_CATEGORY_MARKER_ID),
    { id: PLAN_CATEGORY_MARKER_ID, type },
  ]
}
