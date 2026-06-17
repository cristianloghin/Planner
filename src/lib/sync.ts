import type { SyncMeta } from '../types'

export function uid(): string {
  return crypto.randomUUID()
}

export function nowISO(): string {
  return new Date().toISOString()
}

/** Stamp a brand-new entity with fresh sync metadata. */
export function withMeta<T extends object>(data: T): T & SyncMeta {
  const t = nowISO()
  return { ...data, id: uid(), createdAt: t, updatedAt: t, deletedAt: null }
}

/** Bump `updatedAt` on an edited entity. */
export function touch<T extends SyncMeta>(entity: T): T {
  return { ...entity, updatedAt: nowISO() }
}

/** Mark an entity soft-deleted (kept around so the delete can sync). */
export function softDelete<T extends SyncMeta>(entity: T): T {
  const t = nowISO()
  return { ...entity, deletedAt: t, updatedAt: t }
}

/** Drop soft-deleted rows — what the UI should actually render. */
export function active<T extends SyncMeta>(xs: T[]): T[] {
  return xs.filter((x) => x.deletedAt === null)
}
