/**
 * The people in an account, and how this user sees them.
 *
 * The database rows already have the shape the app wants, so these are the
 * client's own declarations rather than a second copy that would drift away
 * from them. A domain re-declares a type when it genuinely differs — see
 * domains/events, where a Series becomes something else.
 *
 * `Preferences` is this user's own document for the account: their colour for
 * each person, and — the one thing in it that is not about people — the
 * device timezone reminders are timed against. It rides here because the
 * document is saved whole, and a document with two owners would have two
 * writers.
 */
export type { Person, PersonId } from '../../client/people'
export type { Preferences } from '../../client/preferences'
