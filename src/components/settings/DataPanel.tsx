'use client'

import { useRef, useState } from 'react'
import type { DayEntry, LongGoal, Routine, RoutineLog, ShortGoal } from '@/types'
import {
  aiSnapshotToCsv,
  aiSnapshotToMarkdown,
  buildAiContextSnapshot,
  type AiExportRange,
  type AiExportSource,
} from '@/lib/aiExport'

const STORAGE_KEYS = [
  'planr_days',
  'planr_goals',
  'planr_routines',
  'planr_routine_logs',
  'planr_long_goals',
  'planr_weekly_reviews',
  'planr_categories',
]

const RANGE_OPTIONS: Array<{ value: AiExportRange; label: string }> = [
  { value: 1, label: '오늘' },
  { value: 7, label: '최근 7일' },
  { value: 30, label: '최근 30일' },
  { value: 'all', label: '전체' },
]

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function getAiSource(): AiExportSource {
  return {
    days: readStorage<DayEntry[]>('planr_days', []),
    goals: readStorage<ShortGoal[]>('planr_goals', []),
    routines: readStorage<Routine[]>('planr_routines', []),
    logs: readStorage<RoutineLog[]>('planr_routine_logs', []),
    longGoals: readStorage<LongGoal[]>('planr_long_goals', []),
    weeklyReviews: readStorage<Record<string, string>>('planr_weekly_reviews', {}),
  }
}

function todayStamp() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function rangeLabel(range: AiExportRange) {
  if (range === 'all') return 'all'
  return range === 1 ? 'today' : `${range}d`
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function DataPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [range, setRange] = useState<AiExportRange>(7)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastSync = typeof window !== 'undefined' ? localStorage.getItem('planr_last_sync') : null

  function currentSnapshot() {
    return buildAiContextSnapshot(getAiSource(), range)
  }

  function handleAiMarkdownExport() {
    const markdown = aiSnapshotToMarkdown(currentSnapshot())
    downloadText(`planr-ai-context-${rangeLabel(range)}-${todayStamp()}.md`, markdown, 'text/markdown;charset=utf-8')
  }

  async function handleCopyAiReport() {
    try {
      await navigator.clipboard.writeText(aiSnapshotToMarkdown(currentSnapshot()))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      alert('클립보드 복사에 실패했습니다. 파일 다운로드를 이용해주세요.')
    }
  }

  function handleAiCsvExport() {
    const csv = aiSnapshotToCsv(currentSnapshot())
    downloadText(`planr-ai-context-${rangeLabel(range)}-${todayStamp()}.csv`, csv, 'text/csv;charset=utf-8')
  }

  function handleAiJsonExport() {
    const snapshot = currentSnapshot()
    downloadText(
      `planr-ai-context-${rangeLabel(range)}-${todayStamp()}.json`,
      JSON.stringify(snapshot, null, 2),
      'application/json;charset=utf-8',
    )
  }

  function handleBackupExport() {
    const data: Record<string, unknown> = {}
    for (const key of STORAGE_KEYS) {
      data[key] = readStorage(key, null)
    }
    downloadText(
      `planr-backup-${todayStamp()}.json`,
      JSON.stringify(data, null, 2),
      'application/json;charset=utf-8',
    )
  }

  function handleImportClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        for (const key in data) {
          if (STORAGE_KEYS.includes(key)) {
            localStorage.setItem(key, JSON.stringify(data[key]))
          }
        }
        alert('데이터를 성공적으로 불러왔습니다. 페이지를 새로고침합니다.')
        window.location.reload()
      } catch (error) {
        alert('데이터를 불러오는 중 오류가 발생했습니다.')
        console.error('Error importing data:', error)
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(value => !value)}
        className="w-8 h-8 flex items-center justify-center rounded-[8px] hover:bg-white border border-transparent hover:border-[var(--border)] transition-all"
        title="데이터 및 AI 내보내기"
      >
        ⚙️
      </button>

      {isOpen && (
        <div className="absolute top-10 right-0 z-50 w-[340px] overflow-hidden rounded-[16px] border border-[var(--border)] bg-white shadow-[0_18px_55px_rgba(30,27,45,0.16)]">
          <div className="border-b border-[var(--border)] px-4 py-3.5">
            <h3 className="text-sm font-black">데이터 & AI Context</h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-3)]">
              현재 실행 데이터를 GPT에 전달하거나, 추후 Planr Agent의 입력으로 사용할 수 있습니다.
            </p>
          </div>

          <div className="p-4">
            <div className="mb-3">
              <p className="mb-2 text-[10px] font-black tracking-[0.1em] text-[var(--purple)]">AI MENTOR EXPORT</p>
              <div className="grid grid-cols-4 gap-1 rounded-[10px] bg-[var(--surface-2)] p-1">
                {RANGE_OPTIONS.map(option => (
                  <button
                    key={String(option.value)}
                    type="button"
                    onClick={() => setRange(option.value)}
                    className={`rounded-[7px] px-1.5 py-1.5 text-[10px] font-bold transition-all ${range === option.value ? 'bg-white text-[var(--text)] shadow-sm' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[13px] border border-[var(--purple)]/20 bg-[var(--purple-bg)]/35 p-3">
              <p className="text-xs font-black text-[var(--purple-text)]">GPT에게 바로 보여주기</p>
              <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-3)]">
                목표·정체성·루틴·컨디션·할 일·예상/실제 시간을 사람이 읽기 좋은 보고서로 정리합니다.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={handleAiMarkdownExport} className="rounded-[9px] bg-[var(--purple)] px-3 py-2 text-[11px] font-bold text-white hover:opacity-90">
                  GPT 보고서 .md
                </button>
                <button onClick={handleCopyAiReport} className="rounded-[9px] border border-[var(--purple)]/25 bg-white px-3 py-2 text-[11px] font-bold text-[var(--purple-text)] hover:border-[var(--purple)]">
                  {copied ? '복사됨 ✓' : '보고서 복사'}
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={handleAiCsvExport} className="rounded-[9px] border border-[var(--border)] px-3 py-2.5 text-left hover:bg-[var(--surface-2)]">
                <span className="block text-[11px] font-bold">통합 CSV</span>
                <span className="mt-0.5 block text-[9px] text-[var(--text-3)]">분석·스프레드시트용</span>
              </button>
              <button onClick={handleAiJsonExport} className="rounded-[9px] border border-[var(--border)] px-3 py-2.5 text-left hover:bg-[var(--surface-2)]">
                <span className="block text-[11px] font-bold">구조화 JSON</span>
                <span className="mt-0.5 block text-[9px] text-[var(--text-3)]">추후 Agent 입력용</span>
              </button>
            </div>

            <div className="my-4 h-px bg-[var(--border)]" />

            <p className="mb-2 text-[10px] font-black tracking-[0.1em] text-[var(--text-3)]">BACKUP</p>
            <div className="space-y-1">
              <button onClick={handleBackupExport} className="w-full rounded-[8px] px-2.5 py-2 text-left text-[11px] font-semibold hover:bg-[var(--surface-2)]">
                전체 원본 백업 (.json)
              </button>
              <button onClick={handleImportClick} className="w-full rounded-[8px] px-2.5 py-2 text-left text-[11px] font-semibold hover:bg-[var(--surface-2)]">
                백업 데이터 불러오기
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
            </div>

            {lastSync && (
              <p className="mt-4 text-[9px] text-[var(--text-3)]">
                마지막 동기화: {new Date(lastSync).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
