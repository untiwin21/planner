'use client'
import { CalendarDays, Target, BookOpen, Sun } from 'lucide-react'
import clsx from 'clsx'

export type MobileTab = 'today' | 'weekly' | 'goals' | 'review'

interface Props {
  activeTab: MobileTab
  onTabChange: (tab: MobileTab) => void
}

const TABS: { id: MobileTab; label: string; Icon: React.ElementType }[] = [
  { id: 'today',  label: '오늘',  Icon: Sun },
  { id: 'weekly', label: '주간',  Icon: CalendarDays },
  { id: 'goals',  label: '목표',  Icon: Target },
  { id: 'review', label: '회고',  Icon: BookOpen },
]

export function BottomTabBar({ activeTab, onTabChange }: Props) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[var(--border)] pb-safe">
      <div className="flex">
        {TABS.map(({ id, label, Icon }) => {
          const active = activeTab === id
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={clsx(
                'flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors',
                active ? 'text-[var(--purple)]' : 'text-[var(--text-3)]',
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
              <span className={clsx('text-[10px] font-medium', active ? 'text-[var(--purple)]' : 'text-[var(--text-3)]')}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
