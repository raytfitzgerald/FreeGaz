/** The /builder route's search params: an optional workout id to open. */
export interface BuilderSearch {
  id?: string
}

/**
 * validateSearch for /builder. Workout ids are strings ("user:…",
 * "builtin:…"); a number is accepted too, since the router's default search
 * parser turns an all-digit value into one.
 */
export function parseBuilderSearch(search: Record<string, unknown>): BuilderSearch {
  const id = search.id
  if (typeof id === 'number' && Number.isFinite(id)) return { id: String(id) }
  return typeof id === 'string' && id.trim() !== '' ? { id } : {}
}
