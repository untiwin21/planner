'use client'
import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { Badge } from '@/components/ui'
import type { Category, BadgeColor } from '@/types'

const CAT_COLORS: BadgeColor[] = ['purple', 'teal', 'amber', 'coral', 'blue']
const CAT_COLOR_LABELS: Record<BadgeColor, string> = {
  purple: '보라', teal: '청록', amber: '호박', coral: '코랄', blue: '파랑', gray: '회색', red: '빨강',
}

interface Props {
  categories: Category[]
  onAdd: (cat: Omit<Category, 'id'>) => void
  onDelete: (id: string) => void
}

export function CategoryPanel({ categories, onAdd, onDelete }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<BadgeColor>('purple')

  function handleAdd() {
    if (!newName.trim()) return
    onAdd({ name: newName.trim(), color: newColor })
    setNewName('')
    setShowForm(false)
  }

  return (
    <div className="bg-white border border-[var(--border)] rounded-[16px] p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">카테고리 관리</h3>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--purple)] transition-colors"
          >
            <Plus size={12} /> 추가
          </button>
        )}
      </div>

      {/* Category list */}
      <div className="flex flex-col gap-1.5 mb-1">
        {categories.length === 0 && !showForm && (
          <p className="text-xs text-[var(--text-3)]">카테고리가 없습니다.</p>
        )}
        {categories.map(cat => (
          <div key={cat.id} className="flex items-center gap-2 group">
            <div className="flex-1 min-w-0">
              <Badge color={cat.color}>{cat.name}</Badge>
            </div>
            <button
              onClick={() => onDelete(cat.id)}
              className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-[var(--text-3)] hover:text-red-500 transition-all flex-shrink-0"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>

      {/* Inline add form */}
      {showForm && (
        <div className="flex flex-col gap-2 mt-2 p-3 rounded-[10px] bg-[var(--surface-2)] border border-[var(--border)]">
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="카테고리 이름"
            className="w-full px-2 py-1.5 rounded-[7px] text-sm bg-white border border-[var(--border)] outline-none focus:border-[var(--purple)]"
          />
          <div className="flex gap-1 flex-wrap">
            {CAT_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={`px-2 py-0.5 rounded-[5px] text-[15px] font-medium cat-${c} transition-all ${
                  newColor === c ? 'ring-2 ring-[var(--purple)] ring-offset-1' : ''
                }`}
              >
                {CAT_COLOR_LABELS[c]}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="flex-1 py-1 rounded-[7px] text-xs font-medium bg-[var(--purple)] text-white hover:opacity-90 transition-opacity"
            >
              추가
            </button>
            <button
              onClick={() => { setShowForm(false); setNewName('') }}
              className="px-2 py-1 rounded-[7px] text-xs text-[var(--text-2)] hover:bg-[var(--border)] transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
