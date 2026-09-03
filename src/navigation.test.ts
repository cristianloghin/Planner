import { describe, expect, it } from 'vitest'
import { stepDay, visibleDateAt, visibleDateOn } from './navigation'

describe('visible date', () => {
  it('starts on the week containing today, with today selected', () => {
    // 2026-07-09 is a Thursday.
    expect(visibleDateOn(new Date('2026-07-09T12:00:00'))).toEqual({
      weekStart: '2026-07-06',
      selectedDay: 3,
    })
  })

  it("stepping back from Monday lands on the previous week's Sunday", () => {
    expect(stepDay({ weekStart: '2026-07-06', selectedDay: 0 }, -1)).toEqual({
      weekStart: '2026-06-29',
      selectedDay: 6,
    })
  })

  it("stepping forward from Sunday lands on the next week's Monday", () => {
    expect(stepDay({ weekStart: '2026-07-06', selectedDay: 6 }, 1)).toEqual({
      weekStart: '2026-07-13',
      selectedDay: 0,
    })
  })

  it('going to a date lands on its week with that day selected', () => {
    // 2026-07-23 is a Thursday.
    expect(visibleDateAt('2026-07-23')).toEqual({ weekStart: '2026-07-20', selectedDay: 3 })
  })
})
