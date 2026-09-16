/**
 * Swiping between days and pinching to zoom.
 *
 * Owns the touch handling for the three-page deck the calendar screens use —
 * previous, current, next — plus the pinch zoom and the hour height it leaves
 * behind in local storage. Knows nothing about what is on the pages.
 */
import {
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react'
import { useLatest } from '../../assets/hooks/useLatest'

// Timeline zoom scale. The hour height is user-zoomable (pinch); the default
// must match --hour-h in tokens.css for the very first paint.
export const DEFAULT_HOUR_H = 56
export const MIN_HOUR_H = 28
export const MAX_HOUR_H = 160

// Past this much horizontal travel a touch is a swipe (not a tap/scroll);
// the slide animation that commits the change runs for this many ms.
const SWIPE_COMMIT = 60
const SWIPE_SLIDE_MS = 200

export const clampZoom = (h: number) => Math.min(MAX_HOUR_H, Math.max(MIN_HOUR_H, h))

/** Last zoom level the user pinched to (stored under `key`), or the default. */
export function loadZoom(key: string): number {
  if (typeof localStorage === 'undefined') return DEFAULT_HOUR_H
  const raw = Number(localStorage.getItem(key))
  return raw ? clampZoom(raw) : DEFAULT_HOUR_H
}

/**
 * Props for a swipe-strip page: the off-screen pages become inert —
 * unfocusable and hidden from assistive tech — so tabbing (or any
 * programmatic focus) can't reach a hidden page and scroll it into view,
 * knocking the strip off center. Duplicated content also stays out of the
 * accessibility tree.
 */
export function pageInert(active: boolean): HTMLAttributes<HTMLElement> {
  // `inert: ''` sets the boolean attribute through React 18's unknown-attr
  // passthrough; React 19 types it as a real boolean prop, so this cast (and
  // the empty-string value) can go once the app upgrades.
  return active ? {} : ({ inert: '', 'aria-hidden': true } as HTMLAttributes<HTMLElement>)
}

/**
 * Where `content` starts inside `scroller`, in scroll coordinates: the
 * scrollTop at which the content's top edge meets the scroller's top edge.
 * Anything in flow above the content (a sticky band, padding) moves it, so
 * minute-to-pixel maths must be offset by it rather than assume zero.
 */
export function scrollOrigin(scroller: HTMLElement, content: HTMLElement): number {
  return (
    content.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
  )
}

/** Pinch-to-zoom wiring for a timeline's user-zoomable hour height. */
export interface SwipeZoom {
  hourH: number
  setHourH: (h: number) => void
  /** localStorage key the zoom level persists under. */
  key: string
}

/**
 * The touch-gesture machinery shared by the swipeable views (Day, Week,
 * Month): swipe horizontally to navigate, and — for the timeline views that
 * wire up `zoom` — pinch to zoom the hour height. The browser keeps vertical
 * panning (callers set `touch-action: pan-y` on the scroller).
 *
 * `scrollRef` is the vertical scroll container the listeners bind to.
 * `stripRef` is a three-page strip (previous | current | next, one
 * container-width each) that a drag slides sideways, so the neighbor's real
 * content follows the finger. `followRefs` are further strips laid out the
 * same way (a sticky all-day band above the pages) that get every transform
 * the main strip gets, so they move as one. When a swipe
 * commits, the strip animates one page over, `onNavigate` fires (+1 =
 * forward, -1 = back), and once the caller has re-rendered — detected by
 * `pageKey` changing — a layout effect recenters the strip before paint. The
 * recentered middle page renders exactly what the slide revealed, so the swap
 * is invisible.
 *
 * Returns a capture-phase click handler for the scroll container that eats the
 * synthetic click after a drag, so a swipe never doubles as a tap.
 */
export function useSwipeGestures({
  scrollRef,
  stripRef,
  followRefs,
  pageKey,
  onNavigate,
  zoom,
}: {
  scrollRef: RefObject<HTMLDivElement>
  stripRef: RefObject<HTMLDivElement>
  followRefs?: RefObject<HTMLElement>[]
  /** Identifies the current page (ISO date, week start, month cursor). */
  pageKey: string
  onNavigate: (delta: 1 | -1) => void
  zoom?: SwipeZoom
}) {
  // Mirrors for the native touch listeners, which bind once and would
  // otherwise close over stale values mid-gesture.
  const zoomRef = useLatest(zoom)
  const onNavigateRef = useLatest(onNavigate)
  const followRef = useLatest(followRefs)

  /** Every strip that slides: the main one plus any followers mounted now. */
  function strips(main: HTMLElement): HTMLElement[] {
    const followers = (followRef.current ?? []).flatMap((r) => (r.current ? [r.current] : []))
    return [main, ...followers]
  }

  /** Put every strip in the same place at once. */
  function slide(main: HTMLElement, transition: string, transform: string) {
    for (const el of strips(main)) {
      el.style.transition = transition
      el.style.transform = transform
    }
  }

  const g = useRef({
    mode: 'none' as 'none' | 'decide' | 'swipe' | 'pinch',
    x0: 0,
    y0: 0,
    dx: 0,
    moved: false,
    // pinch
    dist0: 0,
    hour0: DEFAULT_HOUR_H,
    focalMin: 0,
    focalOff: 0,
  })
  // Set after a real swipe/drag so the synthetic click doesn't add an event.
  const suppressClick = useRef(false)
  // Pinch focal point, consumed by the layout effect that re-pins scroll below.
  const pinchAnchor = useRef<{ focalMin: number; focalOff: number } | null>(null)
  // A committed swipe has fired onNavigate; recenter once the new page lands.
  const pendingRecenter = useRef(false)

  // After a committed swipe, the strip sits one page over showing the
  // neighbor. The re-render triggered by onNavigate makes the *middle* page
  // that same content; snap the strip back before the browser paints it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reruns when the caller lands on a new page; the refs are stable
  useLayoutEffect(() => {
    if (!pendingRecenter.current) return
    pendingRecenter.current = false
    const strip = stripRef.current
    if (!strip) return
    slide(strip, 'none', 'translateX(0)')
  }, [pageKey])

  // Keep the focal point fixed while a pinch changes the timeline height. Runs
  // after the DOM has the new heights, so the math uses the post-zoom scale.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reruns only when the zoom height lands; scrollRef is a stable ref
  useLayoutEffect(() => {
    const a = pinchAnchor.current
    const el = scrollRef.current
    const strip = stripRef.current
    if (!a || !el || !strip || !zoom) return
    el.scrollTop = scrollOrigin(el, strip) + a.focalMin * (zoom.hourH / 60) - a.focalOff
  }, [zoom?.hourH])

  // biome-ignore lint/correctness/useExhaustiveDependencies: the listeners bind once and read live values through refs (hourHRef, onNavigateRef, g)
  useEffect(() => {
    const el = scrollRef.current
    const grid = stripRef.current
    if (!el || !grid) return

    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)

    const onStart = (e: TouchEvent) => {
      const st = g.current
      // A pending suppression is only meant for the synthetic click of the
      // *previous* gesture; if the browser never fired one, don't let the
      // stale flag eat this new tap's click.
      suppressClick.current = false
      if (e.touches.length === 2) {
        const z = zoomRef.current
        if (!z) return // no zoom wired (list/month views): ignore multi-touch
        const rect = el.getBoundingClientRect()
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
        st.mode = 'pinch'
        st.dist0 = dist(e.touches)
        st.hour0 = z.hourH
        st.focalOff = midY - rect.top
        st.focalMin = (el.scrollTop + st.focalOff - scrollOrigin(el, grid)) / (z.hourH / 60)
        slide(grid, 'none', '')
      } else if (e.touches.length === 1) {
        st.mode = 'decide'
        st.x0 = e.touches[0].clientX
        st.y0 = e.touches[0].clientY
        st.dx = 0
        st.moved = false
      }
    }

    const onMove = (e: TouchEvent) => {
      const st = g.current
      const z = zoomRef.current
      if (st.mode === 'pinch' && e.touches.length === 2 && z) {
        e.preventDefault()
        const next = clampZoom((st.hour0 * dist(e.touches)) / st.dist0)
        pinchAnchor.current = { focalMin: st.focalMin, focalOff: st.focalOff }
        z.setHourH(next)
        return
      }
      if (st.mode === 'decide') {
        const dx = e.touches[0].clientX - st.x0
        const dy = e.touches[0].clientY - st.y0
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        // Horizontal intent → swipe; otherwise hand back to native scrolling.
        st.mode = Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'none'
        if (st.mode === 'none') return
      }
      if (st.mode === 'swipe') {
        e.preventDefault()
        st.dx = e.touches[0].clientX - st.x0
        st.moved = true
        slide(grid, 'none', `translateX(${st.dx}px)`)
      }
    }

    const onEnd = () => {
      const st = g.current
      if (st.mode === 'pinch') {
        pinchAnchor.current = null
        const z = zoomRef.current
        if (z) localStorage.setItem(z.key, String(z.hourH))
        st.mode = 'none'
        return
      }
      if (st.mode === 'swipe') {
        if (st.moved) suppressClick.current = true
        // One page = a third of the strip (the strip may be narrower than the
        // scroll container — e.g. the Day view's grid sits beside the gutter).
        const w = grid.clientWidth / 3
        if (Math.abs(st.dx) > SWIPE_COMMIT) {
          // Finish sliding the neighbor into place, then navigate; the layout
          // effect above recenters the strip once the new page has rendered.
          const dir = st.dx < 0 ? -1 : 1
          slide(grid, `transform ${SWIPE_SLIDE_MS}ms ease`, `translateX(${dir * w}px)`)
          window.setTimeout(() => {
            pendingRecenter.current = true
            onNavigateRef.current(-dir as 1 | -1)
          }, SWIPE_SLIDE_MS)
        } else {
          slide(grid, `transform ${SWIPE_SLIDE_MS}ms ease`, 'translateX(0)')
        }
      }
      st.mode = 'none'
    }

    const noGesture = (e: Event) => e.preventDefault()

    // passive:false so the pinch/swipe handlers can preventDefault the browser's
    // own pinch-zoom and horizontal overscroll.
    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    el.addEventListener('gesturestart', noGesture) // iOS Safari pinch-zoom
    // const detachDebug = attachGestureDebug(el, grid, () => g.current.mode) // TEMP
    return () => {
      // detachDebug() // TEMP
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
      el.removeEventListener('gesturestart', noGesture)
    }
  }, [])

  function onClickCapture(e: ReactMouseEvent) {
    if (suppressClick.current) {
      suppressClick.current = false
      e.stopPropagation()
      e.preventDefault()
    }
  }

  return { onClickCapture }
}
