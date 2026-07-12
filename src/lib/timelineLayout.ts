import type { DayOccurrence } from './recurrence'

/** Minutes in a day — the vertical extent of a timeline column. */
export const DAY_MIN = 24 * 60

/** A timed occurrence clamped to the current day, ready to lay out. */
export interface TimeBlock {
  occ: DayOccurrence
  start: number
  end: number
}

export interface LaidBlock {
  block: TimeBlock
  col: number
  cols: number
}

/** Greedy column layout so overlapping blocks in one column sit side by side. */
export function layoutBlocks(blocks: TimeBlock[]): LaidBlock[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end)
  const result: LaidBlock[] = []
  let cluster: TimeBlock[] = []
  let clusterEnd = -1

  const flush = () => {
    const columns: TimeBlock[][] = []
    for (const b of cluster) {
      let placed = false
      for (const c of columns) {
        if (c[c.length - 1].end <= b.start) {
          c.push(b)
          placed = true
          break
        }
      }
      if (!placed) columns.push([b])
    }
    const n = columns.length
    columns.forEach((c, ci) => c.forEach((block) => result.push({ block, col: ci, cols: n })))
  }

  for (const b of sorted) {
    if (cluster.length && b.start >= clusterEnd) {
      flush()
      cluster = []
      clusterEnd = -1
    }
    cluster.push(b)
    clusterEnd = Math.max(clusterEnd, b.end)
  }
  if (cluster.length) flush()
  return result
}
