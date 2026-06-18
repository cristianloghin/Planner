/** Short, good-enough unique id for client-created entities. */
export function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}
