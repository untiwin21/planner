'use client'
import { useState, useRef } from 'react'

const STORAGE_KEYS = [
  'planr_days',
  'planr_goals',
  'planr_routines',
  'planr_routine_logs',
  'planr_long_goals',
  'planr_weekly_reviews',
  'planr_categories',
]

export function DataPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastSync = typeof window !== 'undefined' ? localStorage.getItem('planr_last_sync') : null

  function handleExport() {
    const data: Record<string, any> = {}
    for (const key of STORAGE_KEYS) {
      data[key] = JSON.parse(localStorage.getItem(key) || 'null')
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `planr-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
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
    <div className="absolute top-4 right-4">
      <button onClick={() => setIsOpen(v => !v)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200">
        ⚙️
      </button>
      {isOpen && (
        <div className="absolute top-10 right-0 bg-white shadow-lg rounded-lg p-4 w-64">
          <h3 className="font-bold mb-2">데이터 관리</h3>
          <div className="space-y-2">
            <button onClick={handleExport} className="w-full text-left p-2 rounded hover:bg-gray-100">
              데이터 내보내기 (JSON)
            </button>
            <button onClick={handleImportClick} className="w-full text-left p-2 rounded hover:bg-gray-100">
              데이터 불러오기
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
          </div>
          {lastSync && (
            <p className="text-xs text-gray-500 mt-4">
              마지막 동기화: {new Date(lastSync).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
