/**
 * Arranging a day's blocks so overlapping ones can share the hour.
 *
 * Blocks that overlap are put in a cluster and dealt out into as few columns as
 * the cluster needs, so two events at the same time each get a column of their
 * own and an hour with nothing else in it gets the whole width. Each block is
 * also told where it comes in its cluster by start time, for when the columns
 * are drawn overlapping and the later one has to sit on top.
 *
 * Pure geometry: minutes in, columns out.
 */
import type { DayOccurrence } from '../recurrence'

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
  /**
   * Where the block comes in its cluster, by start time: 0 for the earliest.
   * A column is not that — a block can land in the first column because an
   * earlier one there has ended — so a view that stacks blocks uses this.
   */
  order: number
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
    // The cluster is already in start order.
    const orderOf = new Map(cluster.map((b, i) => [b, i]))
    columns.forEach((c, ci) =>
      c.forEach((block) =>
        result.push({ block, col: ci, cols: n, order: orderOf.get(block) as number }),
      ),
    )
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
