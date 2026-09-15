import { describe, expect, it, vi } from 'vitest'
import { type SessionSource, type SignedInUser, createSessionStore } from './store'

const alice: SignedInUser = { id: 'u1', email: 'alice@example.com' }

/** A session source driven by hand, so no network or timers are involved. */
function stubSource() {
  let resolveRead: (user: SignedInUser | null) => void = () => {}
  let rejectRead: (e: unknown) => void = () => {}
  const listeners = new Set<(user: SignedInUser | null) => void>()
  const unsubscribed = vi.fn()

  const source: SessionSource = {
    read: () =>
      new Promise<SignedInUser | null>((resolve, reject) => {
        resolveRead = resolve
        rejectRead = reject
      }),
    subscribe: (onChange) => {
      listeners.add(onChange)
      return () => {
        listeners.delete(onChange)
        unsubscribed()
      }
    },
  }
  return {
    source,
    unsubscribed,
    finishRead: (user: SignedInUser | null) => resolveRead(user),
    failRead: () => rejectRead(new Error('offline')),
    emit: (user: SignedInUser | null) => {
      for (const l of listeners) l(user)
    },
  }
}

describe('session store', () => {
  it('starts as not-yet-known rather than signed out', () => {
    const store = createSessionStore(stubSource().source)
    expect(store.getSnapshot()).toEqual({ user: null, loading: true })
  })

  it('settles on whoever the first read finds', async () => {
    const stub = stubSource()
    const store = createSessionStore(stub.source)
    store.start()
    stub.finishRead(alice)
    await Promise.resolve()
    expect(store.getSnapshot()).toEqual({ user: alice, loading: false })
  })

  it('treats an unreadable session as signed out, not as still loading', async () => {
    // Otherwise a failed read leaves the app on a spinner forever.
    const stub = stubSource()
    const store = createSessionStore(stub.source)
    store.start()
    stub.failRead()
    await Promise.resolve()
    await Promise.resolve()
    expect(store.getSnapshot()).toEqual({ user: null, loading: false })
  })

  it('a sign-in arriving before the first read is not overwritten by it', async () => {
    const stub = stubSource()
    const store = createSessionStore(stub.source)
    store.start()
    stub.emit(alice)
    expect(store.getSnapshot().user).toEqual(alice)
    stub.finishRead(alice)
    await Promise.resolve()
    expect(store.getSnapshot().user).toEqual(alice)
  })

  it('tells listeners when the session changes', async () => {
    const stub = stubSource()
    const store = createSessionStore(stub.source)
    const listener = vi.fn()
    store.subscribe(listener)
    store.start()
    stub.emit(alice)
    expect(listener).toHaveBeenCalledTimes(1)
    stub.emit(null)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('says nothing when a change leaves the same person signed in', () => {
    // A token refresh emits a new session for the same user. Passing that on
    // would re-render everything that reads the session, roughly hourly.
    const stub = stubSource()
    const store = createSessionStore(stub.source)
    store.start()
    stub.emit(alice)
    const listener = vi.fn()
    store.subscribe(listener)
    stub.emit({ ...alice })
    expect(listener).not.toHaveBeenCalled()
    expect(store.getSnapshot().user).toEqual(alice)
  })

  it('hands the same snapshot back until something differs', () => {
    const stub = stubSource()
    const store = createSessionStore(stub.source)
    store.start()
    stub.emit(alice)
    expect(store.getSnapshot()).toBe(store.getSnapshot())
  })

  it('answers outside React too', () => {
    const stub = stubSource()
    const store = createSessionStore(stub.source)
    store.start()
    stub.emit(alice)
    expect(store.getUser()).toEqual(alice)
  })

  it('stops listening when stopped, and ignores anything after', async () => {
    const stub = stubSource()
    const store = createSessionStore(stub.source)
    const stop = store.start()
    stop()
    expect(stub.unsubscribed).toHaveBeenCalled()
    stub.finishRead(alice)
    await Promise.resolve()
    expect(store.getSnapshot()).toEqual({ user: null, loading: true })
  })
})
