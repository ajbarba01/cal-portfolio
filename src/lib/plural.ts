/**
 * Count plus its noun, pluralized: `plural(1, "night")` → `"1 night"`,
 * `plural(2, "night")` → `"2 nights"`. Pass `pluralForm` for a noun that
 * does not simply take an `s` (`plural(3, "inquiry", "inquiries")`).
 *
 * English pluralizes everything but exactly one, zero and fractions included.
 */
export function plural(
  count: number,
  singular: string,
  pluralForm = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
