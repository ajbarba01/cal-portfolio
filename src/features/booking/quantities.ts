/**
 * Quantity state for the booking flows: the per-pricing-type shapes, their
 * defaults, and the conversion to the wire record.
 *
 * Pure and free of React, so the server cores that re-price a booking
 * (diff-booking-patch, booking-edit-view) can reach it without importing the
 * `"use client"` form that collects it — see quantity-forms.tsx for that form.
 */

import type { PricingType } from "@/features/pricing";

// ── State shapes ────────────────────────────────────────────────────────────

export interface HouseSittingExtras {
  walkMinutesPerDay: number;
  /** Max hours Cal can be away per day → drives the needy-care surcharge tier. */
  maxHoursAway: number;
  /**
   * @deprecated Server-derived from booking dates + settings.holiday_dates.
   * Kept in the type for back-compat with stored quote_inputs. The UI no longer
   * collects this — the server overrides any client-supplied value.
   */
  holidayDays?: number;
}

export interface HoursQty {
  hours: number;
}

export interface WalkQty extends HoursQty {
  leashManners: boolean;
}

export type QuantityState =
  | { type: "house_sitting"; qty: HouseSittingExtras }
  | { type: "check_in"; qty: HoursQty }
  | { type: "walk"; qty: WalkQty }
  | { type: "training"; qty: HoursQty }
  | { type: "meet_greet"; qty: Record<never, never> };

export function defaultQuantities(pricingType: PricingType): QuantityState {
  switch (pricingType) {
    case "house_sitting":
      return {
        type: "house_sitting",
        qty: { walkMinutesPerDay: 0, maxHoursAway: 8 },
      };
    case "check_in":
      return { type: "check_in", qty: { hours: 1 } };
    case "walk":
      return { type: "walk", qty: { hours: 1, leashManners: false } };
    case "training":
      return { type: "training", qty: { hours: 1 } };
    case "meet_greet":
      return { type: "meet_greet", qty: {} };
  }
}

/**
 * Converts quantity state to the wire record. `nights` (house-sitting) is passed
 * in from the resolved stay range. Pet counts are intentionally absent — the
 * server derives them from the assigned pets.
 */
export function quantitiesToRecord(
  qs: QuantityState,
  nights: number | null,
): Record<string, unknown> {
  switch (qs.type) {
    case "house_sitting":
      // walkMinutesPerDay is emitted even at 0: an edit patch is spread over the
      // booking's stored quantities, so omitting the key would restore the
      // previous minutes and the client could never drop the walk add-on.
      // holidayDays intentionally omitted — server derives from dates.
      return {
        nights: nights ?? 0,
        walkMinutesPerDay: qs.qty.walkMinutesPerDay,
        maxHoursAway: qs.qty.maxHoursAway,
      };
    case "check_in":
    case "training":
      return { hours: qs.qty.hours };
    case "walk":
      return { hours: qs.qty.hours, leashManners: qs.qty.leashManners };
    case "meet_greet":
      return {};
  }
}
