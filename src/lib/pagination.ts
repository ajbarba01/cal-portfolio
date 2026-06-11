/**
 * Generic, framework-agnostic pagination. Shared by every list/search page so
 * page-size clamping and slicing behave identically everywhere.
 */

export interface Page<T> {
  items: T[];
  /** Clamped 1-based page actually shown. */
  page: number;
  /** Always >= 1. */
  pageCount: number;
}

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): Page<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const clamped = Math.min(Math.max(1, page), pageCount);
  const start = (clamped - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: clamped,
    pageCount,
  };
}
