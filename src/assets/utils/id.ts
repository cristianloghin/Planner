/**
 * Unique id for client-created entities. A real UUID so the same id is usable as
 * a Postgres `uuid` primary key when the row is persisted to Supabase — the app
 * mints the id, the DB stores it verbatim, no mapping table needed.
 */
export function uid(): string {
  return crypto.randomUUID()
}
