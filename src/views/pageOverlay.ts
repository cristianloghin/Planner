import { type ComponentType, type ReactNode, createContext } from 'react'

/**
 * How to draw over the deck page a component sits on. The calendar frame
 * clips each page at the gutter's edge so a swipe cannot paint over the time
 * labels; anything that must cross that edge (a "now" line's dot, centred on
 * it) goes through this slot instead, which the frame lays over the page,
 * slides with it, and keeps out of the way of pointer events. The frame
 * provides its page's slot; a timeline fills it. Null outside a frame.
 */
export const PageOverlayContext = createContext<ComponentType<{ children?: ReactNode }> | null>(
  null,
)
