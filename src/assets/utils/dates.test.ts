import { describe, expect, it } from 'vitest'
import { isoWeekNumber } from './dates'

describe('isoWeekNumber', () => {
  it('numbers ordinary mid-year weeks', () => {
    expect(isoWeekNumber('2026-08-03')).toBe(32) // a Monday
    expect(isoWeekNumber('2026-08-09')).toBe(32) // its Sunday, same week
  })

  it('puts early January in week 1 only when the week holds the first Thursday', () => {
    expect(isoWeekNumber('2026-01-01')).toBe(1) // Thu — week 1 starts Mon 2025-12-29
    expect(isoWeekNumber('2025-12-29')).toBe(1)
    expect(isoWeekNumber('2027-01-01')).toBe(53) // Fri — still 2026's last week
    expect(isoWeekNumber('2027-01-04')).toBe(1)
  })

  it('handles 53-week years', () => {
    expect(isoWeekNumber('2026-12-28')).toBe(53) // 2026 has 53 ISO weeks
    expect(isoWeekNumber('2024-12-30')).toBe(1) // 2024 has 52 — Dec 30 rolls into 2025 W1
  })
})
