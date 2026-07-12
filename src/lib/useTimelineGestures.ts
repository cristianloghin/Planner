import {
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react'
import { useLatest } from './useLatest'

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
 * The touch-gesture machinery shared by the timeline views (Day, Week grid):
 * swipe horizontally to navigate, pinch to zoom the hour height. The browser
 * keeps vertical panning (callers set `touch-action: pan-y` on the scroller).
 *
 * `scrollRef` is the vertical scroll container the listeners bind to;
 * `gridRef` is the element slid sideways during a swipe. `onNavigate` fires
 * when a swipe commits (+1 = forward, -1 = back) — the caller re-renders the
 * grid with the new period's content mid-slide, a one-rendered-page carousel.
 *
 * Returns a capture-phase click handler for the scroll container that eats the
 * synthetic click after a drag, so a swipe never doubles as a tap-to-add.
 */
export function useTimelineGestures({
  scrollRef,
  gridRef,
  hourH,
  setHourH,
  zoomKey,
  onNavigate,
}: {
  scrollRef: RefObject<HTMLDivElement>
  gridRef: RefObject<HTMLDivElement>
  hourH: number
  setHourH: (h: number) => void
  zoomKey: string
  onNavigate: (delta: 1 | -1) => void
}) {
  // Mirrors for the native touch listeners, which bind once and would
  // otherwise close over stale values mid-gesture.
  const hourHRef = useLatest(hourH)
  const onNavigateRef = useLatest(onNavigate)

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

  // Keep the focal point fixed while a pinch changes the timeline height. Runs
  // after the DOM has the new heights, so the math uses the post-zoom scale.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reruns only when the zoom height lands; scrollRef is a stable ref
  useLayoutEffect(() => {
    const a = pinchAnchor.current
    const el = scrollRef.current
    if (!a || !el) return
    el.scrollTop = a.focalMin * (hourH / 60) - a.focalOff
  }, [hourH])

  // biome-ignore lint/correctness/useExhaustiveDependencies: the listeners bind once and read live values through refs (hourHRef, onNavigateRef, g)
  useEffect(() => {
    const el = scrollRef.current
    const grid = gridRef.current
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
        const rect = el.getBoundingClientRect()
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
        st.mode = 'pinch'
        st.dist0 = dist(e.touches)
        st.hour0 = hourHRef.current
        st.focalOff = midY - rect.top
        st.focalMin = (el.scrollTop + st.focalOff) / (hourHRef.current / 60)
        grid.style.transition = 'none'
        grid.style.transform = ''
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
      if (st.mode === 'pinch' && e.touches.length === 2) {
        e.preventDefault()
        const next = clampZoom((st.hour0 * dist(e.touches)) / st.dist0)
        pinchAnchor.current = { focalMin: st.focalMin, focalOff: st.focalOff }
        setHourH(next)
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
        grid.style.transition = 'none'
        grid.style.transform = `translateX(${st.dx}px)`
      }
    }

    const onEnd = () => {
      const st = g.current
      if (st.mode === 'pinch') {
        pinchAnchor.current = null
        localStorage.setItem(zoomKey, String(hourHRef.current))
        st.mode = 'none'
        return
      }
      if (st.mode === 'swipe') {
        if (st.moved) suppressClick.current = true
        const w = el.clientWidth
        if (Math.abs(st.dx) > SWIPE_COMMIT) {
          // Slide the current page out the way it was dragged, swap, then slide
          // the new one in from the opposite edge — a one-rendered-page carousel.
          const dir = st.dx < 0 ? -1 : 1
          grid.style.transition = `transform ${SWIPE_SLIDE_MS}ms ease`
          grid.style.transform = `translateX(${dir * w}px)`
          window.setTimeout(() => {
            onNavigateRef.current(-dir as 1 | -1)
            grid.style.transition = 'none'
            grid.style.transform = `translateX(${-dir * w}px)`
            requestAnimationFrame(() => {
              grid.style.transition = `transform ${SWIPE_SLIDE_MS}ms ease`
              grid.style.transform = 'translateX(0)'
            })
          }, SWIPE_SLIDE_MS)
        } else {
          grid.style.transition = `transform ${SWIPE_SLIDE_MS}ms ease`
          grid.style.transform = 'translateX(0)'
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
    return () => {
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
