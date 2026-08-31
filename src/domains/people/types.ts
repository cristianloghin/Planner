/**
 * The people in an account.
 *
 * The database rows already have the shape the app wants, so these are the
 * client's own declarations rather than a second copy that would drift away
 * from them. A domain re-declares a type when it genuinely differs — see
 * domains/events, where a Series becomes something else.
 */
export type { Person, PersonId, PersonKind } from '../../client/people'
