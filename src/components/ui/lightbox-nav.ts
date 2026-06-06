/**
 * Pure circular step for the lightbox. Given the current index, a delta
 * (+1/-1), and the count, returns the wrapped next index. Empty set → 0.
 */
export function stepIndex(
  current: number,
  delta: number,
  length: number,
): number {
  if (length <= 0) return 0;
  return (((current + delta) % length) + length) % length;
}
