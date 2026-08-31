/**
 * The recurrence engine.
 *
 * Everything about when a repeating event actually happens, and whether a given
 * day of it is done or held up. Fed events, per-day state and dates; it fetches
 * nothing and holds nothing.
 *
 * - ./timing — where a single event sits in time
 * - ./expand — which days a repeat rule produces
 * - ./status — whether a day counts as done, and what is blocking it
 */
export * from './timing'
export * from './expand'
export * from './status'
