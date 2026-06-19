/**
 * Supabase nests a related row as a single object for a to-one relationship but
 * as an array for to-many — and the generated types often widen both to an array.
 * `firstRelated` collapses either shape (or null/undefined) to the single related
 * row, so callers don't have to guess. Reading `rel?.[0]` on a to-one object is a
 * silent bug: the object has no index `0`, so it always reads `undefined`.
 */
export function firstRelated<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}
