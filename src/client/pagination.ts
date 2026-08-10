/**
 * Drain a query in pages: PostgREST silently caps a response at 1000 rows, so
 * any unpaginated table scan starts dropping data once an account outgrows the
 * cap. `build` must apply a stable `.order(...)` so pages tile correctly.
 */
const PAGE = 1000

export async function fetchAll<Row>(
  build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>,
): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}
