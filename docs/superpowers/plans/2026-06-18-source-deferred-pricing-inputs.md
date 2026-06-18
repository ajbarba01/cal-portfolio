# Source Deferred Pricing Inputs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the three dormant pricing-engine inputs (`anyDogUnder6mo`, `needyTier`, `leashManners`) to real data so their seeded modifiers fire.

**Architecture:** `anyDogUnder6mo` is derived server-side from a new structured `pets.birthdate` against the booking start. `needyTier` is derived from a new per-booking house-sit "max hours Cal can be away" input via a pure ladder. `leashManners` is a new per-booking walk opt-in. All quoting routes through `computeBookingArtifacts` → `buildQuoteInput`, so the engine wiring lands in one place; the engine itself (`evaluate.ts`) already consumes all three fields and is unchanged.

**Tech Stack:** TypeScript (strict), Zod, Supabase, Next.js App Router, React, Vitest.

## Global Constraints

- **TypeScript `strict`, no `any`.** (CODE_STYLE / ENGINEERING)
- **Core logic pure and tested.** Helpers take injected inputs; no clock/DB reads inside pure code.
- **Commit messages: subject line only.** Conventional Commits, no body, no `Co-Authored-By`/trailer/footer. No project-internal identifiers (no phase numbers / plan codenames) in the subject.
- **Stage by name.** `git add <exact paths>` only. NEVER `git add -A`/`-am`. Unrelated uncommitted files exist (`TEMP.md`, `docs/DEV_NOTES.md`, `src/content/marketing.ts`, `SYNC.md`) — leave them.
- **Single `main` branch, no worktree.** (repo rule)
- **Pre-commit hook** = `lint-staged` + full `tsc`. Must pass WITHOUT `--no-verify`.
- **Per-task gate** = the task's own unit tests + `tsc`. DB-integration suites (admin/booking repo tests) need a seeded local Supabase stack and are NOT a per-task gate. ~5 pre-existing failing files are unrelated (admin DB tests, integration tests, a back-to-top render test) — do not try to fix them.
- **Design tokens are law; accessibility floor; mobile parity.** UI tasks reuse existing primitives (`FormField`, `StepperField`, `Switch`) which already satisfy tokens + responsiveness. Invoke the `frontend-design` skill before any UI task (repo rule).
- **PowerShell mojibakes UTF-8 source edits** — use Edit/Write tools only for source, never PowerShell here-strings into files.
- **Behavioral change.** This work changes quote amounts; it ships behind a maintainer behavioral sign-off + coordinated migration/deploy. Do NOT push or deploy as part of execution.

**Spec:** `docs/superpowers/specs/2026-06-18-source-deferred-pricing-inputs-design.md`

---

### Task 1: needyTier ladder (pure helper)

**Files:**

- Create: `src/features/booking/needy-tier.ts`
- Test: `src/features/booking/needy-tier.test.ts`

**Interfaces:**

- Produces: `type NeedyTier = 0 | 1 | 2 | 3 | 4`; `needyTierFromHoursAway(maxHoursAway: number | undefined): NeedyTier`; `representativeHoursFromNeedyTier(needyTier: number): number`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/booking/needy-tier.test.ts
import { describe, it, expect } from "vitest";
import {
  needyTierFromHoursAway,
  representativeHoursFromNeedyTier,
} from "./needy-tier";

describe("needyTierFromHoursAway", () => {
  it("maps hours to tier at the bucket boundaries", () => {
    expect(needyTierFromHoursAway(undefined)).toBe(0);
    expect(needyTierFromHoursAway(8)).toBe(0);
    expect(needyTierFromHoursAway(10)).toBe(0);
    expect(needyTierFromHoursAway(7.99)).toBe(1);
    expect(needyTierFromHoursAway(6)).toBe(1);
    expect(needyTierFromHoursAway(5.99)).toBe(2);
    expect(needyTierFromHoursAway(4)).toBe(2);
    expect(needyTierFromHoursAway(3.99)).toBe(3);
    expect(needyTierFromHoursAway(2)).toBe(3);
    expect(needyTierFromHoursAway(1.99)).toBe(4);
    expect(needyTierFromHoursAway(0)).toBe(4);
  });
});

describe("representativeHoursFromNeedyTier", () => {
  it("returns a value inside each tier's bucket (price-exact round-trip)", () => {
    for (const tier of [0, 1, 2, 3, 4] as const) {
      const hours = representativeHoursFromNeedyTier(tier);
      expect(needyTierFromHoursAway(hours)).toBe(tier);
    }
  });

  it("treats unknown tiers as no surcharge (tier 0)", () => {
    expect(representativeHoursFromNeedyTier(99)).toBe(8);
    expect(needyTierFromHoursAway(representativeHoursFromNeedyTier(99))).toBe(
      0,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/needy-tier.test.ts`
Expected: FAIL — cannot resolve `./needy-tier`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/booking/needy-tier.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/booking/needy-tier.test.ts`
Expected: PASS (2 suites).

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/needy-tier.ts src/features/booking/needy-tier.test.ts
git commit -m "feat(pricing): needy-tier ladder helper"
```

---

### Task 2: puppy age (pure helper)

**Files:**

- Create: `src/features/booking/puppy-age.ts`
- Test: `src/features/booking/puppy-age.test.ts`

**Interfaces:**

- Produces: `isUnderSixMonths(birthdate: string | null | undefined, asOf: Date): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/booking/puppy-age.test.ts
import { describe, it, expect } from "vitest";
import { isUnderSixMonths } from "./puppy-age";

describe("isUnderSixMonths", () => {
  const asOf = new Date("2026-06-18T12:00:00Z");

  it("is false for missing / unparseable birthdates", () => {
    expect(isUnderSixMonths(null, asOf)).toBe(false);
    expect(isUnderSixMonths(undefined, asOf)).toBe(false);
    expect(isUnderSixMonths("", asOf)).toBe(false);
    expect(isUnderSixMonths("not-a-date", asOf)).toBe(false);
  });

  it("is true for a dog born under 6 months before asOf", () => {
    expect(isUnderSixMonths("2026-02-01", asOf)).toBe(true); // ~4.5 months
  });

  it("is false for a dog 6+ months old", () => {
    expect(isUnderSixMonths("2025-12-18", asOf)).toBe(false); // exactly 6 months → no longer under
    expect(isUnderSixMonths("2025-06-18", asOf)).toBe(false); // 1 year
  });

  it("is true the day before the 6-month mark and false on it", () => {
    expect(isUnderSixMonths("2025-12-19", asOf)).toBe(true); // mark is 2026-06-19 > asOf
    expect(isUnderSixMonths("2025-12-18", asOf)).toBe(false); // mark is 2026-06-18, not < asOf
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/puppy-age.test.ts`
Expected: FAIL — cannot resolve `./puppy-age`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/booking/puppy-age.ts
/**
 * True when `birthdate` (an ISO `YYYY-MM-DD` date) is strictly less than six
 * calendar months before `asOf`. Null / empty / unparseable input → false: a pet
 * with no recorded birthdate receives no puppy benefit.
 *
 * "Under 6 months" holds until the day-of-month six months after birth; on and
 * after that mark the pet is no longer under 6mo. Compared at month granularity
 * via UTC, which is sufficient for a pricing threshold (no DST sensitivity).
 * Pure: `asOf` is injected.
 */
export function isUnderSixMonths(
  birthdate: string | null | undefined,
  asOf: Date,
): boolean {
  if (!birthdate) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthdate);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const sixMonthMark = new Date(Date.UTC(year, month - 1 + 6, day));
  if (Number.isNaN(sixMonthMark.getTime())) return false;
  return asOf.getTime() < sixMonthMark.getTime();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/booking/puppy-age.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/puppy-age.ts src/features/booking/puppy-age.test.ts
git commit -m "feat(pricing): puppy-age helper"
```

---

### Task 3: Quantity schemas + buildQuoteInput wiring

**Files:**

- Modify: `src/features/booking/booking-service-shared.ts` (schemas `houseSittingQuantitiesSchema`, `walkQuantitiesSchema`; `buildQuoteInput`)
- Test: `src/features/booking/build-quote-input.test.ts`

**Interfaces:**

- Consumes: `needyTierFromHoursAway` (Task 1).
- Produces: `buildQuoteInput(opts)` now requires an `anyDogUnder6mo: boolean` field in `opts`; sets `QuoteInput.needyTier` (house_sitting, from `maxHoursAway`), `QuoteInput.leashManners` (walk), and `QuoteInput.anyDogUnder6mo` (all types). Parsed house-sit quantities carry optional `maxHoursAway: number`; parsed walk quantities carry optional `leashManners: boolean`.

- [ ] **Step 1: Write the failing test**

Add these cases to `src/features/booking/build-quote-input.test.ts`. Also update the four EXISTING `buildQuoteInput({...})` calls in that file to include `anyDogUnder6mo: false` (the new required opt), or they will not compile.

```ts
it("house_sitting: derives needyTier from maxHoursAway and carries anyDogUnder6mo", () => {
  const qi = buildQuoteInput({
    config: HS_CONFIG,
    quantities: {
      pricingType: "house_sitting",
      data: { dogs: 1, cats: 0, nights: 2, maxHoursAway: 3 },
    },
    billableMiles: 0,
    premiumNights: 0,
    recurringSeries: false,
    applyKiche: false,
    anyDogUnder6mo: true,
  });
  expect(qi.needyTier).toBe(3); // [2,4) → tier 3
  expect(qi.anyDogUnder6mo).toBe(true);
});

it("house_sitting: needyTier defaults to 0 when maxHoursAway is absent or >= 8", () => {
  const qi = buildQuoteInput({
    config: HS_CONFIG,
    quantities: {
      pricingType: "house_sitting",
      data: { dogs: 1, cats: 0, nights: 2 },
    },
    billableMiles: 0,
    premiumNights: 0,
    recurringSeries: false,
    applyKiche: false,
    anyDogUnder6mo: false,
  });
  expect(qi.needyTier).toBe(0);
  expect(qi.anyDogUnder6mo).toBe(false);
});

it("walk: carries leashManners opt-in", () => {
  const qi = buildQuoteInput({
    config: WALK_CONFIG,
    quantities: {
      pricingType: "walk",
      data: { hours: 1, dogs: 1, leashManners: true },
    },
    billableMiles: 0,
    premiumNights: 0,
    recurringSeries: false,
    applyKiche: false,
    anyDogUnder6mo: false,
  });
  expect(qi.leashManners).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/build-quote-input.test.ts`
Expected: FAIL — `anyDogUnder6mo` not in opts type / `needyTier` undefined.

- [ ] **Step 3: Add schema fields**

In `src/features/booking/booking-service-shared.ts`, add `maxHoursAway` to `houseSittingQuantitiesSchema`:

```ts
const houseSittingQuantitiesSchema = z.object({
  dogs: z.number().int().min(0),
  cats: z.number().int().min(0),
  nights: z.number().positive(),
  cantBeLeftAloneDays: z.number().int().min(0).optional(),
  walkMinutesPerDay: z.number().min(0).optional(),
  maxHoursAway: z.number().min(0).optional(),
  holidayDays: z.number().int().min(0).optional(),
});
```

Add `leashManners` to `walkQuantitiesSchema`:

```ts
const walkQuantitiesSchema = z.object({
  hours: z.number().positive(),
  dogs: z.number().int().min(1),
  leashManners: z.boolean().optional(),
  // Server-injected after Zod parse — accepted here so buildQuoteInput can propagate them.
  holidayDays: z.number().int().min(0).optional(),
  holidaySurchargeCents: z.number().int().nonnegative().optional(),
});
```

- [ ] **Step 4: Wire buildQuoteInput**

In the same file, add the import near the top (after the existing local imports):

```ts
import { needyTierFromHoursAway } from "./needy-tier";
```

Update the `buildQuoteInput` opts type to require `anyDogUnder6mo` and set the fields. Change the `opts` parameter object to add:

```ts
/** Server-derived: any assigned dog under 6 months at the booking start. */
anyDogUnder6mo: boolean;
```

Update the `base` object to carry the flag:

```ts
const base: QuoteInput = {
  config: opts.config,
  premiumNights: opts.premiumNights,
  billableMiles: opts.billableMiles,
  recurringSeries: opts.recurringSeries,
  anyDogUnder6mo: opts.anyDogUnder6mo,
  enabledManualIds: opts.applyKiche ? ["kiche"] : [],
};
```

Update the house_sitting and walk cases:

```ts
    case "house_sitting":
      return {
        ...base,
        dogs: q.data.dogs,
        cats: q.data.cats,
        nights: q.data.nights,
        exerciseMinutesPerDay: q.data.walkMinutesPerDay,
        needyTier: needyTierFromHoursAway(q.data.maxHoursAway),
      };

    case "walk":
      return {
        ...base,
        hours: q.data.hours,
        dogs: q.data.dogs,
        leashManners: q.data.leashManners ?? false,
      };
```

Also update the `buildQuoteInput` JSDoc line that says "needyTier / anyDogUnder6mo / leashManners are left unset (Phase 2 sources them)." Replace with: "needyTier (house-sit, from maxHoursAway), leashManners (walk), and anyDogUnder6mo (server-derived) are now sourced here."

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/features/booking/build-quote-input.test.ts`
Expected: PASS (existing + 3 new cases).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. (If `computeBookingArtifacts` — the only production caller — now fails to compile because it lacks `anyDogUnder6mo`, that is fixed in Task 4. To keep this task self-contained, temporarily pass `anyDogUnder6mo: false` at the `buildQuoteInput` call in `computeBookingArtifacts` (line ~757); Task 4 replaces it with the real derivation.)

- [ ] **Step 7: Commit**

```bash
git add src/features/booking/booking-service-shared.ts src/features/booking/build-quote-input.test.ts
git commit -m "feat(pricing): source needy/puppy/leash inputs in buildQuoteInput"
```

---

### Task 4: Read path — birthdate fetch + anyDogUnder6mo derivation

**Files:**

- Modify: `src/features/booking/booking-repository.ts` (`PetRef` interface; `getPetsByIds` select + mapper)
- Modify: `src/features/booking/booking-service-shared.ts` (`computeBookingArtifacts`: ownedPets type, derive `anyDogUnder6mo`, pass it to `buildQuoteInput`)

**Interfaces:**

- Consumes: `isUnderSixMonths` (Task 2); `buildQuoteInput` `anyDogUnder6mo` opt (Task 3).
- Produces: `PetRef` gains `birthdate: string | null`.

- [ ] **Step 1: Extend PetRef + getPetsByIds**

In `src/features/booking/booking-repository.ts`, extend `PetRef`:

```ts
/** A pet owned by the caller, used to derive server-trusted booking counts. */
export interface PetRef {
  id: string;
  species: PetSpeciesDb;
  birthdate: string | null;
}
```

Update the `getPetsByIds` select string and mapper:

```ts
const { data, error } = await client
  .from("pets")
  .select("id, species, birthdate")
  .eq("client_id", userId)
  .in("id", petIds);

if (error) {
  throw new Error(`Failed to load pets: ${error.message}`);
}
return (data ?? []).map(
  (r: { id: string; species: string; birthdate: string | null }) => ({
    id: r.id,
    species: r.species as PetSpeciesDb,
    birthdate: r.birthdate ?? null,
  }),
);
```

- [ ] **Step 2: Derive anyDogUnder6mo in computeBookingArtifacts**

In `src/features/booking/booking-service-shared.ts`, add the import:

```ts
import { isUnderSixMonths } from "./puppy-age";
```

Widen the `ownedPets` local type (the `let ownedPets: ...` declaration) to include birthdate:

```ts
let ownedPets: { id: string; species: PetSpecies; birthdate: string | null }[] =
  [];
```

Immediately before the `buildQuoteInput({ ... })` call (after `billableMiles` is computed), derive the flag:

```ts
// Puppy modifiers fire when any assigned DOG is under 6 months at the stay
// start. Derived server-side from the owned pets' birthdates (never client input).
const anyDogUnder6mo = ownedPets.some(
  (p) => p.species === "dog" && isUnderSixMonths(p.birthdate, input.startsAt),
);
```

Pass it into the call (replacing the Task 3 temporary `anyDogUnder6mo: false`):

```ts
const quoteInput = buildQuoteInput({
  config: pricingConfig,
  quantities,
  billableMiles,
  premiumNights,
  recurringSeries: recurringDiscountApplies,
  applyKiche: opts?.applyKiche ?? false,
  anyDogUnder6mo,
});
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Run the touched booking unit suites**

Run: `npx vitest run src/features/booking/build-quote-input.test.ts src/features/booking/needy-tier.test.ts src/features/booking/puppy-age.test.ts`
Expected: PASS. (The DB-integration suites that exercise `computeBookingArtifacts`/`getPetsByIds` against Supabase are not a gate — they require the seeded local stack.)

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/booking-repository.ts src/features/booking/booking-service-shared.ts
git commit -m "feat(pricing): derive anyDogUnder6mo from pet birthdate"
```

---

### Task 5: pets.birthdate migration + client write path

**Files:**

- Create: `supabase/migrations/20260618130000_pets_birthdate.sql`
- Modify: `src/features/accounts/account-actions.ts` (`petSchema`, `Pet`, `PET_COLUMNS`, `runCreatePet` insert, `runUpdatePet` update)

**Interfaces:**

- Produces: `PetInput` gains optional `birthdate?: string`; `Pet` gains `birthdate: string | null`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260618130000_pets_birthdate.sql
-- Structured birth date for a pet, used to derive puppy pricing (any dog under
-- 6 months at a booking's start fires the puppy household / puppy training
-- modifiers). Distinct from the freeform `age` text column, which is display-only.
--
-- pets already grants table-level UPDATE/INSERT to `authenticated`; RLS
-- (client_id = auth.uid()) scopes writes to the owner, so no new grant is needed.
alter table pets
  add column if not exists birthdate date;
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase migration up --local`
Expected: applies `20260618130000_pets_birthdate` with no error. (If the local stack is not running, start it with `npx supabase start` first. Never point migrations at prod here.)

- [ ] **Step 3: Update petSchema, Pet, PET_COLUMNS, and the write payloads**

In `src/features/accounts/account-actions.ts`:

`petSchema`:

```ts
const petSchema = z.object({
  name: z.string().min(1, "Pet name is required").max(FIELD_LIMITS.name),
  species: z.enum(["dog", "cat"]).default("dog"),
  breed: z.string().max(FIELD_LIMITS.shortText).optional(),
  notes: z.string().max(FIELD_LIMITS.note).optional(),
  birthdate: z
    .string()
    .date()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
```

`Pet` interface — add `birthdate`:

```ts
export interface Pet {
  id: string;
  name: string;
  species: "dog" | "cat";
  breed: string | null;
  notes: string | null;
  birthdate: string | null;
  photo_url: string | null;
}
```

`PET_COLUMNS`:

```ts
const PET_COLUMNS = "id, name, species, breed, notes, birthdate, photo_url";
```

`runCreatePet` insert object — add `birthdate`:

```ts
    .insert({
      client_id: userId,
      name: parsed.data.name,
      species: parsed.data.species,
      breed: parsed.data.breed ?? null,
      notes: parsed.data.notes ?? null,
      birthdate: parsed.data.birthdate ?? null,
    })
```

`runUpdatePet` update object — add `birthdate`:

```ts
    .update({
      name: parsed.data.name,
      species: parsed.data.species,
      breed: parsed.data.breed ?? null,
      notes: parsed.data.notes ?? null,
      birthdate: parsed.data.birthdate ?? null,
    })
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260618130000_pets_birthdate.sql src/features/accounts/account-actions.ts
git commit -m "feat(accounts): add pet birthdate column and write path"
```

---

### Task 6: Admin on-behalf pet birthdate mirror

**Files:**

- Modify: `src/features/admin/onbehalf-actions.ts` (local `petSchema`, `PET_COLUMNS`, `adminCreatePet` insert, `adminUpdatePet` update)

**Interfaces:**

- Consumes: `Pet` shape from Task 5 (already includes `birthdate`).

- [ ] **Step 1: Update the duplicated petSchema**

In `src/features/admin/onbehalf-actions.ts`, mirror the birthdate field on the local `petSchema`:

```ts
const petSchema = z.object({
  name: z.string().min(1, "Pet name is required").max(FIELD_LIMITS.name),
  species: z.enum(["dog", "cat"]).default("dog"),
  breed: z.string().max(FIELD_LIMITS.shortText).optional(),
  notes: z.string().max(FIELD_LIMITS.note).optional(),
  birthdate: z
    .string()
    .date()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
```

- [ ] **Step 2: Update PET_COLUMNS and the write payloads**

`PET_COLUMNS`:

```ts
const PET_COLUMNS = "id, name, species, breed, notes, birthdate, photo_url";
```

`adminCreatePet` insert object — add `birthdate: parsed.data.birthdate ?? null,` alongside `notes`.

`adminUpdatePet` update object — add `birthdate: parsed.data.birthdate ?? null,` alongside `notes`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/onbehalf-actions.ts
git commit -m "feat(admin): persist pet birthdate on on-behalf writes"
```

---

### Task 7: PetForm birthdate input

> Invoke the `frontend-design` skill before editing UI (repo rule). The field reuses `FormField type="date"`, so it inherits tokens, focus, and responsive grid behavior — no new styling.

**Files:**

- Modify: `src/features/accounts/_components/pet-form.tsx`

**Interfaces:**

- Consumes: `PetInput`/`Pet` with `birthdate` (Task 5).

- [ ] **Step 1: Seed birthdate into form state**

In `src/features/accounts/_components/pet-form.tsx`, add `birthdate` to the initial `values`:

```ts
const [values, setValues] = useState<PetInput>({
  name: initial?.name ?? "",
  species: initial?.species ?? "dog",
  breed: initial?.breed ?? "",
  notes: initial?.notes ?? "",
  birthdate: initial?.birthdate ?? "",
});
```

- [ ] **Step 2: Render the date field**

Add a `FormField` after the Breed field (inside the form, before Notes):

```tsx
<FormField
  label="Birth date"
  name="birthdate"
  type="date"
  value={values.birthdate ?? ""}
  onChange={(e) => set("birthdate", e.target.value)}
  autoComplete="off"
/>
```

- [ ] **Step 3: Carry birthdate on the optimistic update result**

In the `handleSubmit` update branch, include `birthdate` in the locally-reconstructed `saved` object:

```ts
saved = {
  ...initial,
  name: values.name,
  species: values.species,
  breed: values.breed ?? null,
  notes: values.notes ?? null,
  birthdate: values.birthdate ?? null,
};
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Manual verify (optional, requires dev server)**

`npm run dev` hits PROD data — do NOT use it to write test pets. Skip live verification here; the field is exercised by typecheck + the booking quote tests downstream. If a reviewer wants a visual check, do it against a local stack only.

- [ ] **Step 6: Commit**

```bash
git add src/features/accounts/_components/pet-form.tsx
git commit -m "feat(accounts): pet birthdate field in the pet form"
```

---

### Task 8: Quantity-form inputs (maxHoursAway + leashManners)

> Invoke the `frontend-design` skill before editing UI (repo rule). Reuses the existing `StepperField` and `Switch` primitives.

**Files:**

- Modify: `src/features/booking/_components/quantity-forms.tsx` (`HouseSittingExtras`, walk state shape, `defaultQuantities`, `quantitiesToRecord`, `QuantityForm`)

**Interfaces:**

- Produces: `HouseSittingExtras` gains `maxHoursAway: number`; the walk variant of `QuantityState` becomes `{ type: "walk"; qty: WalkQty }` where `WalkQty = { hours: number; leashManners: boolean }`. `quantitiesToRecord` emits `maxHoursAway` (house) and `leashManners` (walk).

- [ ] **Step 1: Extend the state shapes**

In `src/features/booking/_components/quantity-forms.tsx`, add `maxHoursAway` to `HouseSittingExtras`:

```ts
export interface HouseSittingExtras {
  cantBeLeftAloneDays: number;
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
```

Add a `WalkQty` shape and use it in `QuantityState`:

```ts
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
```

- [ ] **Step 2: Update defaultQuantities**

```ts
    case "house_sitting":
      return {
        type: "house_sitting",
        qty: { cantBeLeftAloneDays: 0, walkMinutesPerDay: 0, maxHoursAway: 8 },
      };
    case "check_in":
      return { type: "check_in", qty: { hours: 1 } };
    case "walk":
      return { type: "walk", qty: { hours: 1, leashManners: false } };
```

- [ ] **Step 3: Update quantitiesToRecord**

```ts
    case "house_sitting": {
      const rec: Record<string, unknown> = { nights: nights ?? 0 };
      if (qs.qty.cantBeLeftAloneDays > 0)
        rec.cantBeLeftAloneDays = qs.qty.cantBeLeftAloneDays;
      if (qs.qty.walkMinutesPerDay > 0)
        rec.walkMinutesPerDay = qs.qty.walkMinutesPerDay;
      rec.maxHoursAway = qs.qty.maxHoursAway;
      // holidayDays intentionally omitted — server derives from dates.
      return rec;
    }
    case "check_in":
    case "training":
      return { hours: qs.qty.hours };
    case "walk":
      return { hours: qs.qty.hours, leashManners: qs.qty.leashManners };
```

(Split the previously-combined `check_in | training | walk` case so walk can emit `leashManners`.)

- [ ] **Step 4: Render the house-sit maxHoursAway stepper**

In the `house_sitting` branch of `QuantityForm`, add a `StepperField` after the walk-time field:

```tsx
<StepperField
  id="hs-max-away"
  label="Max hours Cal can be away"
  description="Longest stretch Cal can step out each day. Lower means more on-site attention — and a small needy-care surcharge."
  value={qty.maxHoursAway}
  min={0}
  max={24}
  unit="hr"
  onChange={(v) => set({ maxHoursAway: Math.round(v) })}
/>
```

- [ ] **Step 5: Render the walk leashManners toggle**

The hours-based branch renders `check_in | walk | training` together. After the duration `StepperField` and before the Kiche row, add a walk-only leash toggle. Insert:

```tsx
{
  state.type === "walk" && (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-foreground text-sm font-medium">Leash manners</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Focused leash-manners training during the walk (+$10/hr).
        </p>
      </div>
      <Switch
        checked={state.qty.leashManners}
        onCheckedChange={(v) =>
          onChange({
            type: "walk",
            qty: { ...state.qty, leashManners: v },
          })
        }
        aria-label="Add leash manners training"
      />
    </div>
  );
}
```

Note: the existing hours-branch `onChange` for the duration stepper rebuilds `qty` as `{ hours: clamped }`. For walk this would drop `leashManners`. Update that handler to preserve the rest of the walk qty:

```tsx
        onChange={(v) => {
          const lo = minHours ?? 0.25;
          const clamped = Math.min(Math.max(v, lo), maxHours ?? v);
          if (state.type === "walk") {
            onChange({
              type: "walk",
              qty: { ...state.qty, hours: clamped },
            });
          } else {
            onChange({ type: state.type, qty: { hours: clamped } });
          }
        }}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. (Surfaces consuming `QuantityState` — `use-service-booking`, `use-admin-create-booking`, `use-edit-booking`, `diff-booking-patch` — compile unchanged because they treat the state opaquely and route through `defaultQuantities`/`quantitiesToRecord`. If `tsc` flags a literal `{ hours: 1 }` walk state anywhere, add `leashManners: false`.)

- [ ] **Step 7: Commit**

```bash
git add src/features/booking/_components/quantity-forms.tsx
git commit -m "feat(booking): collect max-hours-away and leash-manners inputs"
```

---

### Task 9: Edit round-trip reconstruction

**Files:**

- Modify: `src/features/booking/quantity-state-from-quote-inputs.ts`
- Modify: `src/features/booking/edit-core.ts` (`quantitiesFromQuoteInputs`)
- Test: `src/features/booking/quantity-state-from-quote-inputs.test.ts`

**Interfaces:**

- Consumes: `representativeHoursFromNeedyTier` (Task 1); the `WalkQty`/`HouseSittingExtras` shapes (Task 8).

- [ ] **Step 1: Update the round-trip test**

Replace `src/features/booking/quantity-state-from-quote-inputs.test.ts` with cases that cover the new fields AND the two real-world input shapes (the `quantitiesToRecord` shape carries `maxHoursAway`/`leashManners`; the stored `QuoteInput` shape carries `needyTier`/`leashManners`):

```ts
import { describe, it, expect } from "vitest";
import { quantityStateFromQuoteInputs } from "./quantity-state-from-quote-inputs";
import { quantitiesToRecord } from "@/features/booking/_components/quantity-forms";

describe("quantityStateFromQuoteInputs", () => {
  it("round-trips house_sitting add-ons including maxHoursAway", () => {
    const state = {
      type: "house_sitting" as const,
      qty: { cantBeLeftAloneDays: 2, walkMinutesPerDay: 30, maxHoursAway: 5 },
    };
    const record = quantitiesToRecord(state, 4);
    expect(quantityStateFromQuoteInputs("house_sitting", record)).toEqual(
      state,
    );
  });

  it("reconstructs maxHoursAway from a stored needyTier (price-exact bucket)", () => {
    // Stored QuoteInput shape: carries needyTier, not the raw hours.
    expect(
      quantityStateFromQuoteInputs("house_sitting", {
        nights: 3,
        needyTier: 3,
      }),
    ).toEqual({
      type: "house_sitting",
      qty: { cantBeLeftAloneDays: 0, walkMinutesPerDay: 0, maxHoursAway: 3 },
    });
  });

  it("defaults missing house_sitting add-ons (maxHoursAway → 8 = no surcharge)", () => {
    expect(
      quantityStateFromQuoteInputs("house_sitting", { nights: 3 }),
    ).toEqual({
      type: "house_sitting",
      qty: { cantBeLeftAloneDays: 0, walkMinutesPerDay: 0, maxHoursAway: 8 },
    });
  });

  it("round-trips walk leashManners", () => {
    const state = {
      type: "walk" as const,
      qty: { hours: 2, leashManners: true },
    };
    const record = quantitiesToRecord(state, null);
    expect(quantityStateFromQuoteInputs("walk", record)).toEqual(state);
  });

  it("round-trips check_in / training hours", () => {
    for (const type of ["check_in", "training"] as const) {
      const state = { type, qty: { hours: 2 } };
      const record = quantitiesToRecord(state, null);
      expect(quantityStateFromQuoteInputs(type, record)).toEqual(state);
    }
  });

  it("defaults walk hours to 1 and leashManners to false when absent", () => {
    expect(quantityStateFromQuoteInputs("walk", {})).toEqual({
      type: "walk",
      qty: { hours: 1, leashManners: false },
    });
  });

  it("maps meet_greet to the empty quantity state", () => {
    expect(quantityStateFromQuoteInputs("meet_greet", {})).toEqual({
      type: "meet_greet",
      qty: {},
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/booking/quantity-state-from-quote-inputs.test.ts`
Expected: FAIL — missing `maxHoursAway`/`leashManners` handling.

- [ ] **Step 3: Update quantityStateFromQuoteInputs**

Replace the body of `src/features/booking/quantity-state-from-quote-inputs.ts`:

```ts
/**
 * Pure inverse of `quantitiesToRecord` — rebuilds a `QuantityState` from a stored
 * jsonb so the edit form can seed its inputs. Handles both shapes the input can
 * take: the raw `quantitiesToRecord` record (carries `maxHoursAway` /
 * `leashManners`) and the persisted `QuoteInput` (carries `needyTier` /
 * `leashManners`). `nights` (house-sitting) is ignored — re-derived from the date
 * range, as the create flow does.
 */
import type { PricingType } from "@/features/pricing";
import type { QuantityState } from "@/features/booking/_components/quantity-forms";
import { representativeHoursFromNeedyTier } from "./needy-tier";

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function reconstructMaxHoursAway(q: Record<string, unknown>): number {
  if (typeof q.maxHoursAway === "number" && Number.isFinite(q.maxHoursAway))
    return q.maxHoursAway;
  if (typeof q.needyTier === "number" && Number.isFinite(q.needyTier))
    return representativeHoursFromNeedyTier(q.needyTier);
  return 8;
}

export function quantityStateFromQuoteInputs(
  pricingType: PricingType,
  quoteInputs: unknown,
): QuantityState {
  const q = (quoteInputs ?? {}) as Record<string, unknown>;
  switch (pricingType) {
    case "house_sitting":
      return {
        type: "house_sitting",
        qty: {
          cantBeLeftAloneDays: num(q.cantBeLeftAloneDays, 0),
          walkMinutesPerDay: num(q.walkMinutesPerDay, 0),
          maxHoursAway: reconstructMaxHoursAway(q),
        },
      };
    case "check_in":
      return { type: "check_in", qty: { hours: num(q.hours, 1) } };
    case "walk":
      return {
        type: "walk",
        qty: {
          hours: num(q.hours, 1),
          leashManners: q.leashManners === true,
        },
      };
    case "training":
      return { type: "training", qty: { hours: num(q.hours, 1) } };
    case "meet_greet":
      return { type: "meet_greet", qty: {} };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/booking/quantity-state-from-quote-inputs.test.ts`
Expected: PASS.

- [ ] **Step 5: Update edit-core's server-side extractor**

The edit re-quote merges `quantitiesFromQuoteInputs(booking.quote_inputs)` into the parsed quantities. The stored `quote_inputs` is a `QuoteInput` (carries `needyTier`/`leashManners`), but `parseQuantities` expects `maxHoursAway`/`leashManners`. Translate them so a date-only edit preserves the surcharge/add-on. In `src/features/booking/edit-core.ts`, update `quantitiesFromQuoteInputs`:

```ts
import { representativeHoursFromNeedyTier } from "./needy-tier";

// ...

/** Extract the raw quantity record from a stored QuoteInput jsonb. */
function quantitiesFromQuoteInputs(qi: unknown): Record<string, unknown> {
  const q = (qi ?? {}) as Record<string, unknown>;
  const keys = ["dogs", "cats", "nights", "hours", "holidayDays"];
  const out: Record<string, unknown> = {};
  for (const k of keys) if (q[k] !== undefined) out[k] = q[k];
  // needyTier (house-sit) is stored on the QuoteInput; re-express it as the
  // maxHoursAway the quantity schema understands (price-exact: re-quote yields
  // the same tier).
  if (typeof q.needyTier === "number")
    out.maxHoursAway = representativeHoursFromNeedyTier(q.needyTier);
  // leashManners (walk) round-trips directly.
  if (typeof q.leashManners === "boolean") out.leashManners = q.leashManners;
  return out;
}
```

(Drop the obsolete `cantBeLeftAloneDays` / `walkMinutesPerDay` keys from the list — `buildQuoteInput` never emits them onto the `QuoteInput`, so they were dead; their omission does not change behavior.)

- [ ] **Step 6: Typecheck + run the touched booking suites**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npx vitest run src/features/booking/quantity-state-from-quote-inputs.test.ts src/features/booking/build-quote-input.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/booking/quantity-state-from-quote-inputs.ts src/features/booking/quantity-state-from-quote-inputs.test.ts src/features/booking/edit-core.ts
git commit -m "feat(booking): round-trip needy and leash inputs through edit"
```

---

### Task 10: Verification + handoff update

**Files:**

- Modify: `docs/superpowers/PRICING-HANDOFF.md` (mark P2 done; record behavioral sign-off + deploy still pending)

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 2: Run all the new + touched unit suites together**

Run: `npx vitest run src/features/booking/needy-tier.test.ts src/features/booking/puppy-age.test.ts src/features/booking/build-quote-input.test.ts src/features/booking/quantity-state-from-quote-inputs.test.ts`
Expected: all PASS.

- [ ] **Step 3: Confirm the pre-existing failing files are unchanged**

Run: `npx vitest run` (optional, slow)
Expected: only the ~5 known pre-existing failures remain (admin DB-integration, booking-service, admin-create-booking.integration, create-booking.mutation, back-to-top render) — all `unavailable`/render failures unrelated to this work. No NEW failures in pricing/booking unit suites.

- [ ] **Step 4: Update the handoff doc**

In `docs/superpowers/PRICING-HANDOFF.md`, under "Carry-forward phases", change the **P2** bullet from a TODO to DONE: note that `anyDogUnder6mo` now derives from `pets.birthdate`, `needyTier` from the house-sit "max hours Cal can be away" ladder, and `leashManners` from the walk opt-in; that `others`/fish stays inert (dog/cat enum); and that the migration `20260618130000_pets_birthdate.sql` is **not pushed to prod** and the quote-amount changes still need the maintainer behavioral sign-off + coordinated deploy. Bump the `_Last reviewed_` footer to today.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/PRICING-HANDOFF.md
git commit -m "docs: record deferred-input sourcing complete"
```

---

## Self-Review

**Spec coverage:**

- `anyDogUnder6mo` (birthdate) → Tasks 2, 4, 5, 6, 7. ✓
- `needyTier` (max-hours-away ladder) → Tasks 1, 3, 8. ✓
- `leashManners` (walk opt-in) → Tasks 3, 8. ✓
- Round-trip surfaces (create/edit/admin) → Tasks 8, 9 (create surfaces route through `quantitiesToRecord`; edit through both reconstruction helpers; all quoting through `computeBookingArtifacts`). ✓
- `others`/fish inert → noted, no task. ✓
- Defaults off → Tasks 1 (tier 0 ≥8h / undefined), 2 (null birthdate false), 3/8 (leash false). ✓
- Testing (pure helpers, build-quote-input, round-trip) → Tasks 1, 2, 3, 9. ✓
- Behavioral sign-off + deploy gate → Global Constraints + Task 10. ✓

**Type consistency:** `needyTierFromHoursAway`/`representativeHoursFromNeedyTier` (Task 1) used identically in Tasks 3, 9. `isUnderSixMonths` (Task 2) used in Task 4. `PetRef.birthdate`/`Pet.birthdate`/`PetInput.birthdate` consistent across Tasks 4, 5, 6, 7. `HouseSittingExtras.maxHoursAway` + `WalkQty.leashManners` (Task 8) consumed by Task 9 and the `quantitiesToRecord` keys read by Task 3's schemas (`maxHoursAway`, `leashManners`). ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓
