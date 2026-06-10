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
  const seedQty = quantitiesToRecord(initial.quantities, current.nights);
  if (JSON.stringify(nextQty) !== JSON.stringify(seedQty)) {
    patch.quantities = nextQty;
  }

  if (current.comments !== initial.comments) {
    patch.comments = current.comments;
  }

  return patch;
}
