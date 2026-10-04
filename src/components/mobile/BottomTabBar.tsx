'use client'
import { CalendarDays, Sun } from 'lucide-react'
import clsx from 'clsx'

export type MobileTab = 'today' | 'weekly'

interface Props {
  activeTab: MobileTab
  onTabChange: (tab: MobileTab) => void
}

const TABS: { id: MobileTab; label: string; Icon: React.ElementType }[] = [
  { id: 'today',  label: '플래너',  Icon: Sun },
  { id: 'weekly', label: '목표·계획', Icon: CalendarDays },
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
