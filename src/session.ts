/**
 * Where the session comes from: the auth client, shaped for the session service.
 *
 * The service is fed rather than importing the client itself (R4), and this is
 * the one place the two meet. Handed to `SessionProvider` in main.tsx.
 */
import { type Session, getSession, onSessionChange } from './client/auth'
import type { SessionSource, SignedInUser } from './services/session'

function toUser(session: Session | null): SignedInUser | null {
  return session ? { id: session.user.id, email: session.user.email ?? null } : null
}

export const sessionSource: SessionSource = {
  read: async () => toUser(await getSession()),
  subscribe: (onChange) => onSessionChange((session) => onChange(toUser(session))),
}
