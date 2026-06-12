import type { EditBookingPatch } from "@/features/booking/booking-service";
import {
  quantitiesToRecord,
  type QuantityState,
} from "@/features/booking/_components/quantity-forms";

export interface EditPatchInitial {
  startsAtIso: string;
  endsAtIso: string;
  petIds: string[];
  quantities: QuantityState;
  comments: string;
}

export interface EditPatchCurrent {
  startsAt: Date | null;
  endsAt: Date | null;
  selectedPetIds: string[];
  quantities: QuantityState;
  nights: number | null;
  comments: string;
  petAware: boolean;
}

/**
 * Derives the number of overnight nights from a house_sitting booking's
 * stored ISO start/end times. Used to seed the diff baseline so that a date
 * reschedule (which changes nights count) appears in `patch.quantities`.
 *
 * For non-overnight services this is never called; the return is always null
 * for the code paths that use it.
 */
function initialNightsFromIso(
  startsAtIso: string,
  endsAtIso: string,
): number | null {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const diff = new Date(endsAtIso).getTime() - new Date(startsAtIso).getTime();
  // House-sitting duration is always a whole number of days; round to guard
  // against sub-ms floating-point drift across DST transitions.
  const nights = Math.round(diff / MS_PER_DAY);
  return nights > 0 ? nights : null;
}

/** Order-independent set equality for string arrays. */
function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

/**
 * Build an edit patch containing ONLY the dimensions that changed vs initial.
 * Pure function — no side effects, safe to call in useMemo or tests.
 */
export function diffBookingPatch(
  initial: EditPatchInitial,
  current: EditPatchCurrent,
): EditBookingPatch {
  const patch: EditBookingPatch = {};

  const initialStartMs = new Date(initial.startsAtIso).getTime();
  const initialEndMs = new Date(initial.endsAtIso).getTime();
  if (current.startsAt && current.startsAt.getTime() !== initialStartMs) {
    patch.startsAt = current.startsAt;
  }
  if (current.endsAt && current.endsAt.getTime() !== initialEndMs) {
    patch.endsAt = current.endsAt;
  }

  if (
    current.petAware &&
    !sameStringSet(current.selectedPetIds, initial.petIds)
  ) {
    patch.petIds = current.selectedPetIds;
  }

  const nextQty = quantitiesToRecord(current.quantities, current.nights);
  // U24 fix: seed qty must use the INITIAL nights (derived from initial ISO
  // timestamps), not current.nights. Using current.nights in both sides made
  // the diff always match for a pure date reschedule, leaving nights stale in
  // the merged input and producing a Zod failure when nights was 0/null.
  const initialNights =
    initial.quantities.type === "house_sitting"
      ? initialNightsFromIso(initial.startsAtIso, initial.endsAtIso)
      : null;
  const seedQty = quantitiesToRecord(initial.quantities, initialNights);
  if (JSON.stringify(nextQty) !== JSON.stringify(seedQty)) {
    patch.quantities = nextQty;
  }

  if (current.comments !== initial.comments) {
    patch.comments = current.comments;
  }

  return patch;
}
