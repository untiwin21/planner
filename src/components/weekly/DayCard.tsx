'use client'
import clsx from 'clsx'
import { isToday, DAY_NAMES, formatSleepMin } from '@/lib/dates'
import type { DayEntry } from '@/types'
import { SCHEDULE_CAT_ID } from '@/types'

interface DayCardProps {
  date: Date
  entry?: DayEntry
  isSelected: boolean
  onClick: () => void
}

const DOT_COLORS: Record<string, string> = {
  purple: 'bg-[var(--purple)]',
  teal: 'bg-[var(--teal)]',
  amber: 'bg-[var(--amber)]',
  coral: 'bg-[var(--coral)]',
  blue: 'bg-[var(--blue)]',
}

const LEVEL_EMOJI: Record<number, string> = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' }

export function DayCard({ date, entry, isSelected, onClick }: DayCardProps) {
  const today = isToday(date)
  const dayIdx = (date.getDay() + 6) % 7
  const tasks = entry?.tasks ?? []
  const meta = entry?.meta

  // Schedule tasks — sorted by time, then alphabetically
  const schedules = tasks
    .filter(t => t.category_id === SCHEDULE_CAT_ID)
    .sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time)
      if (a.time) return -1
      if (b.time) return 1
      return a.text.localeCompare(b.text)
    })
    .slice(0, 3)

  // Non-schedule tasks for progress + top3
  const workTasks = tasks.filter(t => t.category_id !== SCHEDULE_CAT_ID)
  const doneCnt = workTasks.filter(t => t.done).length
  const totalCnt = workTasks.length
  const pct = totalCnt > 0 ? Math.round((doneCnt / totalCnt) * 100) : 0

  const top3Ids = meta?.top3 ?? []
  const top3 = top3Ids.length > 0
    ? top3Ids.map(id => workTasks.find(t => t.id === id)).filter(Boolean)
    : workTasks.filter(t => !t.done).slice(0, 3)

  return (
    <button
      onClick={onClick}
      className={clsx(
        'relative flex flex-col w-full rounded-[14px] border transition-all duration-150 text-left overflow-hidden',
        isSelected
          ? 'bg-[var(--purple-bg)] border-[var(--purple)] shadow-[0_0_0_1px_var(--purple)]'
          : today
          ? 'bg-white border-[var(--purple)] shadow-[0_2px_12px_rgba(83,74,183,0.10)]'
          : 'bg-white border-[var(--border)] hover:border-[var(--border-strong)] hover:shadow-sm'
      )}
    >
      {/* Row 1: day + date */}
      <div className="flex items-start justify-between px-3 pt-3 pb-2">
        <div>
          <span className={clsx('text-[15px] font-semibold tracking-widest uppercase block',
            isSelected || today ? 'text-[var(--purple)]' : 'text-[var(--text-3)]'
          )}>{DAY_NAMES[dayIdx]}</span>
          <span className={clsx('text-[clamp(16px,2vw,22px)] font-bold leading-none tracking-tight',
            today || isSelected ? 'text-[var(--purple)]' : 'text-[var(--text)]'
          )}>{date.getDate()}</span>
        </div>
        {today && <span className="w-1.5 h-1.5 rounded-full bg-[var(--purple)] mt-1 flex-shrink-0" />}
      </div>

      {/* Row 2: schedules — grows with viewport */}
      <div className="px-3 py-2 border-t border-[var(--border)] min-h-[2.5rem] lg:min-h-[4.5rem] xl:min-h-[5.5rem] 2xl:min-h-[7rem]">
        {schedules.length > 0
          ? schedules.map(t => (
              <div key={t!.id} className="flex items-baseline gap-1 leading-snug">
                {t!.time && (
                  <span className="text-[clamp(7px,0.7vw,9px)] font-mono text-[var(--blue)] flex-shrink-0 tabular-nums">
                    {t!.time}
                  </span>
                )}
                <p className="text-[clamp(8px,0.8vw,10px)] text-[var(--text-2)] truncate">
                  {t!.text.slice(0, 18)}
                </p>
              </div>
            ))
          : <p className="text-[15px] text-[var(--text-3)] italic">일정 없음</p>
        }
      </div>

      {/* Row 3: top 3 work tasks — grows with viewport */}
      <div className="px-3 py-2 border-t border-[var(--border)] min-h-[3.75rem] lg:min-h-[5.5rem] xl:min-h-[7rem] 2xl:min-h-[9rem]">
        {top3.length > 0
          ? top3.slice(0, 3).map(t => {
              const dot = DOT_COLORS[t!.category_color ?? 'purple']
              return (
                <div key={t!.id} className="flex items-start gap-1.5 mb-0.5 last:mb-0">
                  <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0 mt-[3px]', dot, t!.done && 'opacity-25')} />
                  <span className={clsx('text-[clamp(8px,0.8vw,10px)] leading-tight line-clamp-1',
                    t!.done ? 'line-through text-[var(--text-3)]' : 'text-[var(--text-2)]'
                  )}>{t!.text}</span>
                </div>
              )
            })
          : <p className="text-[15px] text-[var(--text-3)] italic">할 일 없음</p>
        }
      </div>

      {/* Row 4: progress */}
      <div className="px-3 py-2 border-t border-[var(--border)]">
        <div className="flex justify-between mb-1">
          <span className="text-[14px] text-[var(--text-3)] font-medium">달성률</span>
          <span className="text-[14px] text-[var(--text-3)]">{totalCnt > 0 ? `${pct}%` : '—'}</span>
        </div>
        <div className="w-full h-[3px] rounded-full bg-[var(--border)]">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: pct === 100 ? 'var(--teal)' : 'var(--purple)' }} />
        </div>
      </div>

      {/* Row 5: sleep / condition / focus */}
      <div className="grid grid-cols-3 border-t border-[var(--border)]">
        {[
          { label: '수면', value: meta?.sleep != null ? formatSleepMin(meta.sleep) : '—' },
          { label: '컨디션', value: meta?.condition != null ? LEVEL_EMOJI[meta.condition] : '—' },
          { label: '집중력', value: meta?.focus != null ? LEVEL_EMOJI[meta.focus] : '—' },
        ].map((item, i) => (
          <div key={i} className={clsx('flex flex-col items-center py-2 gap-0.5', i > 0 && 'border-l border-[var(--border)]')}>
            <span className="text-[12px] text-[var(--text-3)] uppercase tracking-wide">{item.label}</span>
            <span className="text-[clamp(9px,0.9vw,11px)] font-semibold text-[var(--text-2)]">{item.value}</span>
          </div>
        ))}
      </div>
    </button>
  )
}
