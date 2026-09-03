# Intake Forms Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the three monolithic intake profiles into five reusable shared-core + service-add-on forms, make the booking gate species-aware and completable inline in the booking flow, and group the account-page forms per pet with "required-for" labels.

**Architecture:** Pure manifest/gate core changes first (TDD), then schema/registry/field-group changes, then booking-service-shared gate wiring + pet-awareness, then the inline booking-flow UI (reusing `form-card`), then the account-page display. `form_responses` already stores arbitrary `form_key` + `pet_id` — no migration.

**Tech Stack:** Next.js App Router, TypeScript (strict), Zod, Supabase, Tailwind + shadcn/base-ui primitives, Vitest.

## Global Constraints

- TypeScript `strict`, no `any`. (CODE_STYLE / ENGINEERING)
- Design tokens only; no hardcoded colors; no drop shadows. (FRONTEND)
- a11y floor: status conveyed by label/text, never color alone; semantic HTML, visible focus, keyboard nav.
- Mobile parity: every layout as intentional on mobile as desktop.
- App → feature imports go through the feature barrel (`index.client.ts` / `index.ts`), never deep paths. (boundaries lint rule)
- Core logic pure and unit-tested; inject `now` and window. (ENGINEERING #5)
- Commits: subject-line-only Conventional Commits — no body, no trailer/footer, no internal identifiers (no phase/PR numbers).
- Edit source files with the Edit/Write tools only (PowerShell mojibakes UTF-8).
- Gate work on `npm run test` (pure unit tests). Booking INTEGRATION tests fail environmentally (fixed slots collide with local dev bookings) — NOT this work. Do NOT `supabase db reset`.
- Same-commit doc rule: a change that adds/moves/deletes files updates the owning doc (DESIGN.md) in the same commit.
- Invoke `frontend-design` skill before building/altering any UI (Tasks 8–12).

## File Structure

**Pure core**

- `src/features/booking/required-profiles.ts` — manifest (`RequiredForm[]` per pricing_type, species predicate), `bookingRequirements` (formKey + species filter), `RequirementItem` (carries `formKey`), `servicesRequiring` reverse map.
- `src/features/booking/required-profiles.test.ts` — rewritten unit tests.

**Schemas + registry + field groups**

- `src/features/accounts/owner-schema.ts` — add `additional_notes`.
- `src/features/accounts/home-access-schema.ts` — NEW (from `home-schema.ts`).
- `src/features/accounts/home-sitting-schema.ts` — NEW (from `home-schema.ts`).
- `src/features/accounts/pet-care-schema.ts` — NEW (from `pet-form-schema.ts`).
- `src/features/accounts/pet-walk-schema.ts` — NEW (from `pet-form-schema.ts`).
- `src/features/accounts/home-schema.ts`, `pet-form-schema.ts` — DELETE.
- `src/features/accounts/form-registry.ts` — new keys.
- `src/features/accounts/_components/profile-fields.tsx` — groups for 5 keys + optional/required indicator.

**Gate wiring + pet-awareness**

- `src/features/booking/booking-service-shared.ts` — per-key/per-pet petForms read, account home_access/home_sitting, early pet fetch for species, `petAware` expansion, headcount-derivation gating, warnings string.
- `src/features/booking/use-booking-scheduler.ts` — `petAware`/`allowedSpecies`/`maxPets` derivation.
- `src/features/booking/_components/pet-assignment.tsx` — `maxSelect` single-select support.

**Inline booking-flow UI (G2)**

- `src/features/accounts/_components/form-card.tsx` — `status` prop, stale warning, `onSaved`, disclaimer.
- `src/features/accounts/_components/profile-disclaimer.tsx` — NEW (shared disclaimer constant + node).
- `src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx` — inline `RequirementsGate` using `FormCard`.
- `src/app/(site)/(marketing)/book/[serviceSlug]/_components/use-service-booking.ts` — `refreshRequirements`, existing-form-data plumbing.
- `src/app/(site)/(marketing)/book/[serviceSlug]/page.tsx` — server-load the client's form responses for ready users.

**Account-page display (G3)**

- `src/app/(site)/(account)/account/forms/page.tsx` — load new keys per pet.
- `src/app/(site)/(account)/account/forms/_components/forms-client.tsx` — per-pet accordion + "required for" labels.

**Docs**

- `docs/DESIGN.md` — data-model section: form keys list updated, species-gated pet_walk, pet-aware services.

---

## Task 1: Pure manifest + gate core (species-aware)

**Files:**

- Modify: `src/features/booking/required-profiles.ts`
- Test: `src/features/booking/required-profiles.test.ts`

**Interfaces:**

- Consumes: `PricingType` from `@/features/pricing`.
- Produces:
  - `type AccountFormKey = "owner" | "home_access" | "home_sitting"`
  - `type PetFormKey = "pet_care" | "pet_walk"`
  - `type RequiredFormKey = AccountFormKey | PetFormKey`
  - `type PetSpecies = "dog" | "cat"`
  - `type RequiredForm = { key: AccountFormKey; scope: "account" } | { key: PetFormKey; scope: "pet"; species?: PetSpecies }`
  - `REQUIRED_PROFILES: Record<PricingType, RequiredForm[]>`
  - `interface RequirementItem { formKey: RequiredFormKey; petId?: string; petName?: string; status: RequirementStatus }`
  - `interface RequirementInput { pricingType; assignedPets: { id: string; name: string; species: PetSpecies }[]; accountForms: Partial<Record<AccountFormKey, string | null>>; petForms: Record<string, Partial<Record<PetFormKey, string | null>>>; now: Date; freshnessWindowDays?: number }`
  - `bookingRequirements(input): RequirementItem[]`
  - `requirementsSatisfied(items): boolean`

- [ ] **Step 1: Rewrite the test file**

Replace the full contents of `src/features/booking/required-profiles.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  bookingRequirements,
  requirementsSatisfied,
  REQUIRED_PROFILES,
  FRESHNESS_WINDOW_DAYS,
} from "./required-profiles";

const NOW = new Date("2026-06-16T12:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

const FRESH = daysAgo(10);
const STALE = daysAgo(FRESHNESS_WINDOW_DAYS + 20);

const DOG_A = { id: "pet-a", name: "Rex", species: "dog" as const };
const DOG_B = { id: "pet-b", name: "Milo", species: "dog" as const };
const CAT = { id: "pet-c", name: "Luna", species: "cat" as const };

describe("REQUIRED_PROFILES manifest", () => {
  it("maps every pricing_type to finer form keys", () => {
    expect(REQUIRED_PROFILES.house_sitting.map((f) => f.key)).toEqual([
      "owner",
      "home_access",
      "home_sitting",
      "pet_care",
      "pet_walk",
    ]);
    expect(REQUIRED_PROFILES.check_in.map((f) => f.key)).toEqual([
      "owner",
      "home_access",
      "pet_care",
      "pet_walk",
    ]);
    expect(REQUIRED_PROFILES.walk.map((f) => f.key)).toEqual([
      "owner",
      "pet_care",
      "pet_walk",
    ]);
    expect(REQUIRED_PROFILES.training.map((f) => f.key)).toEqual([
      "owner",
      "pet_care",
    ]);
    expect(REQUIRED_PROFILES.meet_greet.map((f) => f.key)).toEqual(["owner"]);
  });

  it("marks pet_walk as dog-only across every service that requires it", () => {
    for (const pt of ["house_sitting", "check_in", "walk"] as const) {
      const walk = REQUIRED_PROFILES[pt].find((f) => f.key === "pet_walk");
      expect(walk).toMatchObject({ scope: "pet", species: "dog" });
    }
  });
});

describe("bookingRequirements", () => {
  it("meet_greet requires only a fresh owner profile", () => {
    const items = bookingRequirements({
      pricingType: "meet_greet",
      assignedPets: [],
      accountForms: { owner: FRESH },
      petForms: {},
      now: NOW,
    });
    expect(items).toEqual([{ formKey: "owner", status: "complete" }]);
  });

  it("marks an account profile missing/stale by submitted_at", () => {
    const missing = bookingRequirements({
      pricingType: "meet_greet",
      assignedPets: [],
      accountForms: { owner: null },
      petForms: {},
      now: NOW,
    });
    expect(missing).toEqual([{ formKey: "owner", status: "missing" }]);

    const stale = bookingRequirements({
      pricingType: "meet_greet",
      assignedPets: [],
      accountForms: { owner: STALE },
      petForms: {},
      now: NOW,
    });
    expect(stale).toEqual([{ formKey: "owner", status: "stale" }]);
  });

  it("house_sitting yields account forms + per-pet pet_care/pet_walk", () => {
    const items = bookingRequirements({
      pricingType: "house_sitting",
      assignedPets: [DOG_A, DOG_B],
      accountForms: { owner: FRESH, home_access: FRESH, home_sitting: FRESH },
      petForms: {
        "pet-a": { pet_care: FRESH, pet_walk: FRESH },
        "pet-b": { pet_care: null, pet_walk: STALE },
      },
      now: NOW,
    });
    expect(items).toEqual([
      { formKey: "owner", status: "complete" },
      { formKey: "home_access", status: "complete" },
      { formKey: "home_sitting", status: "complete" },
      {
        formKey: "pet_care",
        petId: "pet-a",
        petName: "Rex",
        status: "complete",
      },
      {
        formKey: "pet_walk",
        petId: "pet-a",
        petName: "Rex",
        status: "complete",
      },
      {
        formKey: "pet_care",
        petId: "pet-b",
        petName: "Milo",
        status: "missing",
      },
      { formKey: "pet_walk", petId: "pet-b", petName: "Milo", status: "stale" },
    ]);
  });

  it("skips pet_walk for cats (dog-only predicate) but keeps pet_care", () => {
    const items = bookingRequirements({
      pricingType: "house_sitting",
      assignedPets: [CAT],
      accountForms: { owner: FRESH, home_access: FRESH, home_sitting: FRESH },
      petForms: { "pet-c": { pet_care: FRESH } },
      now: NOW,
    });
    const catItems = items.filter((i) => i.petId === "pet-c");
    expect(catItems).toEqual([
      {
        formKey: "pet_care",
        petId: "pet-c",
        petName: "Luna",
        status: "complete",
      },
    ]);
  });

  it("treats pet requirements as vacuous when no pets are assigned", () => {
    const items = bookingRequirements({
      pricingType: "walk",
      assignedPets: [],
      accountForms: { owner: FRESH },
      petForms: {},
      now: NOW,
    });
    expect(items).toEqual([{ formKey: "owner", status: "complete" }]);
    expect(requirementsSatisfied(items)).toBe(true);
  });

  it("treats a submission exactly at the window edge as still complete", () => {
    const justInside = daysAgo(FRESHNESS_WINDOW_DAYS);
    const items = bookingRequirements({
      pricingType: "meet_greet",
      assignedPets: [],
      accountForms: { owner: justInside },
      petForms: {},
      now: NOW,
    });
    expect(items[0].status).toBe("complete");
  });
});

describe("requirementsSatisfied", () => {
  it("is true only when every item is complete", () => {
    expect(
      requirementsSatisfied([
        { formKey: "owner", status: "complete" },
        { formKey: "home_access", status: "complete" },
      ]),
    ).toBe(true);
    expect(
      requirementsSatisfied([
        { formKey: "owner", status: "complete" },
        { formKey: "home_access", status: "stale" },
      ]),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm run test -- required-profiles`
Expected: FAIL (manifest/RequirementInput shape mismatch, `formKey` not present).

- [ ] **Step 3: Rewrite `required-profiles.ts`**

Replace the contents from the `ProfileKey` type through `requirementsSatisfied` with:

```ts
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

  for (const form of manifest) {
    if (form.scope === "account") {
      items.push({
        formKey: form.key,
        status: statusFor(input.accountForms[form.key], input.now, windowDays),
      });
      continue;
    }

    // Pet-scoped: one item per assigned pet matching the species predicate. With
    // no matching pets the gate is vacuously satisfied for this key — pet
    // selection is enforced separately by quantity validation, not here.
    for (const p of input.assignedPets) {
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

export function requirementsSatisfied(items: RequirementItem[]): boolean {
  return items.every((i) => i.status === "complete");
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm run test -- required-profiles`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/required-profiles.ts src/features/booking/required-profiles.test.ts
git commit -m "feat(booking): species-aware requirement manifest with finer form keys"
```

---

## Task 2: `servicesRequiring` reverse map

**Files:**

- Modify: `src/features/booking/required-profiles.ts`
- Test: `src/features/booking/required-profiles.test.ts`

**Interfaces:**

- Consumes: `REQUIRED_PROFILES`, `RequiredFormKey`, `PricingType`.
- Produces: `servicesRequiring(formKey: RequiredFormKey): PricingType[]` — pricing_types whose manifest includes the key, in `REQUIRED_PROFILES` key order.

- [ ] **Step 1: Add the failing test** (append inside `required-profiles.test.ts`)

```ts
import { servicesRequiring } from "./required-profiles";

describe("servicesRequiring", () => {
  it("returns every pricing_type whose manifest includes the key", () => {
    expect(servicesRequiring("owner")).toEqual([
      "house_sitting",
      "check_in",
      "walk",
      "training",
      "meet_greet",
    ]);
    expect(servicesRequiring("home_sitting")).toEqual(["house_sitting"]);
    expect(servicesRequiring("pet_walk")).toEqual([
      "house_sitting",
      "check_in",
      "walk",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm run test -- required-profiles`
Expected: FAIL (`servicesRequiring` not exported).

- [ ] **Step 3: Implement** (append to `required-profiles.ts`)

```ts
const PRICING_ORDER = Object.keys(REQUIRED_PROFILES) as PricingType[];

/** Reverse map: which services require a given form key (for the account page). */
export function servicesRequiring(formKey: RequiredFormKey): PricingType[] {
  return PRICING_ORDER.filter((pt) =>
    REQUIRED_PROFILES[pt].some((f) => f.key === formKey),
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm run test -- required-profiles`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/required-profiles.ts src/features/booking/required-profiles.test.ts
git commit -m "feat(booking): add servicesRequiring reverse map for account forms"
```

---

## Task 3: Schemas split + registry update

**Files:**

- Modify: `src/features/accounts/owner-schema.ts`
- Create: `src/features/accounts/home-access-schema.ts`, `home-sitting-schema.ts`, `pet-care-schema.ts`, `pet-walk-schema.ts`
- Delete: `src/features/accounts/home-schema.ts`, `pet-form-schema.ts`
- Modify: `src/features/accounts/form-registry.ts`
- Modify: `src/features/accounts/index.ts` (export FormScope unchanged; no key list to change there)

**Interfaces:**

- Consumes: `FIELD_LIMITS` from `@/lib/field-limits`, zod.
- Produces: `ownerSchema`/`OwnerInput`, `homeAccessSchema`/`HomeAccessInput`, `homeSittingSchema`/`HomeSittingInput`, `petCareSchema`/`PetCareInput`, `petWalkSchema`/`PetWalkInput`; `formRegistry` with keys `owner`, `home_access`, `home_sitting`, `pet_care`, `pet_walk` (+ legacy `emergency`); `FormKey`.

- [ ] **Step 1: Add `additional_notes` to `owner-schema.ts`**

Add inside `ownerSchema` object (after the emergency2 block):

```ts
  // ── Anything else ─────────────────────────────────────────────────────────────
  additional_notes: z.string().max(FIELD_LIMITS.note).optional(),
```

- [ ] **Step 2: Create `home-access-schema.ts`**

```ts
import { z } from "zod";
import { FIELD_LIMITS } from "@/lib/field-limits";

/**
 * Home access (account-scoped). The minimum Cal needs to get in the door, shared
 * by check-ins and house-sitting. Address + entry are required; the rest is
 * optional. Split out of the former monolithic Home form.
 */
export const homeAccessSchema = z.object({
  address: z
    .string()
    .min(1, "Home address is required")
    .max(FIELD_LIMITS.addressLine),
  entry_instructions: z
    .string()
    .min(1, "Entry instructions are required")
    .max(FIELD_LIMITS.note),
  alarm_instructions: z.string().max(FIELD_LIMITS.note).optional(),
  wifi: z.string().max(FIELD_LIMITS.shortText).optional(),
  breaker_location: z.string().max(FIELD_LIMITS.shortText).optional(),
  additional_notes: z.string().max(FIELD_LIMITS.note).optional(),
});

export type HomeAccessInput = z.infer<typeof homeAccessSchema>;
```

- [ ] **Step 3: Create `home-sitting-schema.ts`**

```ts
import { z } from "zod";
import { FIELD_LIMITS } from "@/lib/field-limits";

/**
 * House-sitting add-on (account-scoped). The overnight-only details — sleeping,
 * home care, house rules, guests — layered on top of home_access.
 */
export const homeSittingSchema = z.object({
  sleeping_arrangements: z.string().max(FIELD_LIMITS.note).optional(),
  home_care: z.string().max(FIELD_LIMITS.note).optional(),
  furniture_policy: z.string().max(FIELD_LIMITS.shortText).optional(),
  house_rules: z.string().max(FIELD_LIMITS.note).optional(),
  guest_policy: z.string().max(FIELD_LIMITS.shortText).optional(),
  additional_notes: z.string().max(FIELD_LIMITS.note).optional(),
});

export type HomeSittingInput = z.infer<typeof homeSittingSchema>;
```

- [ ] **Step 4: Create `pet-care-schema.ts`**

```ts
import { z } from "zod";
import { FIELD_LIMITS } from "@/lib/field-limits";

/**
 * Pet-care core (pet-scoped). The species-agnostic feeding / medical / behavior
 * narrative every service caring for the animal needs. Walk/exercise detail moved
 * to the dog-only pet_walk add-on. All fields optional.
 */
export const petCareSchema = z.object({
  // Feeding
  feeding_schedule: z.string().max(FIELD_LIMITS.note).optional(),
  feeding_amount: z.string().max(FIELD_LIMITS.shortText).optional(),
  food_location: z.string().max(FIELD_LIMITS.shortText).optional(),
  treat_instructions: z.string().max(FIELD_LIMITS.note).optional(),
  // Medical
  current_medications: z.string().max(FIELD_LIMITS.note).optional(),
  allergies: z.string().max(FIELD_LIMITS.note).optional(),
  medical_history: z.string().max(FIELD_LIMITS.note).optional(),
  emergency_history: z.string().max(FIELD_LIMITS.note).optional(),
  vet_emergency_notes: z.string().max(FIELD_LIMITS.note).optional(),
  // Behavior
  friendly_strangers: z.string().max(FIELD_LIMITS.shortText).optional(),
  friendly_dogs: z.string().max(FIELD_LIMITS.shortText).optional(),
  friendly_children: z.string().max(FIELD_LIMITS.shortText).optional(),
  behavior_comments: z.string().max(FIELD_LIMITS.note).optional(),
  additional_notes: z.string().max(FIELD_LIMITS.note).optional(),
});

export type PetCareInput = z.infer<typeof petCareSchema>;
```

- [ ] **Step 5: Create `pet-walk-schema.ts`**

```ts
import { z } from "zod";
import { FIELD_LIMITS } from "@/lib/field-limits";

/**
 * Walk / exercise add-on (pet-scoped, dog-only). Route, pace, leash, off-leash
 * tag, vehicle restraint, plus how to get in for an unattended walk (walk has no
 * Home form). All fields optional.
 */
export const petWalkSchema = z.object({
  walk_route: z.string().max(FIELD_LIMITS.note).optional(),
  walk_pace: z.string().max(FIELD_LIMITS.shortText).optional(),
  leash_harness: z.string().max(FIELD_LIMITS.shortText).optional(),
  offleash: z.string().max(FIELD_LIMITS.shortText).optional(),
  vehicle_restraint: z.string().max(FIELD_LIMITS.note).optional(),
  walk_entry: z.string().max(FIELD_LIMITS.note).optional(),
  additional_notes: z.string().max(FIELD_LIMITS.note).optional(),
});

export type PetWalkInput = z.infer<typeof petWalkSchema>;
```

- [ ] **Step 6: Rewrite `form-registry.ts`**

```ts
import { type ZodSchema } from "zod";
import { emergencySchema } from "./emergency-schema";
import { ownerSchema } from "./owner-schema";
import { homeAccessSchema } from "./home-access-schema";
import { homeSittingSchema } from "./home-sitting-schema";
import { petCareSchema } from "./pet-care-schema";
import { petWalkSchema } from "./pet-walk-schema";

/**
 * Entity-scoped intake forms. `scope` decides whether a response is keyed to the
 * account (one row per client) or to a pet (one row per client + pet). The
 * booking requirement gate and the /account/forms surface both read `scope`.
 *
 * `emergency` is legacy (the original single-form gate); kept registered so old
 * rows still validate, not surfaced or required.
 */
export type FormScope = "account" | "pet";

export interface FormRegistryEntry {
  schema: ZodSchema;
  scope: FormScope;
  /** Cal-facing card title. */
  title: string;
}

export const formRegistry = {
  emergency: {
    schema: emergencySchema,
    scope: "account",
    title: "Emergency contact & vet info",
  },
  owner: {
    schema: ownerSchema,
    scope: "account",
    title: "Owner & emergency contacts",
  },
  home_access: {
    schema: homeAccessSchema,
    scope: "account",
    title: "Home access",
  },
  home_sitting: {
    schema: homeSittingSchema,
    scope: "account",
    title: "House-sitting details",
  },
  pet_care: {
    schema: petCareSchema,
    scope: "pet",
    title: "Pet care",
  },
  pet_walk: {
    schema: petWalkSchema,
    scope: "pet",
    title: "Walks & outings",
  },
} satisfies Record<string, FormRegistryEntry>;

export type FormKey = keyof typeof formRegistry;
```

- [ ] **Step 7: Delete the old schemas**

```bash
git rm src/features/accounts/home-schema.ts src/features/accounts/pet-form-schema.ts
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in files that still reference `home`/`pet`/`homeSchema`/`petFormSchema` (profile-fields, booking-service-shared, forms-client, page.tsx, account tests) — those are fixed in later tasks. No errors inside the new schema files or registry.

- [ ] **Step 9: Commit**

```bash
git add src/features/accounts/owner-schema.ts src/features/accounts/home-access-schema.ts src/features/accounts/home-sitting-schema.ts src/features/accounts/pet-care-schema.ts src/features/accounts/pet-walk-schema.ts src/features/accounts/form-registry.ts
git commit -m "feat(accounts): split intake schemas into shared-core and service add-on forms"
```

---

## Task 4: Profile field groups + optional/required indicator

**Files:**

- Modify: `src/features/accounts/_components/profile-fields.tsx`

**Interfaces:**

- Consumes: `FormKey` from form-registry, `FIELD_LIMITS`.
- Produces: `PROFILE_GROUPS` covering `owner`, `home_access`, `home_sitting`, `pet_care`, `pet_walk`; `profileFieldNames(formKey)`; `ProfileFields` renders each field's label with an explicit optional/required indicator.

- [ ] **Step 1: Replace the group constants**

In `profile-fields.tsx`, keep `OWNER_GROUPS` but add an `additional_notes` "Anything else" group at its end:

```ts
const NOTES_GROUP: FieldGroup = {
  title: "Anything else",
  fields: [
    {
      name: "additional_notes",
      label: "Additional notes",
      hint: "Anything not covered above",
      multiline: true,
      max: NT,
    },
  ],
};
```

Append `NOTES_GROUP` to `OWNER_GROUPS`. Replace `HOME_GROUPS` and `PET_GROUPS` with four new constants:

```ts
const HOME_ACCESS_GROUPS: FieldGroup[] = [
  {
    title: "Getting in",
    fields: [
      { name: "address", label: "Home address", required: true, max: A },
      {
        name: "entry_instructions",
        label: "How to get in",
        hint: "Keys, lockbox, keypad or garage code",
        required: true,
        multiline: true,
        max: NT,
      },
      {
        name: "alarm_instructions",
        label: "Alarm or security system",
        hint: "Any steps to disarm or codes Cal needs",
        multiline: true,
        max: NT,
      },
      { name: "wifi", label: "Wi-Fi", hint: "Network and password", max: S },
      {
        name: "breaker_location",
        label: "Breaker box",
        hint: "Where to find it if the power trips",
        max: S,
      },
    ],
  },
  NOTES_GROUP,
];

const HOME_SITTING_GROUPS: FieldGroup[] = [
  {
    title: "Staying over",
    fields: [
      {
        name: "sleeping_arrangements",
        label: "Where Cal should sleep",
        multiline: true,
        max: NT,
      },
    ],
  },
  {
    title: "Home care",
    fields: [
      {
        name: "home_care",
        label: "Household tasks",
        hint: "Plants, mail, trash and recycling days, anything else",
        multiline: true,
        max: NT,
      },
      {
        name: "furniture_policy",
        label: "Furniture",
        hint: "Are pets allowed on beds and couches?",
        max: S,
      },
      { name: "house_rules", label: "House rules", multiline: true, max: NT },
      {
        name: "guest_policy",
        label: "Guests",
        hint: "OK for Cal to have a guest? Cal always asks first",
        max: S,
      },
    ],
  },
  NOTES_GROUP,
];

const PET_CARE_GROUPS: FieldGroup[] = [
  {
    title: "Feeding",
    fields: [
      {
        name: "feeding_schedule",
        label: "Feeding schedule",
        multiline: true,
        max: NT,
      },
      { name: "feeding_amount", label: "Amount per meal", max: S },
      { name: "food_location", label: "Where the food is", max: S },
      {
        name: "treat_instructions",
        label: "Treats",
        hint: "Guidelines or restrictions",
        multiline: true,
        max: NT,
      },
    ],
  },
  {
    title: "Medical",
    fields: [
      {
        name: "current_medications",
        label: "Medications",
        hint: "Name, dose, frequency, and reason for each",
        multiline: true,
        max: NT,
      },
      {
        name: "allergies",
        label: "Allergies",
        hint: "Allergen and what a reaction looks like",
        multiline: true,
        max: NT,
      },
      {
        name: "medical_history",
        label: "Medical history",
        hint: "Conditions and past surgeries",
        multiline: true,
        max: NT,
      },
      {
        name: "emergency_history",
        label: "Past emergencies",
        hint: "Previous ER visits or hospitalizations",
        multiline: true,
        max: NT,
      },
      {
        name: "vet_emergency_notes",
        label: "For a vet in an emergency",
        hint: "Anything else a vet should know",
        multiline: true,
        max: NT,
      },
    ],
  },
  {
    title: "Behavior",
    fields: [
      { name: "friendly_strangers", label: "With strangers", max: S },
      { name: "friendly_dogs", label: "With other dogs", max: S },
      { name: "friendly_children", label: "With children", max: S },
      {
        name: "behavior_comments",
        label: "Other behavior notes",
        multiline: true,
        max: NT,
      },
    ],
  },
  NOTES_GROUP,
];

const PET_WALK_GROUPS: FieldGroup[] = [
  {
    title: "Walks & outings",
    fields: [
      {
        name: "walk_route",
        label: "Typical route(s)",
        multiline: true,
        max: NT,
      },
      { name: "walk_pace", label: "Distance / pace", max: S },
      {
        name: "leash_harness",
        label: "Leash or harness",
        hint: "Which, and where it's kept",
        max: S,
      },
      {
        name: "offleash",
        label: "Off-leash",
        hint: "Permitted? Off-leash tag?",
        max: S,
      },
      {
        name: "vehicle_restraint",
        label: "In the car",
        hint: "How to secure your dog for an outing",
        multiline: true,
        max: NT,
      },
      {
        name: "walk_entry",
        label: "Getting in for the walk",
        hint: "How Cal enters if you're not home",
        multiline: true,
        max: NT,
      },
    ],
  },
  NOTES_GROUP,
];
```

- [ ] **Step 2: Update `PROFILE_GROUPS`**

```ts
export const PROFILE_GROUPS: Partial<Record<FormKey, FieldGroup[]>> = {
  owner: OWNER_GROUPS,
  home_access: HOME_ACCESS_GROUPS,
  home_sitting: HOME_SITTING_GROUPS,
  pet_care: PET_CARE_GROUPS,
  pet_walk: PET_WALK_GROUPS,
};
```

- [ ] **Step 3: Render the optional/required indicator**

In `FieldGroupBlock`, build a label node so every field shows its state by text (a11y — not color alone). Replace the two `<FormField label={f.label} ...>` usages so `label` is:

```tsx
const labelNode = (
  <span className="inline-flex items-center gap-1.5">
    {f.label}
    {f.required ? (
      <span className="text-destructive text-xs font-normal">*</span>
    ) : (
      <span className="text-muted-foreground text-xs font-normal">
        (optional)
      </span>
    )}
  </span>
);
```

Pass `label={labelNode}` to both the multiline and single-line `FormField`.

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit` then `npm run lint -- src/features/accounts/_components/profile-fields.tsx`
Expected: no errors in profile-fields.tsx (other files still pending).

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/_components/profile-fields.tsx
git commit -m "feat(accounts): field groups for split forms with optional/required markers"
```

---

## Task 5: Booking-service-shared gate wiring + pet-awareness

**Files:**

- Modify: `src/features/booking/booking-service-shared.ts`

**Interfaces:**

- Consumes: `bookingRequirements`, `requirementsSatisfied`, `RequirementItem`, `PetSpecies` from `./required-profiles`; `repo.getFormStatuses`, `repo.getPetsByIds`.
- Produces: unchanged result kind `{ kind: "profiles_incomplete"; requirements: RequirementItem[] }`. `petAware` now covers house_sitting/walk/check_in/training.

- [ ] **Step 1: Move the owned-pets fetch ahead of the gate and feed species in**

Replace the gate block (currently ~L556–588) and the pet-aware block (~L590–612). New ordering — fetch owned pets first when the service is pet-aware and pets were supplied, then run the species-aware gate, then derive headcount:

```ts
// Pet-aware services let the client assign pets; only house_sitting/walk price
// by headcount. check_in/training are hours-only — they assign pets purely so
// the per-pet care requirement is satisfiable, and derive no counts.
const petIds = input.petIds ?? [];
const petAware =
  service.pricing_type === "house_sitting" ||
  service.pricing_type === "walk" ||
  service.pricing_type === "check_in" ||
  service.pricing_type === "training";

let ownedPets: { id: string; species: PetSpecies }[] = [];
if (petAware && petIds.length > 0) {
  ownedPets = await repo.getPetsByIds(input.userId, petIds);
  if (ownedPets.length !== petIds.length) {
    return {
      kind: "validation_error",
      message: "One or more selected pets were not found.",
    };
  }
}

// Requirements gate: a booking requires the reusable profiles its pricing_type
// calls for (REQUIRED_PROFILES), each complete and fresh. services.form_key is
// legacy and no longer consulted.
const formStatuses = await formStatusesPromise;
const findStatus = (formKey: string, petId: string | null) =>
  formStatuses.find((r) => r.formKey === formKey && r.petId === petId)
    ?.submittedAt ?? null;
const petForms: Record<
  string,
  { pet_care?: string | null; pet_walk?: string | null }
> = {};
for (const p of ownedPets) {
  petForms[p.id] = {
    pet_care: findStatus("pet_care", p.id),
    pet_walk: findStatus("pet_walk", p.id),
  };
}
const requirements = bookingRequirements({
  pricingType: service.pricing_type,
  assignedPets: ownedPets.map((p) => ({
    id: p.id,
    name: "",
    species: p.species,
  })),
  accountForms: {
    owner: findStatus("owner", null),
    home_access: findStatus("home_access", null),
    home_sitting: findStatus("home_sitting", null),
  },
  petForms,
  now: deps.now,
});
if (!requirementsSatisfied(requirements)) {
  if (policy.skipFormsGate) {
    const unmet = requirements
      .filter((r) => r.status !== "complete")
      .map((r) => `${r.formKey}:${r.status}`)
      .join(", ");
    warnings.push(`Client profiles incomplete (${unmet}).`);
  } else {
    return { kind: "profiles_incomplete", requirements };
  }
}

// Derive pet-aware counts (server-trusted) only for the two headcount-priced
// services. check_in/training keep their client/default hours-only quantities.
let quantitiesRaw = input.quantities;
if (petAware && ownedPets.length > 0) {
  const dogs = ownedPets.filter((p) => p.species === "dog").length;
  const cats = ownedPets.filter((p) => p.species === "cat").length;
  if (service.pricing_type === "house_sitting") {
    quantitiesRaw = { ...quantitiesRaw, dogs, cats };
  } else if (service.pricing_type === "walk") {
    quantitiesRaw = { ...quantitiesRaw, dogs };
  }
}
```

Remove the now-duplicated old `const petIds`, old `petAware`, the old `findStatus`/`petForms`/`requirements` block above, and the second `repo.getPetsByIds` call so each appears once.

- [ ] **Step 2: Ensure `PetSpecies` is imported**

Add `PetSpecies` to the existing `./required-profiles` import (alongside `bookingRequirements`, `requirementsSatisfied`, `RequirementItem`).

- [ ] **Step 3: Run the gate unit tests**

Run: `npm run test -- forms-gate booking-service`
Expected: PASS. If `forms-gate.test.ts` fixtures use the old `owner`/`home`/`pet` keys or `profile` field, update them to the new keys/`formKey` (the test is pure — DI repo). Update any `getFormStatuses` mock rows from `form_key: "pet"` → `pet_care`/`pet_walk`, `home` → `home_access`/`home_sitting`, and assertions reading `.profile` → `.formKey`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only remain in UI consumers (service-booking-client, forms-client, page.tsx) fixed in later tasks.

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/booking-service-shared.ts src/features/booking/forms-gate.test.ts
git commit -m "feat(booking): species-aware gate read; check-in and training become pet-aware"
```

---

## Task 6: Scheduler pet-aware/species/cardinality derivation

**Files:**

- Modify: `src/features/booking/use-booking-scheduler.ts`

**Interfaces:**

- Produces (on `UseBookingSchedulerReturn`): existing `petAware`, `allowedSpecies`; NEW `maxPets: number | null` (null = unlimited; 1 for training).

- [ ] **Step 1: Update derivation** (replace lines ~258–261)

```ts
const petAware =
  service.pricingType === "house_sitting" ||
  service.pricingType === "walk" ||
  service.pricingType === "check_in" ||
  service.pricingType === "training";
const allowedSpecies: PetSpecies[] =
  service.pricingType === "house_sitting" ? ["dog", "cat"] : ["dog"];
// Training is a single-dog session; everything else allows multiple pets.
const maxPets: number | null = service.pricingType === "training" ? 1 : null;
```

- [ ] **Step 2: Add `maxPets` to the return type and object**

In `UseBookingSchedulerReturn` (near `petAware`/`allowedSpecies` ~L175): add `maxPets: number | null;`. In the returned object (near L551): add `maxPets,`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors from this file.

- [ ] **Step 4: Commit**

```bash
git add src/features/booking/use-booking-scheduler.ts
git commit -m "feat(booking): expose pet selection cardinality and species per service"
```

---

## Task 7: PetAssignment single-select support + thread maxPets

**Files:**

- Modify: `src/features/booking/_components/pet-assignment.tsx`
- Modify: `src/app/(site)/(marketing)/book/[serviceSlug]/_components/use-service-booking.ts` (expose `maxPets`)
- Modify: `src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx` (pass `maxSelect`)

**Interfaces:**

- Consumes: `maxPets` from the scheduler hook.
- Produces: `PetAssignment` accepts optional `maxSelect?: number | null`; when `maxSelect === 1`, selecting a pet replaces the current selection (radio behavior) and the eligible list shows single-select affordance.

- [ ] **Step 1: Add `maxSelect` to PetAssignment**

Add to `PetAssignmentProps`:

```ts
  /** Cap on selected pets. 1 = single-select (radio). null/undefined = unlimited. */
  maxSelect?: number | null;
```

Update `toggle` to honor it:

```ts
function toggle(id: string) {
  if (maxSelect === 1) {
    onChange(selected.includes(id) ? [] : [id]);
    return;
  }
  const next = selected.includes(id)
    ? selected.filter((s) => s !== id)
    : [...selected, id];
  if (typeof maxSelect === "number" && next.length > maxSelect) return;
  onChange(next);
}
```

Destructure `maxSelect` in the function signature. Set the toggle button's `role` for single-select: when `maxSelect === 1`, pass `aria-pressed={isSelected}` stays valid; no other change needed for a11y (still keyboard/focusable buttons).

- [ ] **Step 2: Expose `maxPets` through `use-service-booking.ts`**

Add `maxPets: number | null;` to `UseServiceBookingReturn`, destructure `maxPets` from `sched`, and include `maxPets` in the returned object.

- [ ] **Step 3: Pass `maxSelect` where `PetAssignment` is rendered**

In `service-booking-client.tsx`, find the `<PetAssignment ... />` usage and add `maxSelect={maxPets}` (destructure `maxPets` from the hook return alongside `allowedSpecies`).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors from these files.

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/_components/pet-assignment.tsx "src/app/(site)/(marketing)/book/[serviceSlug]/_components/use-service-booking.ts" "src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx"
git commit -m "feat(booking): single-select pet picker for training"
```

---

## Task 8: Shared profile disclaimer + form-card inline affordances

> Invoke `frontend-design` before this UI task.

**Files:**

- Create: `src/features/accounts/_components/profile-disclaimer.tsx`
- Modify: `src/features/accounts/_components/form-card.tsx`
- Modify: `src/features/accounts/index.client.ts` (export `PROFILE_DISCLAIMER` if needed elsewhere — optional)

**Interfaces:**

- Produces:
  - `PROFILE_DISCLAIMER: string` and `ProfileDisclaimer` component.
  - `FormCard` new optional props: `status?: "complete" | "stale" | "missing"` (drives initial open + stale warning), `onSaved?: () => void` (fires after successful submit).

- [ ] **Step 1: Create the disclaimer**

```tsx
import { Info } from "lucide-react";

export const PROFILE_DISCLAIMER =
  "If anything here feels too sensitive to share, you can leave it blank or write “N/A” and reach out to Cal directly — we’ll work it out together.";

export function ProfileDisclaimer() {
  return (
    <p className="text-muted-foreground border-border bg-muted/40 flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed">
      <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>{PROFILE_DISCLAIMER}</span>
    </p>
  );
}
```

- [ ] **Step 2: Add `status`/`onSaved` to `FormCardProps`**

```ts
  /**
   * Drives initial open + a stale warning when reused inline in the booking flow.
   * complete → collapsed; stale → open in edit mode with a warning; missing →
   * open empty. Omitted → legacy behavior (open when no existing row).
   */
  status?: "complete" | "stale" | "missing";
  /** Fires after a successful submit so a host (booking gate) can re-check. */
  onSaved?: () => void;
```

- [ ] **Step 3: Use them in `FormCard`**

Change the initial open state and add the warning + disclaimer. Replace `const [open, setOpen] = useState(!existing);` with:

```ts
const [open, setOpen] = useState(
  status === undefined ? !existing : status !== "complete",
);
```

In the success branch of `handleSubmit` (after `setSubmitted(true); setOpen(false);`), add:

```ts
onSaved?.();
```

Inside the `<form>` body, before `<ProfileFields .../>`, add the stale warning and disclaimer:

```tsx
{
  status === "stale" && (
    <p
      role="status"
      className="text-foreground border-border bg-muted rounded-xl border p-3 text-xs leading-relaxed"
    >
      You filled this out a while ago. Please review it and save to confirm
      it&apos;s still accurate.
    </p>
  );
}
<ProfileDisclaimer />;
```

Import `ProfileDisclaimer` from `./profile-disclaimer`. (Destructure `status` and `onSaved` from props.)

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit` then `npm run lint -- src/features/accounts/_components/form-card.tsx src/features/accounts/_components/profile-disclaimer.tsx`
Expected: clean for these files.

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/_components/form-card.tsx src/features/accounts/_components/profile-disclaimer.tsx
git commit -m "feat(accounts): inline status, stale warning, and privacy disclaimer on form cards"
```

---

## Task 9: Server-load client form responses for the booking page

**Files:**

- Modify: `src/app/(site)/(marketing)/book/[serviceSlug]/page.tsx`
- Modify: `src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx` (accept the data prop)

**Interfaces:**

- Produces: a `formResponses` prop passed into the booking client — `Record<string, { data: Record<string, unknown> }>` keyed by a scope key (`formKey` for account forms, `${formKey}:${petId}` for pet forms). Only loaded for `authState === "ready"` clients.

- [ ] **Step 1: Load responses in `page.tsx`**

In the server component, for the logged-in client (when a user exists), query `form_responses`:

```ts
const { data: formRows } = user
  ? await supabase
      .from("form_responses")
      .select("form_key, pet_id, data")
      .eq("client_id", user.id)
  : { data: null };

const formResponses: Record<string, { data: Record<string, unknown> }> = {};
for (const r of formRows ?? []) {
  const key = r.pet_id ? `${r.form_key}:${r.pet_id}` : r.form_key;
  formResponses[key] = { data: (r.data ?? {}) as Record<string, unknown> };
}
```

Pass `formResponses={formResponses}` to the client component. (Use the existing server supabase client + `user` already resolved in this file; if not present, resolve via the same auth pattern used for `authState`.)

- [ ] **Step 2: Accept the prop in `service-booking-client.tsx`**

Add `formResponses: Record<string, { data: Record<string, unknown> }>;` to the component props and thread it to `RequirementsGate` (Task 10).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors from page.tsx (RequirementsGate signature change lands in Task 10).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(site)/(marketing)/book/[serviceSlug]/page.tsx" "src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx"
git commit -m "feat(booking): load client form responses for inline gate prefill"
```

---

## Task 10: Inline RequirementsGate using FormCard + gate refresh

> Invoke `frontend-design` before this UI task.

**Files:**

- Modify: `src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx`
- Modify: `src/app/(site)/(marketing)/book/[serviceSlug]/_components/use-service-booking.ts`

**Interfaces:**

- Consumes: `RequirementItem` (now `formKey`), `FormCard`, `submitForm`, `EXPENSE_AUTH_*`/`acceptAuthorization` for the owner card, `formResponses` (Task 9), `refreshRequirements`.
- Produces: `RequirementsGate` renders one `FormCard` per requirement (complete collapsed, incomplete auto-open) and hard-blocks submit. `use-service-booking` exposes `refreshRequirements: () => void`.

- [ ] **Step 1: Expose `refreshRequirements` from the hook**

In `use-service-booking.ts`, add to the return type `refreshRequirements: () => void;`. Implement it by re-running the preview body:

```ts
function refreshRequirements() {
  void runPreviewRef.current();
}
```

Add `refreshRequirements,` to the returned object.

- [ ] **Step 2: Update `requirementLabel` for the new keys**

```ts
function requirementLabel(
  item: RequirementItem,
  pets: AssignablePet[],
): string {
  switch (item.formKey) {
    case "owner":
      return "Owner & emergency contacts";
    case "home_access":
      return "Home access";
    case "home_sitting":
      return "House-sitting details";
    default: {
      const name = item.petId
        ? pets.find((p) => p.id === item.petId)?.name
        : undefined;
      const kind = item.formKey === "pet_walk" ? "walks & outings" : "care";
      return name ? `${name} — ${kind}` : kind;
    }
  }
}
```

- [ ] **Step 3: Rewrite `RequirementsGate` to render inline form-cards**

Replace the component body. Each requirement becomes a `FormCard` with the right `formKey`, `petId`, `status`, prefilled `existing`, `onSubmit={submitForm}`, and `onSaved={refreshRequirements}`. Owner gets the `auth` config:

```tsx
function RequirementsGate({
  requirements,
  pets,
  formResponses,
  auth,
  onSaved,
}: {
  requirements: RequirementItem[];
  pets: AssignablePet[];
  formResponses: Record<string, { data: Record<string, unknown> }>;
  auth: AuthConfig;
  onSaved: () => void;
}) {
  return (
    <section aria-labelledby="gate-requirements-heading">
      <Surface variant="plain" className="p-6">
        <h2
          id="gate-requirements-heading"
          className="font-heading text-foreground mb-1 text-base font-semibold"
        >
          A few things on file before booking
        </h2>
        <p className="text-muted-foreground mb-4 text-sm">
          So Cal has what&apos;s needed to care for your pets. Complete or
          reconfirm these to finish booking.
        </p>
        <div className="flex flex-col gap-3">
          {requirements.map((item) => {
            const scopeKey = item.petId
              ? `${item.formKey}:${item.petId}`
              : item.formKey;
            return (
              <FormCard
                key={scopeKey}
                formKey={item.formKey}
                petId={item.petId ?? null}
                title={requirementLabel(item, pets)}
                status={item.status}
                existing={formResponses[scopeKey]}
                onSubmit={submitForm}
                onSaved={onSaved}
                auth={item.formKey === "owner" ? auth : undefined}
              />
            );
          })}
        </div>
      </Surface>
    </section>
  );
}
```

Add imports: `FormCard`, `submitForm`, `acceptAuthorization`, `EXPENSE_AUTH_KIND`, `EXPENSE_AUTH_VERSION`, `EXPENSE_AUTH_TEXT`, and type `AuthConfig` from `@/features/accounts` / `@/features/accounts/index.client`. Remove the now-unused `REQUIREMENT_STATUS_TEXT`, `buttonVariants`, and the deep-link `<Link>`.

- [ ] **Step 4: Build the `auth` config and pass props at the call site**

At the `<RequirementsGate ... />` usage (~L284), pass `formResponses`, `onSaved={refreshRequirements}`, and an `auth` built from the client's current authorization state. The owner card needs `acceptedVersion`/`acceptedAt` — derive from a server-provided prop (reuse whatever the account page passes; if not yet available on this surface, pass `acceptedVersion: null, acceptedAt: null` so a fresh accept is required, and wire `onAccept` to `acceptAuthorization`):

```tsx
const auth: AuthConfig = {
  acceptedVersion: authzAcceptedVersion ?? null,
  acceptedAt: authzAcceptedAt ?? null,
  currentVersion: EXPENSE_AUTH_VERSION,
  text: EXPENSE_AUTH_TEXT,
  onAccept: (name) =>
    acceptAuthorization({
      kind: EXPENSE_AUTH_KIND,
      version: EXPENSE_AUTH_VERSION,
      acceptedName: name,
    }),
};
```

(If `authzAcceptedVersion`/`authzAcceptedAt` aren't already plumbed to this client, add them as props sourced in `page.tsx` from the `authorizations` table — mirror the account forms page. Keep null-safe defaults.)

- [ ] **Step 5: Typecheck + lint + targeted tests**

Run: `npx tsc --noEmit` then `npm run lint` then `npm run test -- messages`
Expected: clean; `messages.ts` `profiles_incomplete` handling still compiles (it doesn't read `.profile`).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx" "src/app/(site)/(marketing)/book/[serviceSlug]/_components/use-service-booking.ts"
git commit -m "feat(booking): complete required profiles inline in the booking flow"
```

---

## Task 11: Account forms page — load new keys per pet

**Files:**

- Modify: `src/app/(site)/(account)/account/forms/page.tsx`

**Interfaces:**

- Produces: data passed to `forms-client` — account responses for `owner`/`home_access`/`home_sitting` and per-pet responses for `pet_care`/`pet_walk`, plus the pet list (id/name/species) so the client can render per-pet groups and skip `pet_walk` for cats.

- [ ] **Step 1: Update the server load**

Replace the form-key references (`home`, `pet`) with the new keys. Load all `form_responses` for the client and group: account responses keyed by `form_key`; pet responses keyed by `${form_key}:${pet_id}`. Load pets with `id, name, species`. Pass `accountForms`, `petForms`, and `pets` to `FormsClient`. (Follow the existing query shape; only the key set and grouping change.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only in `forms-client.tsx` (Task 12).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(site)/(account)/account/forms/page.tsx"
git commit -m "feat(accounts): load split form keys per pet on the forms page"
```

---

## Task 12: Account forms page — per-pet accordion + "required for" labels

> Invoke `frontend-design` before this UI task.

**Files:**

- Modify: `src/app/(site)/(account)/account/forms/_components/forms-client.tsx`

**Interfaces:**

- Consumes: `servicesRequiring` from `@/features/booking/index.client`, `FormCard`, the account/pet data from Task 11.
- Produces: top-level account cards (owner, home_access, home_sitting) each labeled with the services that require them; a per-pet accordion section (heading = pet name) containing that pet's `pet_care` + `pet_walk` (pet_walk only for dogs).

- [ ] **Step 1: Add a "required for" label helper**

Map pricing_type → human label and render under each card:

```tsx
const SERVICE_LABELS: Record<string, string> = {
  house_sitting: "House-sitting",
  check_in: "Check-ins",
  walk: "Dog walks",
  training: "Training",
  meet_greet: "Meet & greet",
};

function RequiredFor({ formKey }: { formKey: FormKey }) {
  const services = servicesRequiring(formKey as never)
    .map((s) => SERVICE_LABELS[s])
    .filter(Boolean);
  if (services.length === 0) return null;
  return (
    <p className="text-muted-foreground text-xs">
      Required for: {services.join(", ")}
    </p>
  );
}
```

(`servicesRequiring` only accepts `RequiredFormKey`; guard the legacy `emergency` key by not rendering `RequiredFor` for it.)

- [ ] **Step 2: Render account cards with labels**

For `owner`, `home_access`, `home_sitting`, render a `FormCard` (owner keeps the `auth` config already wired on this page) with `<RequiredFor formKey={key} />` beside/under each.

- [ ] **Step 3: Render the per-pet accordion**

For each pet, render a section with the pet's name as a heading (use the existing `Surface`/`Eyebrow` primitives or an accordion primitive already in the component system — no new component, no drop shadow). Inside, render `pet_care` always and `pet_walk` only when `pet.species === "dog"`, each as a `FormCard` with `petId={pet.id}`, prefilled `existing` from `petForms[`${key}:${pet.id}`]`, and a `<RequiredFor />` label.

```tsx
{
  pets.map((pet) => (
    <section key={pet.id} aria-label={`${pet.name} forms`}>
      <Eyebrow>{pet.name}</Eyebrow>
      <div className="flex flex-col gap-3">
        <FormCard
          formKey="pet_care"
          petId={pet.id}
          existing={petForms[`pet_care:${pet.id}`]}
          onSubmit={submitForm}
          title={`${pet.name} — care`}
        />
        {pet.species === "dog" && (
          <FormCard
            formKey="pet_walk"
            petId={pet.id}
            existing={petForms[`pet_walk:${pet.id}`]}
            onSubmit={submitForm}
            title={`${pet.name} — walks & outings`}
          />
        )}
      </div>
    </section>
  ));
}
```

- [ ] **Step 4: Typecheck + lint + build**

Run: `npx tsc --noEmit` then `npm run lint` then `npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(site)/(account)/account/forms/_components/forms-client.tsx"
git commit -m "feat(accounts): group pet forms per pet and show which services require each"
```

---

## Task 13: Update DESIGN.md + full verification

**Files:**

- Modify: `docs/DESIGN.md`

- [ ] **Step 1: Update the data-model section**

In the form*responses / requirement-gate area, replace the `owner/home/pet` form-key list with the five keys (`owner`, `home_access`, `home_sitting`, `pet_care`, `pet_walk`), note `pet_walk` is dog-only (species-gated), and that house_sitting/walk/check_in/training are all pet-aware (training single-dog; only house_sitting/walk price by headcount). Bump the `\_Last reviewed*`footer to`2026-06-16`.

- [ ] **Step 2: Full pure-test + typecheck + lint + build sweep**

Run: `npm run test`
Expected: PASS for pure unit tests. Booking INTEGRATION tests may fail on `slot_taken`/quote-mismatch — environmental (fixed slots vs local dev bookings), NOT this work. Confirm no NEW failures in `required-profiles`, `forms-gate`, `booking-service`, `create-booking.mutation`, `edit-booking`, account tests.

Run: `npx tsc --noEmit` → clean.
Run: `npm run lint` → clean.
Run: `npm run build` → success.

- [ ] **Step 3: Commit**

```bash
git add docs/DESIGN.md
git commit -m "docs: document split intake forms and pet-aware services"
```

---

## Self-Review

**Spec coverage:**

- G1 decomposition → Tasks 1, 3, 4 (manifest, schemas, field groups). ✓
- Optional/required indicators → Task 4. ✓
- `additional_notes` on all five → Tasks 3 (schema) + 4 (field group). ✓
- Per-form disclaimer → Task 8. ✓
- Manifest species predicate + gate → Task 1; wiring → Task 5. ✓
- `servicesRequiring` → Task 2; used Task 12. ✓
- check_in/training pet-aware → Tasks 5 (server) + 6 (scheduler); training single-dog → Tasks 6 + 7. ✓
- G2 inline completion (status/stale/missing, onSaved refresh, hard-block, prefill) → Tasks 8, 9, 10. ✓
- G3 required-for labels + per-pet accordion → Tasks 11, 12. ✓
- Docs same-commit → Task 13 (and DESIGN noted where files move). ✓

**Placeholder scan:** No TBD/TODO; UI tasks that follow existing file patterns reference exact props/keys and provide the changed code blocks. Where a prop may not yet be plumbed (auth acceptance on the booking surface), the plan states the null-safe default and the source to mirror.

**Type consistency:** `formKey` (not `profile`) used consistently across `RequirementItem`, gate read, `requirementLabel`, and warnings. Form keys (`home_access`/`home_sitting`/`pet_care`/`pet_walk`) match across schemas, registry, profile-fields `PROFILE_GROUPS`, gate read, and account page. `maxPets` (scheduler) → `maxSelect` (PetAssignment prop) mapping is explicit in Task 7.
