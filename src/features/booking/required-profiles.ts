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

export type AccountFormKey = "owner" | "home_access" | "home_sitting";
export type PetFormKey = "pet_care" | "pet_walk";
export type RequiredFormKey = AccountFormKey | PetFormKey;
export type PetSpecies = "dog" | "cat";

/**
 * One required form for a service. Account-scoped forms produce a single
 * requirement; pet-scoped forms produce one requirement per assigned pet that
 * matches the optional `species` predicate (omitted = any species). pet_walk is
 * dog-only because its fields — route, leash, off-leash tag — are dog-shaped.
 */
export type RequiredForm =
  | { key: AccountFormKey; scope: "account" }
  | { key: PetFormKey; scope: "pet"; species?: PetSpecies };

const acct = (key: AccountFormKey): RequiredForm => ({ key, scope: "account" });
const pet = (key: PetFormKey, species?: PetSpecies): RequiredForm =>
  species ? { key, scope: "pet", species } : { key, scope: "pet" };

/**
 * Required forms per pricing_type. A shared owner/home/pet "core" plus thin
 * service-specific add-ons. Keyed by pricing_type (not schema) so a service can
 * never mis-declare its required intake.
 */
export const REQUIRED_PROFILES: Record<PricingType, RequiredForm[]> = {
  house_sitting: [
    acct("owner"),
    acct("home_access"),
    acct("home_sitting"),
    pet("pet_care"),
    pet("pet_walk", "dog"),
  ],
  check_in: [
    acct("owner"),
    acct("home_access"),
    pet("pet_care"),
    pet("pet_walk", "dog"),
  ],
  walk: [acct("owner"), pet("pet_care"), pet("pet_walk", "dog")],
  training: [acct("owner"), pet("pet_care")],
  meet_greet: [acct("owner")],
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
  formKey: RequiredFormKey;
  /** Set only for pet-scoped items (one item per assigned matching pet). */
  petId?: string;
  petName?: string;
  status: RequirementStatus;
}

export interface RequirementInput {
  pricingType: PricingType;
  /** Pets assigned to this booking (drives per-pet items + species filtering). */
  assignedPets: { id: string; name: string; species: PetSpecies }[];
  /** submitted_at (ISO) by account form key, or null if never submitted. */
  accountForms: Partial<Record<AccountFormKey, string | null>>;
  /** submitted_at (ISO) by pet id, then by pet form key. */
  petForms: Record<string, Partial<Record<PetFormKey, string | null>>>;
  now: Date;
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

  // Account-scoped forms first, in manifest order.
  for (const form of manifest) {
    if (form.scope !== "account") continue;
    items.push({
      formKey: form.key,
      status: statusFor(input.accountForms[form.key], input.now, windowDays),
    });
  }

  // Pet-scoped: iterate pets outer, matching manifest entries inner, so output
  // groups all form requirements for a pet together (pet-a's pet_care + pet_walk,
  // then pet-b's). With no matching pets the gate is vacuously satisfied — pet
  // selection is enforced separately by quantity validation, not here.
  const petForms = manifest.filter(
    (f): f is Extract<RequiredForm, { scope: "pet" }> => f.scope === "pet",
  );
  for (const p of input.assignedPets) {
    for (const form of petForms) {
      if (form.species && p.species !== form.species) continue;
      items.push({
        formKey: form.key,
        petId: p.id,
        petName: p.name,
        status: statusFor(
          input.petForms[p.id]?.[form.key],
          input.now,
          windowDays,
        ),
      });
    }
  }

  return items;
}

/** True only when every required profile is complete (gate passes). */
export function requirementsSatisfied(items: RequirementItem[]): boolean {
  return items.every((i) => i.status === "complete");
}

const PRICING_ORDER = Object.keys(REQUIRED_PROFILES) as PricingType[];

/** Reverse map: which services require a given form key (for the account page). */
export function servicesRequiring(formKey: RequiredFormKey): PricingType[] {
  return PRICING_ORDER.filter((pt) =>
    REQUIRED_PROFILES[pt].some((f) => f.key === formKey),
  );
}
