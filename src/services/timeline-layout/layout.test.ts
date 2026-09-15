import { describe, expect, it } from 'vitest'
import type { DayOccurrence } from '../recurrence'
import { type TimeBlock, layoutBlocks } from './index'

// The layout reads only start and end; the occurrence is along for the ride.
const block = (id: string, start: number, end: number): TimeBlock => ({
  occ: { event: { id } } as unknown as DayOccurrence,
  start,
  end,
})

const byId = (laid: ReturnType<typeof layoutBlocks>) =>
  Object.fromEntries(laid.map((l) => [l.block.occ.event.id, l]))

describe('layoutBlocks', () => {
  it('deals an overlap cluster into columns, in start order', () => {
    // A long one, two inside it, and a fourth that starts after the long one
    // ends but still overlaps the third — so it fits back into column 0.
    const laid = byId(
      layoutBlocks([
        block('long', 540, 800),
        block('second', 780, 840),
        block('third', 790, 1050),
        block('fourth', 990, 1050),
      ]),
    )
    expect(laid.long).toMatchObject({ col: 0, cols: 3, order: 0 })
    expect(laid.second).toMatchObject({ col: 1, order: 1 })
    expect(laid.third).toMatchObject({ col: 2, order: 2 })
    // Back in the first column, yet last by start — so it is drawn on top.
    expect(laid.fourth).toMatchObject({ col: 0, order: 3 })
  })

  it('starts the order afresh for each cluster', () => {
    const laid = byId(layoutBlocks([block('a', 0, 60), block('b', 120, 180)]))
    expect(laid.a).toMatchObject({ col: 0, cols: 1, order: 0 })
    expect(laid.b).toMatchObject({ col: 0, cols: 1, order: 0 })
  })
})
