'use client'
import { useMemo } from 'react'
import { formatDate } from '@/lib/dates'
import { weeklyMetrics, FOCUS_CATEGORIES } from '@/lib/weeklyMetrics'
import { isRoutineScheduledOn } from '@/lib/routineSchedule'
import type { DayEntry, Routine, RoutineLog, ShortGoal } from '@/types'

const COLORS = ['#6756c7', '#159b91', '#e9864d']
const dayLabel = (date: string) => ['일', '월', '화', '수', '목', '금', '토'][new Date(`${date}T12:00:00+09:00`).getUTCDay()]
const fmt = (v: number | null, suffix = '', digits = 0) => v === null ? '—' : `${v.toFixed(digits)}${suffix}`

function Trend({ values, dates, max, unit, color, reference, band, dots = false, stacks }: {
  values: (number | null)[]; dates: string[]; max: number; unit: string; color: string; reference?: number; band?: [number, number]; dots?: boolean; stacks?: (number | null)[][]
}) {
  const height = 140, top = 16, base = 111, left = 42, width = 282
  const y = (v: number) => base - Math.min(v, max) / max * (base - top)
  const x = (i: number) => left + 20 + i * (width / 7)
  return <svg viewBox={`0 0 342 ${height}`} className="w-full" role="img" aria-label={dates.map((date, i) => `${date}: ${fmt(values[i], unit, 1)}`).join(', ')}>
    {band && <rect x={left} y={y(band[1])} width={width} height={y(band[0]) - y(band[1])} fill={color} opacity=".09" />}
    {[0, max / 2, max].map(v => <g key={v}><line x1={left} x2={left + width} y1={y(v)} y2={y(v)} stroke="#e7e9ef" /><text x={left - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#7b8091">{Number(v.toFixed(1))}{unit}</text></g>)}
    {reference !== undefined && <g><line x1={left} x2={left + width} y1={y(reference)} y2={y(reference)} stroke={color} strokeDasharray="4 4" /><text x={left + width} y={y(reference) - 4} textAnchor="end" fontSize="11" fill={color}>{reference}{unit} 기준</text></g>}
    {values.map((value, i) => <g key={dates[i]}>
      {value === null ? <text x={x(i)} y={base - 6} textAnchor="middle" fontSize="12" fill="#a7acb8">—</text> : dots ? <circle cx={x(i)} cy={y(value)} r="5" fill={color}><title>{dates[i]} · {fmt(value, unit, 1)}</title></circle> : stacks ? stacks[i].map((part, k) => {
        const below = stacks[i].slice(0, k).reduce<number>((sum, v) => sum + (v ?? 0), 0)
        return <rect key={k} x={x(i) - 11} y={y(below + (part ?? 0))} width="22" height={Math.max(0, y(below) - y(below + (part ?? 0)))} fill={COLORS[k]}><title>{dates[i]} · {FOCUS_CATEGORIES[k]} {fmt(part, '시간', 1)}</title></rect>
      }) : <rect x={x(i) - 11} y={y(value)} width="22" height={base - y(value)} rx="3" fill={color}><title>{dates[i]} · {fmt(value, unit, 1)}</title></rect>}
      <text x={x(i)} y={base + 20} textAnchor="middle" fontSize="12" fill="#626779">{dayLabel(dates[i])}</text>
    </g>)}
  </svg>
}

export function WeeklySummary({ weekDays, days, routines, logs, goals = [] }: { weekDays: Date[]; days: DayEntry[]; routines: Routine[]; logs: RoutineLog[]; goals?: ShortGoal[] }) {
  const dates = weekDays.map(formatDate)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const stats = useMemo(() => weeklyMetrics(weekDays.map(formatDate), days, today, goals), [weekDays, days, today, goals])
  const focusRatings = dates.filter(d => d <= today).flatMap(date => {
    const rating = days.find(d => d.date === date)?.meta.focus
    return typeof rating === 'number' && rating >= 1 && rating <= 5 ? [rating] : []
  })
  const focusRating = focusRatings.length ? focusRatings.reduce((sum, v) => sum + v, 0) / focusRatings.length : null
  const routineOccurrences = dates.filter(d => d <= today).flatMap(date => routines.filter(r => r.created_at <= date && isRoutineScheduledOn(r, date)).map(r => ({ id: r.id, date })))
  const routineRate = routineOccurrences.length ? routineOccurrences.filter(r => logs.some(l => l.routine_id === r.id && l.date === r.date && l.done)).length / routineOccurrences.length * 100 : null
  const metrics = [
    { title: '수면시간', value: fmt(stats.sleepMean, '시간', 1), meta: `평균 · ${stats.sleepDays}일 기록${stats.sleepSd === null ? '' : ` · 변동 ±${stats.sleepSd.toFixed(1)}시간`}`, values: stats.rows.map(r => r.sleep), max: Math.max(10, ...stats.rows.map(r => r.sleep ?? 0)), unit: 'h', color: '#497ec4', band: [7.5, 8] as [number, number], note: '음영은 개인 기준 7.5–8시간. 변동은 기록한 날의 표본 표준편차이며 취침 규칙성을 뜻하지 않습니다.' },
    { title: '컨디션', value: fmt(stats.conditionMedian, ' / 5', 1), meta: `중앙값 · ${stats.conditionDays}일 기록`, values: stats.rows.map(r => r.condition), max: 5, unit: '', color: '#159b91', dots: true, note: '주관적 1–5점은 점으로 표시하고 중앙값으로 요약합니다. 작은 점수 차이를 과도하게 해석하지 않습니다.' },
    { title: '집중시간', value: fmt(stats.focusHours, '시간', 1), meta: `주간 누적 · ${stats.focusDays}일 실행 기록`, values: stats.rows.map(r => r.focusHours), max: Math.max(4, ...stats.rows.map(r => r.focusHours ?? 0)), unit: 'h', color: '#6756c7', stacks: stats.rows.map(r => FOCUS_CATEGORIES.map(c => r.focus[c] === null ? null : r.focus[c]! / 60)), note: 'Study·Project·Work의 실제 기록만 합산합니다. 세션 → 실제 총시간 → 실제 시각 → 하위 작업 합계 순으로 사용해 중복을 막습니다. 이 시간만으로 몰입의 질은 알 수 없습니다.' },
    { title: '할 일 달성률', value: fmt(stats.completion, '%'), meta: `할 일 수로 가중 · ${stats.plannedCount}개`, values: stats.rows.map(r => r.completion), max: 100, unit: '%', color: '#d69a25', note: '일정·데드라인·삭제·폐기·실행만 기록한 항목은 제외합니다. 부분 달성은 기존 규칙으로 반영하며 주간 비율은 날짜별 평균이 아닌 전체 할 일 기준입니다.' },
    { title: '자기객관화 · 시간 예측', value: fmt(stats.calibrationMedian, '%'), meta: `중앙값 · 완료 작업 ${stats.calibrationCount}개${stats.calibrationQ1 === null ? '' : ` · 중간 50% ${Math.round(stats.calibrationQ1)}–${Math.round(stats.calibrationQ3!)}%`}`, values: stats.rows.map(r => r.calibration), max: Math.max(200, ...stats.rows.map(r => r.calibration ?? 0)), unit: '%', color: '#c66563', reference: 100, dots: true, note: '실제 ÷ 예상 × 100. 150%는 예상보다 1.5배 오래 걸렸다는 뜻입니다. 완료한 할 일 중 예상·실제 시간이 모두 있는 작업만 비교합니다. 인격이나 능력 점수가 아닌 시간 예측 지표입니다.' },
  ]
  return <section aria-label="이번 주 요약">
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-base font-bold">이번 주 요약</h3><span className="text-sm text-[var(--text-3)]">{dates[0]} – {dates[dates.length - 1]}</span></div>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {metrics.map(metric => <article key={metric.title} className="min-w-0 rounded-[14px] border border-[var(--border)] bg-white p-4">
        <h4 className="text-sm font-semibold text-[var(--text-2)]">{metric.title}</h4><p className="mt-1 text-2xl font-bold tabular-nums">{metric.value}</p><p className="mt-1 text-xs text-[var(--text-3)]">{metric.meta}</p>
        <Trend {...metric} dates={dates} />
        {metric.stacks && <div className="mb-2 flex flex-wrap gap-3 text-xs">{FOCUS_CATEGORIES.map((c, i) => <span key={c} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: COLORS[i] }} />{c}</span>)}</div>}
        <p className="text-xs leading-relaxed text-[var(--text-3)]">{metric.note}</p>
      </article>)}
    </div>
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[var(--text-2)]"><span>집중력 자기평가 평균 {fmt(focusRating, ' / 5', 1)}</span><span>루틴 완료 {fmt(routineRate, '%')}</span></div>
    <p className="mt-3 text-sm text-[var(--text-3)]">미기록·미래 날짜는 —로 표시합니다. 오늘은 진행 중이며 일별 기록 기준으로 집계합니다.</p>
    <details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold text-[var(--text-2)]">날짜별 값과 계산 근거</summary>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead><tr>{['날짜', '수면', '컨디션', '집중', '달성률', '시간 예측'].map(h => <th key={h} className="border-b p-2 font-semibold">{h}</th>)}</tr></thead><tbody>{stats.rows.map(r => <tr key={r.date}>{[`${r.date} (${dayLabel(r.date)})`, fmt(r.sleep, 'h', 1), fmt(r.condition, '/5'), fmt(r.focusHours, 'h', 1), fmt(r.completion, '%'), fmt(r.calibration, '%')].map((v, i) => <td key={i} className="border-b p-2 tabular-nums">{v}</td>)}</tr>)}</tbody></table></div>
      <p className="mt-3 leading-relaxed">중앙값과 사분위 범위는 극단적으로 오래 걸린 한 작업의 영향을 줄이기 위한 표시 방식입니다. 한 주의 적은 기록으로 수면·컨디션·집중시간 사이의 인과관계나 상관계수를 추정하지 않습니다. —는 실패나 0시간이 아니라 정보 부족입니다.</p>
      <ul className="mt-3 space-y-1 text-[var(--purple)]"><li><a href="https://calnewport.com/deep-habits-should-you-track-hours-or-milestones/" target="_blank" rel="noreferrer">Cal Newport · Deep Work: 시간과 성과를 각각 추적</a></li><li><a href="https://pubmed.ncbi.nlm.nih.gov/26479070/" target="_blank" rel="noreferrer">Harkin et al. (2016) · 목표 진행 기록 메타분석</a></li><li><a href="https://bear.warrington.ufl.edu/brenner/mar7588/Papers/buehler-et-al-1994.pdf" target="_blank" rel="noreferrer">Buehler et al. (1994) · 계획 오류와 실제 소요시간</a></li><li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4434546/" target="_blank" rel="noreferrer">AASM / SRS (2015) · 성인 수면 권고</a></li></ul>
    </details>
  </section>
}
