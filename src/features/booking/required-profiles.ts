/**
 * Booking requirement gate — pure decision logic.
 *
 * A booking does not re-collect intake data; it *requires and confirms* the
 * reusable Owner / Home / Pet profiles a service needs. Which profiles a service
 * needs is a CODE manifest keyed by pricing_type (not schema) so Cal can never
 * mis-configure required forms. Whether each required profile is usable is a
 * freshness decision: a profile is `complete` only if submitted/confirmed within
 * a window, else `stale` (one-click "Confirm up to date" re-gates it) or
 * `missing` (never submitted).
 *
 * This module is pure — `now` and the window are injected — so the gate logic is
 * unit-tested independently of the DB (ENGINEERING #5).
 */

import type { PricingType } from "@/features/pricing";

export type ProfileKey = "owner" | "home" | "pet";

/**
 * Required profiles per pricing_type. House-sitting needs the home; every paid
 * service needs the owner and per-pet care detail; the meet-and-greet (no pet in
 * the home yet) needs only the owner.
 */
export const REQUIRED_PROFILES: Record<PricingType, ProfileKey[]> = {
  house_sitting: ["owner", "home", "pet"],
  walk: ["owner", "pet"],
  check_in: ["owner", "pet"],
  training: ["owner", "pet"],
  meet_greet: ["owner"],
};

/**
 * How long a confirmed profile stays "fresh" before the booking gate asks the
 * client to reconfirm it. Door codes, meds, and vet info drift over months;
 * semiannual reconfirm keeps Cal's in-hand data current without nagging regulars
 * on every booking.
 */
export const FRESHNESS_WINDOW_DAYS = 180;

export type RequirementStatus = "complete" | "stale" | "missing";

export interface RequirementItem {
  profile: ProfileKey;
  /** Set only for pet-scoped items (one item per assigned pet). */
  petId?: string;
  petName?: string;
  status: RequirementStatus;
}

export interface RequirementInput {
  pricingType: PricingType;
  /** Pets assigned to this booking (drives per-pet 'pet' items). */
  assignedPets: { id: string; name: string }[];
  /** submitted_at (ISO) by account-scoped key, or null if never submitted. */
  accountForms: Partial<Record<"owner" | "home", string | null>>;
  /** submitted_at (ISO) by pet id, or null if never submitted. */
  petForms: Record<string, string | null>;
  now: Date;
  /** Defaults to FRESHNESS_WINDOW_DAYS; injectable for tests/tuning. */
  freshnessWindowDays?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * complete / stale / missing for a single submitted_at. A submission whose age
 * equals the window is still complete (stale only once age strictly exceeds it).
 */
function statusFor(
  submittedAt: string | null | undefined,
  now: Date,
  windowDays: number,
): RequirementStatus {
  if (!submittedAt) return "missing";
  const ageDays = (now.getTime() - new Date(submittedAt).getTime()) / DAY_MS;
  return ageDays > windowDays ? "stale" : "complete";
}

export function bookingRequirements(
  input: RequirementInput,
): RequirementItem[] {
  const windowDays = input.freshnessWindowDays ?? FRESHNESS_WINDOW_DAYS;
  const manifest = REQUIRED_PROFILES[input.pricingType];
  const items: RequirementItem[] = [];

  for (const profile of manifest) {
    if (profile === "owner" || profile === "home") {
      items.push({
        profile,
        status: statusFor(input.accountForms[profile], input.now, windowDays),
      });
      continue;
    }

    // pet-scoped: one item per assigned pet. With no pets assigned the gate is
    // vacuously satisfied for 'pet' — we can't gate a care profile for a pet that
    // isn't on the booking, and a permanent block would be impossible to clear
    // for services that don't assign pets. Pet *selection* is enforced separately
    // by quantity validation, not here.
    for (const pet of input.assignedPets) {
      items.push({
        profile: "pet",
        petId: pet.id,
        petName: pet.name,
        status: statusFor(input.petForms[pet.id], input.now, windowDays),
      });
    }
  }

  return items;
}

/** True only when every required profile is complete (gate passes). */
export function requirementsSatisfied(items: RequirementItem[]): boolean {
  return items.every((i) => i.status === "complete");
}
