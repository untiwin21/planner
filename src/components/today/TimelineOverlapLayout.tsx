'use client'

import { useEffect } from 'react'

type TimelineSide = 'plan' | 'actual'

type TimelineBlock = {
  element: HTMLElement
  start: number
  end: number
  side: TimelineSide
  column: number
}

const BLOCK_CLASS = 'rounded-[9px]'
const SIDE_WIDTH = 50
const GUTTER_PX = 2

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
      side: detectSide(child, canvas),
      column: 0,
    }]
  })
}

function splitIntoOverlapClusters(blocks: TimelineBlock[]): TimelineBlock[][] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end)
  const clusters: TimelineBlock[][] = []
  let cluster: TimelineBlock[] = []
  let clusterEnd = Number.NEGATIVE_INFINITY

  for (const block of sorted) {
    if (cluster.length > 0 && block.start >= clusterEnd) {
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
    let column = columnEnds.findIndex(end => end <= block.start)
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
  const blocks = collectBlocks(canvas)
  for (const side of ['plan', 'actual'] as const) {
    const sideBlocks = blocks.filter(block => block.side === side)
    for (const cluster of splitIntoOverlapClusters(sideBlocks)) layoutCluster(cluster)
  }
}

export function TimelineOverlapLayout() {
  useEffect(() => {
    let frame = 0
    const layoutAll = () => {
      frame = 0
      findTimelineCanvases().forEach(layoutTimeline)
    }
    const scheduleLayout = () => {
      if (frame) return
      frame = window.requestAnimationFrame(layoutAll)
    }

    scheduleLayout()
    window.addEventListener('resize', scheduleLayout)
    const observer = new MutationObserver(scheduleLayout)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    })

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', scheduleLayout)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return null
}
