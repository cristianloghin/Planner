/**
 * The recurrence engine.
 *
 * Everything about when a repeating event actually happens. Fed events, per-day
 * state and dates; it fetches nothing and holds nothing.
 *
 * - ./timing — where a single event sits in time
 * - ./expand — which days a repeat rule produces
 * - ./split — the two halves of a series cut at one of its days
 */
export * from './timing'
export * from './expand'
export * from './split'
