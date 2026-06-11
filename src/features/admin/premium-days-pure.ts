/**
 * Pure helpers for premium (holiday) day manipulation.
 *
 * No server imports — safe to use in both server actions and tests without
 * pulling in "use server" context.
 */

/**
 * Returns a sorted, de-duplicated copy of `dates` with `key` added or removed.
 *
 * @param dates - Current list of YYYY-MM-DD date strings.
 * @param key   - The date to toggle.
 * @param on    - `true` to add, `false` to remove.
 */
export function togglePremiumDate(
  dates: string[],
  key: string,
  on: boolean,
): string[] {
  const set = new Set(dates);
  if (on) {
    set.add(key);
  } else {
    set.delete(key);
  }
  return [...set].sort();
}
