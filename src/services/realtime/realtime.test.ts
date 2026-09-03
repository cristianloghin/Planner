import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type RealtimeChange, startRealtime } from './index'

/** A connection driven by hand: no network, no real waiting. */
function stubConnection() {
  let emit: (table?: string) => void = () => {}
  const closed = vi.fn()
  return {
    subscribe: (onChange: (table?: string) => void) => {
      emit = onChange
      return closed
    },
    closed,
    change: (table?: string) => emit(table),
  }
}

describe('startRealtime', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('says nothing until things go quiet', () => {
    const conn = stubConnection()
    const onChanged = vi.fn()
    startRealtime({ subscribe: conn.subscribe, onChanged })

    conn.change('event_series')
    expect(onChanged).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('folds one save’s tables into a single report', () => {
    // A partner saving an event touches several tables in the same moment.
    const conn = stubConnection()
    const onChanged = vi.fn<(change: RealtimeChange) => void>()
    startRealtime({ subscribe: conn.subscribe, onChanged })

    conn.change('event_series')
    conn.change('event_person')
    conn.change('checklist_item')
    conn.change('event_series')
    vi.advanceTimersByTime(200)

    expect(onChanged).toHaveBeenCalledTimes(1)
    expect([...onChanged.mock.calls[0][0].tables].sort()).toEqual([
      'checklist_item',
      'event_person',
      'event_series',
    ])
  })

  it('waits for the end of a burst, not the start', () => {
    const conn = stubConnection()
    const onChanged = vi.fn()
    startRealtime({ subscribe: conn.subscribe, onChanged })

    conn.change('a')
    vi.advanceTimersByTime(150)
    conn.change('b')
    vi.advanceTimersByTime(150)
    expect(onChanged).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50)
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('reports a reconnection as everything possibly missed', () => {
    const conn = stubConnection()
    const onChanged = vi.fn<(change: RealtimeChange) => void>()
    startRealtime({ subscribe: conn.subscribe, onChanged })

    conn.change(undefined)
    vi.advanceTimersByTime(200)

    expect(onChanged.mock.calls[0][0]).toEqual({ tables: new Set(), missedSome: true })
  })

  it('keeps the named tables alongside a reconnection', () => {
    const conn = stubConnection()
    const onChanged = vi.fn<(change: RealtimeChange) => void>()
    startRealtime({ subscribe: conn.subscribe, onChanged })

    conn.change('event_series')
    conn.change(undefined)
    vi.advanceTimersByTime(200)

    const change = onChanged.mock.calls[0][0]
    expect(change.missedSome).toBe(true)
    expect([...change.tables]).toEqual(['event_series'])
  })

  it('starts each report empty rather than repeating the last one', () => {
    const conn = stubConnection()
    const onChanged = vi.fn<(change: RealtimeChange) => void>()
    startRealtime({ subscribe: conn.subscribe, onChanged })

    conn.change('a')
    vi.advanceTimersByTime(200)
    conn.change('b')
    vi.advanceTimersByTime(200)

    expect([...onChanged.mock.calls[1][0].tables]).toEqual(['b'])
    expect(onChanged.mock.calls[1][0].missedSome).toBe(false)
  })

  it('closes the connection when stopped, and reports nothing after', () => {
    const conn = stubConnection()
    const onChanged = vi.fn()
    const stop = startRealtime({ subscribe: conn.subscribe, onChanged })

    conn.change('a')
    stop()
    vi.advanceTimersByTime(1000)

    expect(conn.closed).toHaveBeenCalledTimes(1)
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('honours a different quiet period', () => {
    const conn = stubConnection()
    const onChanged = vi.fn()
    startRealtime({ subscribe: conn.subscribe, onChanged, quietMs: 1000 })

    conn.change('a')
    vi.advanceTimersByTime(200)
    expect(onChanged).not.toHaveBeenCalled()
    vi.advanceTimersByTime(800)
    expect(onChanged).toHaveBeenCalledTimes(1)
  })
})
