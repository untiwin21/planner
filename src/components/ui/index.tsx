'use client'
import { forwardRef } from 'react'
import clsx from 'clsx'

// CARD
export function Card({ className, children, onClick, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'bg-white border rounded-[16px] transition-all duration-150',
        onClick && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0',
        className
      )}
      style={{ borderColor: 'var(--border)' }}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  )
}

// BADGE
type BadgeColor = 'purple' | 'teal' | 'amber' | 'coral' | 'blue' | 'gray' | 'red'
const badgeClasses: Record<BadgeColor, string> = {
  purple: 'cat-purple',
  teal: 'cat-teal',
  amber: 'cat-amber',
  coral: 'cat-coral',
  blue: 'cat-blue',
  gray: 'bg-[var(--surface-2)] text-[var(--text-2)]',
  red: 'cat-red',
}

export function Badge({ color = 'gray', children, className }: { color?: BadgeColor; children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-[6px] text-[13px] font-medium', badgeClasses[color], className)}>
      {children}
    </span>
  )
}

// CHECKBOX
export function Checkbox({ checked, onChange, size = 'md' }: { checked: boolean; onChange: () => void; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 14 : 16
  return (
    <button
      onClick={onChange}
      className={clsx(
        'flex-shrink-0 rounded-[4px] border flex items-center justify-center transition-all duration-150',
        checked
          ? 'bg-[var(--purple)] border-[var(--purple)]'
          : 'bg-white border-[var(--border-strong)] hover:border-[var(--purple)]'
      )}
      style={{ width: s, height: s }}
    >
      {checked && (
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

// CIRCLE CHECKBOX (for routines)
export function CircleCheck({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={clsx(
        'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-150',
        checked
          ? 'bg-[var(--teal)] border-[var(--teal)]'
          : 'bg-white border-[var(--border-strong)] hover:border-[var(--teal)]'
      )}
    >
      {checked && (
        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
          <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

// INPUT
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        'w-full px-3 py-2 rounded-[10px] text-sm outline-none transition-all',
        'bg-[var(--surface-2)] border border-transparent',
        'focus:bg-white focus:border-[var(--purple)] focus:shadow-[0_0_0_3px_var(--purple-bg)]',
        'placeholder:text-[var(--text-3)]',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

// TEXTAREA
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={clsx(
        'w-full px-3 py-2.5 rounded-[10px] text-sm outline-none transition-all resize-none',
        'bg-[var(--surface-2)] border border-transparent',
        'focus:bg-white focus:border-[var(--purple)] focus:shadow-[0_0_0_3px_var(--purple-bg)]',
        'placeholder:text-[var(--text-3)] leading-relaxed',
        className
      )}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'

// PROGRESS BAR
export function ProgressBar({ value, max, color = 'teal' }: { value: number; max: number; color?: 'teal' | 'purple' }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100)
  const fill = color === 'teal' ? 'var(--teal)' : 'var(--purple)'
  return (
    <div className="w-full h-1 rounded-full bg-[var(--border)]">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: fill }}
      />
    </div>
  )
}

// ICON BUTTON
export function IconBtn({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-7 h-7 rounded-[8px] flex items-center justify-center text-[var(--text-3)]',
        'hover:bg-[var(--surface-2)] hover:text-[var(--text-2)] transition-all duration-100',
        className
      )}
    >
      {children}
    </button>
  )
}
