/**
 * TEMPORARY dev-only instrumentation for the iOS "scroller stops scrolling"
 * bug. Draws an overlay above the tab bar with the scroller's live state and
 * one summary line per touch gesture, as the browser saw it *after* every
 * handler ran. A vertical gesture that produced no scroll while the scroller
 * had room to move is counted as LOST. Not for commit.
 */
export function attachGestureDebug(
  el: HTMLElement,
  strip: HTMLElement,
  getMode: () => string,
): () => void {
  if (!import.meta.env.DEV) return () => {}

  const box = document.createElement('pre')
  box.style.cssText =
    'position:fixed;left:0;right:0;bottom:72px;z-index:99999;margin:0;padding:6px;' +
    'font:10px/1.3 ui-monospace,monospace;background:rgba(0,0,0,.8);color:#7f7;' +
    'pointer-events:none;white-space:pre-wrap;max-height:42vh;overflow:hidden'
  const kick = document.createElement('button')
  kick.textContent = 'kick +100'
  kick.style.cssText =
    'position:fixed;right:8px;bottom:calc(42vh + 80px);z-index:100000;pointer-events:auto;' +
    'font:11px monospace;padding:4px 8px'
  document.body.append(box, kick)

  const log: string[] = []
  let scrolls = 0
  let gesture = 0
  let lost = 0
  const push = (s: string) => {
    log.push(s)
    if (log.length > 12) log.shift()
    render()
  }
  const render = () => {
    const cs = getComputedStyle(document.body)
    const vv = window.visualViewport
    box.textContent = [
      `mode=${getMode()} top=${el.scrollTop} sh=${el.scrollHeight} ch=${el.clientHeight} scrolls=${scrolls} LOST=${lost}`,
      `winY=${window.scrollY} vv.scale=${vv?.scale} vv.top=${vv?.offsetTop} vv.h=${vv?.height} inner=${innerHeight}`,
      `body.pe=${cs.pointerEvents} body.ov=${cs.overflow} el.ta=${getComputedStyle(el).touchAction}`,
      `strip.tf=${strip.style.transform || '-'}|${strip.style.transition || '-'} el.top=${Math.round(el.getBoundingClientRect().top)}`,
      ...log,
    ].join('\n')
  }

  // Per-gesture bookkeeping, summarised on touchend.
  let g = {
    x0: 0,
    y0: 0,
    x: 0,
    y: 0,
    top0: 0,
    scrolls0: 0,
    moves: 0,
    prevented: 0,
    nonCancelable: 0,
    maxTouches: 0,
    tf0: '',
    target: '',
  }
  const onTouch = (e: TouchEvent) => {
    const t = e.touches[0] ?? e.changedTouches[0]
    if (e.type === 'touchstart' && e.touches.length === 1) {
      gesture++
      const tg = e.target as HTMLElement
      const cls = typeof tg.className === 'string' ? tg.className.slice(0, 10) : ''
      g = {
        x0: t.clientX,
        y0: t.clientY,
        x: t.clientX,
        y: t.clientY,
        top0: el.scrollTop,
        scrolls0: scrolls,
        moves: 0,
        prevented: 0,
        nonCancelable: 0,
        maxTouches: 1,
        tf0: strip.style.transform || '-',
        target: `${tg.tagName}.${cls}`,
      }
      return
    }
    g.maxTouches = Math.max(g.maxTouches, e.touches.length)
    if (e.type === 'touchmove') {
      g.moves++
      g.x = t.clientX
      g.y = t.clientY
      if (e.defaultPrevented) g.prevented++
      if (!e.cancelable) g.nonCancelable++
      return
    }
    if (e.touches.length > 0) return // a finger is still down
    const dx = Math.round(g.x - g.x0)
    const dy = Math.round(g.y - g.y0)
    const dScroll = scrolls - g.scrolls0
    const maxTop = el.scrollHeight - el.clientHeight
    const vertical = Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 30
    const hadRoom = dy > 0 ? g.top0 > 0 : g.top0 < maxTop - 1
    const isLost = vertical && g.maxTouches === 1 && dScroll === 0 && hadRoom
    if (isLost) lost++
    push(
      `#${gesture} ${e.type} dx=${dx} dy=${dy} n=${g.maxTouches} mv=${g.moves} prev=${g.prevented} ` +
        `nc=${g.nonCancelable} m=${getMode()} tf0=${g.tf0} top ${g.top0}->${el.scrollTop} ` +
        `sc=${dScroll} ${g.target}${isLost ? ' *** LOST ***' : ''}`,
    )
  }
  const onScroll = () => {
    scrolls++
  }
  const onKick = () => {
    const before = el.scrollTop
    el.scrollTop = before + 100
    push(`kick ${before} -> ${el.scrollTop}`)
  }

  // Bubble phase on window: sees the event after every handler on the path,
  // so `defaultPrevented` reflects what the browser was told.
  const types = ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const
  for (const t of types) window.addEventListener(t, onTouch, { passive: true })
  el.addEventListener('scroll', onScroll, { passive: true })
  kick.addEventListener('click', onKick)
  const timer = window.setInterval(render, 250)
  render()

  return () => {
    for (const t of types) window.removeEventListener(t, onTouch)
    el.removeEventListener('scroll', onScroll)
    kick.removeEventListener('click', onKick)
    window.clearInterval(timer)
    box.remove()
    kick.remove()
  }
}
