import { describe, expect, it } from 'vitest'
import { clampNumber, normalizeNumber } from './NumberField'

describe('clampNumber', () => {
  it('applies both bounds when present', () => {
    expect(clampNumber(5, 1, 59)).toBe(5)
    expect(clampNumber(0, 1, 59)).toBe(1)
    expect(clampNumber(99, 1, 59)).toBe(59)
  })

  it('leaves an unbounded side alone', () => {
    expect(clampNumber(-3, undefined, 10)).toBe(-3)
    expect(clampNumber(1000, 1, undefined)).toBe(1000)
  })
})

describe('normalizeNumber', () => {
  it('falls back for empty/blank/invalid text', () => {
    expect(normalizeNumber('', { min: 1 })).toBe(1)
    expect(normalizeNumber('   ', { min: 1 })).toBe(1)
    expect(normalizeNumber('abc', { min: 1 })).toBe(1)
  })

  it('prefers an explicit fallback over min', () => {
    expect(normalizeNumber('', { min: 0, fallback: 30 })).toBe(30)
  })

  it('defaults the fallback to min, then 0', () => {
    expect(normalizeNumber('', { min: 5 })).toBe(5)
    expect(normalizeNumber('', {})).toBe(0)
  })

  it('clamps a typed value into range', () => {
    expect(normalizeNumber('0', { min: 1 })).toBe(1)
    expect(normalizeNumber('75', { min: 0, max: 59 })).toBe(59)
    expect(normalizeNumber('15', { min: 0, max: 59 })).toBe(15)
  })
})
