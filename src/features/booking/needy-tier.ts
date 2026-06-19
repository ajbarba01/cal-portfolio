/**
 * The needy-care surcharge ladder. A house-sit booking reports the maximum hours
 * Cal can be away from the home; fewer hours → a needier pet → a higher tier. The
 * `needy` ladder modifier charges per night × tier (capped at its own maxTier).
 *
 * Pure: no IO. The reverse map exists so the edit form can re-seed the "max hours"
 * stepper from a stored `needyTier` — it returns a representative value INSIDE the
 * tier's bucket, so a re-quote reproduces the identical tier (price-exact).
 */
export type NeedyTier = 0 | 1 | 2 | 3 | 4;

export function needyTierFromHoursAway(
  maxHoursAway: number | undefined,
): NeedyTier {
  if (maxHoursAway === undefined || maxHoursAway >= 8) return 0;
  if (maxHoursAway >= 6) return 1;
  if (maxHoursAway >= 4) return 2;
  if (maxHoursAway >= 2) return 3;
  return 4;
}

export function representativeHoursFromNeedyTier(needyTier: number): number {
  switch (needyTier) {
    case 1:
      return 7;
    case 2:
      return 5;
    case 3:
      return 3;
    case 4:
      return 1;
    default:
      return 8; // tier 0 or unknown → no surcharge
  }
}
