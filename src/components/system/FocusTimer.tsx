'use client'
import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface Props {
  onClose: () => void
}

export function FocusTimer({ onClose }: Props) {
  const [duration, setDuration] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [running, setRunning] = useState(false)
  const [customMin, setCustomMin] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  function start(min: number) {
    setDuration(min)
    setRemaining(min * 60)
    setRunning(true)

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    if (intervalRef.current) clearInterval(intervalRef.current)
    let left = min * 60
    intervalRef.current = setInterval(() => {
      left--
      setRemaining(left)
      if (left <= 0) {
        clearInterval(intervalRef.current!)
        intervalRef.current = null
        setRunning(false)
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('집중 세션 완료!', { body: `${min}분 집중을 완료했습니다.` })
        }
      }
    }, 1000)
  }

  function stop() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    setRunning(false)
    setDuration(null)
  }

  const mm = Math.floor(remaining / 60)
  const ss = remaining % 60

  return (
    <div className="w-64 bg-white border border-[var(--border)] rounded-[16px] shadow-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold">집중 타이머</span>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center text-[var(--text-3)] hover:bg-[var(--surface-2)] rounded-[6px]">
          <X size={14} />
        </button>
      </div>

      {!running && !duration ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {[25, 50].map(m => (
              <button key={m} onClick={() => start(m)}
                className="flex-1 py-2 rounded-[8px] text-sm font-medium bg-[var(--purple)] text-white hover:opacity-90">
                {m}분
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={customMin} onChange={e => setCustomMin(e.target.value.replace(/\D/g, ''))}
              placeholder="직접 입력 (분)"
              className="flex-1 px-2 py-1.5 rounded-[8px] text-sm bg-[var(--surface-2)] outline-none focus:ring-1 focus:ring-[var(--purple)]" />
            <button onClick={() => { const m = parseInt(customMin); if (m > 0) start(m) }}
              className="px-3 py-1.5 rounded-[8px] text-sm font-medium bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--border)]">
              시작
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-3xl font-bold tabular-nums text-[var(--purple)]">
            {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
          </p>
          <p className="text-xs text-[var(--text-3)] mt-1">{duration}분 집중 중</p>
          <button onClick={stop}
            className="mt-3 px-4 py-1.5 rounded-[8px] text-xs font-medium text-[var(--coral)] bg-[var(--coral-bg)] hover:opacity-80">
            중지
          </button>
        </div>
      )}
    </div>
  )
}
