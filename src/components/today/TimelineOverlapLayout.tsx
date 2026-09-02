'use client'

import { useEffect } from 'react'

type TimelineSide = 'plan' | 'actual'

type TimelineBlock = {
  element: HTMLElement
  start: number
  end: number
  durationPercent: number
  side: TimelineSide
  column: number
}

const BLOCK_CLASS = 'rounded-[9px]'
const SIDE_WIDTH = 50
const GUTTER_PX = 2
const TIMELINE_MINUTES = 24 * 60
const MIN_READABLE_INTERVAL_MIN = 15
const PIXELS_PER_READABLE_INTERVAL = 24
const MIN_CANVAS_HEIGHT = (TIMELINE_MINUTES / MIN_READABLE_INTERVAL_MIN) * PIXELS_PER_READABLE_INTERVAL
const COMPACT_BLOCK_THRESHOLD_MIN = 30
const COMPACT_BLOCK_MIN_HEIGHT_PX = 20
const OVERLAP_EPSILON_PERCENT = (0.5 / TIMELINE_MINUTES) * 100

function percentage(value: string): number | null {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function blockDurationPercent(value: string): number | null {
  const match = value.match(/,\s*([\d.]+)%\s*\)/)
  if (match) return Number.parseFloat(match[1])
  if (value.endsWith('%')) return percentage(value)
  return null
}

function timelineCanvasFromHeading(heading: HTMLHeadingElement): HTMLElement | null {
  let current: HTMLElement | null = heading.parentElement
  while (current) {
    const canvas = Array.from(current.querySelectorAll<HTMLElement>('div.relative.ml-14.mr-3'))
      .find(candidate => candidate.querySelector(`:scope > .${BLOCK_CLASS.replace(/[\[\]]/g, '\\$&')}`))
    if (canvas) return canvas
    current = current.parentElement
  }
  return null
}

function findTimelineCanvases(): HTMLElement[] {
  const canvases = new Set<HTMLElement>()
  for (const heading of document.querySelectorAll<HTMLHeadingElement>('h3')) {
    if (heading.textContent?.trim() !== '계획과 실제 타임라인') continue
    const canvas = timelineCanvasFromHeading(heading)
    if (canvas) canvases.add(canvas)
  }
  return [...canvases]
}

function detectSide(element: HTMLElement, canvas: HTMLElement): TimelineSide {
  const saved = element.dataset.timelineOverlapSide
  if (saved === 'plan' || saved === 'actual') return saved

  const canvasRect = canvas.getBoundingClientRect()
  const blockRect = element.getBoundingClientRect()
  const midpoint = canvasRect.left + canvasRect.width / 2
  const side: TimelineSide = blockRect.left + blockRect.width / 2 < midpoint ? 'plan' : 'actual'
  element.dataset.timelineOverlapSide = side
  return side
}

function ensureReadableCanvasScale(canvas: HTMLElement) {
  const minHeight = `${MIN_CANVAS_HEIGHT}px`
  if (canvas.style.minHeight !== minHeight) canvas.style.minHeight = minHeight
}

function collectBlocks(canvas: HTMLElement): TimelineBlock[] {
  const canvasRect = canvas.getBoundingClientRect()
  return Array.from(canvas.children).flatMap(child => {
    if (!(child instanceof HTMLElement)) return []
    if (!child.classList.contains('absolute') || !child.classList.contains(BLOCK_CLASS)) return []
    if (!child.style.top || !child.style.height) return []

    const start = percentage(child.style.top)
    const duration = blockDurationPercent(child.style.height)
    let normalizedStart = start
    let normalizedDuration = duration

    if (normalizedStart === null || normalizedDuration === null) {
      const rect = child.getBoundingClientRect()
      if (canvasRect.height <= 0) return []
      normalizedStart = ((rect.top - canvasRect.top) / canvasRect.height) * 100
      normalizedDuration = (rect.height / canvasRect.height) * 100
    }

    return [{
      element: child,
      start: normalizedStart,
      end: normalizedStart + Math.max(normalizedDuration, 0.0001),
      durationPercent: Math.max(normalizedDuration, 0.0001),
      side: detectSide(child, canvas),
      column: 0,
    }]
  })
}

function blockDurationMinutes(block: TimelineBlock) {
  return block.durationPercent / 100 * TIMELINE_MINUTES
}

function styleReadableBlock(block: TimelineBlock) {
  const durationMinutes = blockDurationMinutes(block)
  const readableHeight = `max(${COMPACT_BLOCK_MIN_HEIGHT_PX}px, ${block.durationPercent}%)`
  if (block.element.style.height !== readableHeight) block.element.style.height = readableHeight

  const compact = durationMinutes < COMPACT_BLOCK_THRESHOLD_MIN
  const wasCompact = block.element.dataset.timelineCompact === 'true'
  if (compact) {
    block.element.dataset.timelineCompact = 'true'
    block.element.style.padding = '2px 5px'
    block.element.style.borderRadius = '6px'

    for (const node of block.element.querySelectorAll<HTMLElement>('span, p')) {
      node.style.lineHeight = '1.05'
      if (node.classList.contains('text-xs')) node.style.fontSize = '9px'
      else if (node.className.includes('text-[9px]') || node.className.includes('text-[10px]')) node.style.fontSize = '8px'
    }
  } else if (wasCompact) {
    delete block.element.dataset.timelineCompact
    block.element.style.padding = ''
    block.element.style.borderRadius = ''
    for (const node of block.element.querySelectorAll<HTMLElement>('span, p')) {
      node.style.lineHeight = ''
      node.style.fontSize = ''
    }
  }
}

function splitIntoOverlapClusters(blocks: TimelineBlock[]): TimelineBlock[][] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end)
  const clusters: TimelineBlock[][] = []
  let cluster: TimelineBlock[] = []
  let clusterEnd = Number.NEGATIVE_INFINITY

  for (const block of sorted) {
    if (cluster.length > 0 && block.start + OVERLAP_EPSILON_PERCENT >= clusterEnd) {
      clusters.push(cluster)
      cluster = []
      clusterEnd = Number.NEGATIVE_INFINITY
    }
    cluster.push(block)
    clusterEnd = Math.max(clusterEnd, block.end)
  }
  if (cluster.length > 0) clusters.push(cluster)
  return clusters
}

function layoutCluster(cluster: TimelineBlock[]) {
  const columnEnds: number[] = []
  const ordered = [...cluster].sort((a, b) => a.start - b.start || a.end - b.end)

  for (const block of ordered) {
    let column = columnEnds.findIndex(end => end <= block.start + OVERLAP_EPSILON_PERCENT)
    if (column === -1) {
      column = columnEnds.length
      columnEnds.push(block.end)
    } else {
      columnEnds[column] = block.end
    }
    block.column = column
  }

  const columnCount = Math.max(1, columnEnds.length)
  for (const block of ordered) {
    const sideOffset = block.side === 'actual' ? SIDE_WIDTH : 0
    const columnWidth = SIDE_WIDTH / columnCount
    const left = `calc(${sideOffset + block.column * columnWidth}% + ${GUTTER_PX}px)`
    const width = `calc(${columnWidth}% - ${GUTTER_PX * 2}px)`

    if (block.element.style.left !== left) block.element.style.left = left
    if (block.element.style.width !== width) block.element.style.width = width
    if (block.element.style.right !== 'auto') block.element.style.right = 'auto'
  }
}

function layoutTimeline(canvas: HTMLElement) {
  ensureReadableCanvasScale(canvas)
  const blocks = collectBlocks(canvas)
  for (const block of blocks) styleReadableBlock(block)
  for (const side of ['plan', 'actual'] as const) {
    const sideBlocks = blocks.filter(block => block.side === side)
    for (const cluster of splitIntoOverlapClusters(sideBlocks)) layoutCluster(cluster)
  }
}

export function TimelineOverlapLayout() {
  useEffect(() => {
    let frame = 0
    const canvasObservers = new Map<HTMLElement, MutationObserver>()

    const layoutAll = () => {
      frame = 0
      for (const canvas of canvasObservers.keys()) {
        if (canvas.isConnected) layoutTimeline(canvas)
      }
    }
    const scheduleLayout = () => {
      if (frame) return
      frame = window.requestAnimationFrame(layoutAll)
    }

    const syncCanvases = () => {
      const live = new Set(findTimelineCanvases())
      for (const [canvas, observer] of canvasObservers) {
        if (!live.has(canvas) || !canvas.isConnected) {
          observer.disconnect()
          canvasObservers.delete(canvas)
        }
      }
      for (const canvas of live) {
        if (canvasObservers.has(canvas)) continue
        const observer = new MutationObserver(scheduleLayout)
        observer.observe(canvas, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['style', 'class'],
        })
        canvasObservers.set(canvas, observer)
      }
      scheduleLayout()
    }

    syncCanvases()
    window.addEventListener('resize', scheduleLayout)

    // Body observation is discovery-only. Expensive style/class observation is
    // limited to actual timeline canvases instead of the entire application.
    const discoveryObserver = new MutationObserver(syncCanvases)
    discoveryObserver.observe(document.body, { subtree: true, childList: true })

    return () => {
      discoveryObserver.disconnect()
      for (const observer of canvasObservers.values()) observer.disconnect()
      canvasObservers.clear()
      window.removeEventListener('resize', scheduleLayout)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return null
}
