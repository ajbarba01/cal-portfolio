# Species Model (Plan 4a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the pet taxonomy from dog/cat to the full 7 species the pricing engine already knows, from one canonical module, so cat/small-animal owners stop seeing dog-shaped forms.

**Architecture:** A new pure module `src/features/pets/species.ts` owns the canonical species list; pricing re-exports its `Species` type from there (single source of truth). The DB enum is widened additively. Species-conditional profile fields and the dog-only walk stepper reuse the existing predicate/gate patterns (`required-profiles.ts`, the `pet.species === "dog"` gate already in `forms-client.tsx`).

**Tech Stack:** Next.js (App Router) + TypeScript strict · zod · Supabase (Postgres enum) · Vitest + @testing-library/react.

## Global Constraints

- TypeScript `strict`, no `any`.
- Core logic pure and unit-tested; `species.ts` has no runtime deps.
- Design tokens are law; components reference semantic tokens, never hardcoded colors.
- Commit messages: Conventional Commits, **subject line only** — no body, no `Co-Authored-By`/trailer, no "Generated with" footer. No project-internal identifiers (no plan/phase codes) in the subject.
- Source edits via the Edit/Write tools only (PowerShell 5.1 mojibakes UTF-8 sources).
- Test gate is **per-task unit tests only** — run the exact file named in each task (`npx vitest run <path>`), never the full suite (integration tests need the local Supabase stack).
- Species set = exactly these 7, in this order: `dog, cat, bird, rodent, reptile, fish, other`.
- `billingUnit` / non-dog-cat headcount billing is **out of scope** (YAGNI): booking only ever counts dogs/cats, and services only allow dog/cat assignment. Do not add it.

---

### Task 1: Canonical species module

**Files:**

- Create: `src/features/pets/species.ts`
- Test: `src/features/pets/species.test.ts`

**Interfaces:**

- Produces: `SPECIES_VALUES` (readonly tuple `["dog","cat","bird","rodent","reptile","fish","other"]`), `PetSpecies` (union type), `SPECIES` (`readonly { value: PetSpecies; label: string; emoji: string }[]`), `speciesEnum` (`z.ZodEnum` over `SPECIES_VALUES`).

- [ ] **Step 1: Write the failing test**

```ts
// src/features/pets/species.test.ts
import { describe, it, expect } from "vitest";
import { SPECIES, SPECIES_VALUES, speciesEnum } from "./species";

describe("pet species taxonomy", () => {
  it("exposes the 7 canonical species in order", () => {
    expect(SPECIES_VALUES).toEqual([
      "dog",
      "cat",
      "bird",
      "rodent",
      "reptile",
      "fish",
      "other",
    ]);
  });

  it("gives every species a non-empty label and emoji", () => {
    expect(SPECIES.map((s) => s.value)).toEqual([...SPECIES_VALUES]);
    for (const s of SPECIES) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.emoji.length).toBeGreaterThan(0);
    }
  });

  it("speciesEnum accepts every value and rejects unknown", () => {
    for (const v of SPECIES_VALUES) expect(speciesEnum.parse(v)).toBe(v);
    expect(speciesEnum.safeParse("dragon").success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/pets/species.test.ts`
Expected: FAIL — cannot find module `./species`.

- [ ] **Step 3: Write the module**

```ts
// src/features/pets/species.ts
import { z } from "zod";

/**
 * Canonical pet taxonomy — the single source of truth for species across pet
 * forms, the booking gate, and pricing (which re-exports `Species` from here).
 * Pure, no runtime deps. Ordered for display: the two common pets first, then
 * the small-animal tail. `other` is the catch-all.
 *
 * Only dogs are walkable — that stays a direct `=== "dog"` check at the call
 * sites (the dog-only `pet_walk` gate), not a helper here, so the module makes
 * no promise that the walkable set could grow.
 */
export const SPECIES_VALUES = [
  "dog",
  "cat",
  "bird",
  "rodent",
  "reptile",
  "fish",
  "other",
] as const;

export type PetSpecies = (typeof SPECIES_VALUES)[number];

export const SPECIES: readonly {
  value: PetSpecies;
  label: string;
  emoji: string;
}[] = [
  { value: "dog", label: "Dog", emoji: "🐕" },
  { value: "cat", label: "Cat", emoji: "🐈" },
  { value: "bird", label: "Bird", emoji: "🐦" },
  { value: "rodent", label: "Small mammal", emoji: "🐹" },
  { value: "reptile", label: "Reptile", emoji: "🦎" },
  { value: "fish", label: "Fish", emoji: "🐠" },
  { value: "other", label: "Other", emoji: "🐾" },
];

export const speciesEnum = z.enum(SPECIES_VALUES);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/pets/species.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/pets/species.ts src/features/pets/species.test.ts
git commit -m "feat(pets): canonical species taxonomy module"
```

---

### Task 2: Pricing re-exports the canonical species

**Files:**

- Modify: `src/features/pricing/modifier-types.ts:1-9` (the `Species` type)
- Modify: `src/features/pricing/config-schemas.ts:36-44` (the local `speciesSchema`)
- Test: `src/features/pricing/config-schemas.test.ts` (extend)

**Interfaces:**

- Consumes: `PetSpecies`, `SPECIES_VALUES` from Task 1.
- Produces: `Species` (now an alias of `PetSpecies`) still exported from `modifier-types.ts`; `Unit` unchanged (`"dog" | "cat" | "other"`).

- [ ] **Step 1: Write the failing test** (append to `config-schemas.test.ts`)

```ts
import { SPECIES_VALUES } from "@/features/pets/species";

describe("allowedSpecies accepts the full taxonomy", () => {
  it("accepts every canonical species", () => {
    const cfg = pricingConfigSchema.parse({
      modifiers: [{ kind: "base_per_night", cents: 5000 }],
      constraints: { intervalMin: 1440, allowedSpecies: [...SPECIES_VALUES] },
    });
    expect(cfg.constraints.allowedSpecies).toEqual([...SPECIES_VALUES]);
  });
});
```

(Use the same import path for `pricingConfigSchema` already used at the top of `config-schemas.test.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/pricing/config-schemas.test.ts`
Expected: FAIL — `reptile`/`fish`/etc. already pass today (the enum has all 7), but the import of `SPECIES_VALUES` from the not-yet-wired module may resolve to a different literal order. If it passes immediately, still complete Step 3 to make the derivation the source of truth.

- [ ] **Step 3: Wire the derivation**

In `src/features/pricing/modifier-types.ts`, replace the hand-written `Species` union (lines 1-8) with a re-export:

```ts
import type { PetSpecies } from "@/features/pets/species";

/** Species is a pet-domain concept; the canonical list lives in features/pets. */
export type Species = PetSpecies;

export type Unit = "dog" | "cat" | "other";
```

In `src/features/pricing/config-schemas.ts`, replace the local `speciesSchema` (lines 36-44) with the canonical enum:

```ts
import { speciesEnum } from "@/features/pets/species";

const speciesSchema = speciesEnum;
```

(Leave `unitSchema`, `conditionSchema`, and everything else in the file unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/pricing/config-schemas.test.ts src/features/pricing/modifier-types.test.ts`
Expected: PASS (existing "rejects unknown species" + new taxonomy test).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors (confirms every `Species` consumer still compiles against the alias).

- [ ] **Step 6: Commit**

```bash
git add src/features/pricing/modifier-types.ts src/features/pricing/config-schemas.ts src/features/pricing/config-schemas.test.ts
git commit -m "refactor(pricing): source species from canonical taxonomy"
```

---

### Task 3: Widen the `pet_species` DB enum

**Files:**

- Create: `supabase/migrations/20260712130000_expand_pet_species.sql`

**Interfaces:**

- Produces: the `pet_species` Postgres enum now has all 7 values. No app-code interface.

- [ ] **Step 1: Write the migration**

```sql
-- Expand pet_species from dog/cat to the full pet taxonomy. Additive: existing
-- dog/cat rows are untouched, no data migration. New values are only ADDED here
-- (never used in this same file), so this is safe inside the migration tx.
alter type pet_species add value if not exists 'bird';
alter type pet_species add value if not exists 'rodent';
alter type pet_species add value if not exists 'reptile';
alter type pet_species add value if not exists 'fish';
alter type pet_species add value if not exists 'other';
```

- [ ] **Step 2: Apply to the local stack**

Run: `npx supabase migration up`
Expected: migration applies cleanly. Verify:
Run: `npx supabase db diff` (or `psql` against the local db) — expect the enum to list all 7 values.

- [ ] **Step 3: Commit** (prod push is deferred — see `deploy-env-topology` memory; do NOT push to prod in this plan)

```bash
git add supabase/migrations/20260712130000_expand_pet_species.sql
git commit -m "feat(db): expand pet_species enum to full taxonomy"
```

---

### Task 4: Widen server pet schema, Pet type, and the booking gate type

**Files:**

- Modify: `src/features/accounts/account-actions.ts:33` (petSchema species) and `:48` (Pet type)
- Modify: `src/features/admin/onbehalf-actions.ts:50` (petSchema species)
- Modify: `src/features/booking/required-profiles.ts:21` (PetSpecies declaration)
- Test: `src/features/booking/required-profiles.test.ts` (extend)

**Interfaces:**

- Consumes: `speciesEnum`, `PetSpecies` from Task 1.
- Produces: `Pet.species: PetSpecies`; `PetInput.species: PetSpecies`; `required-profiles` re-exports `PetSpecies` from the module.

- [ ] **Step 1: Write the failing test** (append to `required-profiles.test.ts`)

```ts
it("small animals require pet_care but never pet_walk", () => {
  const items = bookingRequirements({
    pricingType: "house_sitting",
    assignedPets: [{ id: "p1", name: "Tweety", species: "bird" }],
    accountForms: {},
    petForms: {},
    now: new Date("2026-07-12T00:00:00Z"),
  });
  const petForms = items.filter((i) => i.petId === "p1").map((i) => i.formKey);
  expect(petForms).toEqual(["pet_care"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/required-profiles.test.ts`
Expected: FAIL — TypeScript rejects `species: "bird"` (current `PetSpecies` is `"dog" | "cat"`).

- [ ] **Step 3: Re-point `PetSpecies` in the gate**

In `src/features/booking/required-profiles.ts`, delete the local declaration `export type PetSpecies = "dog" | "cat";` (line 21) and import it:

```ts
import type { PetSpecies } from "@/features/pets/species";
export type { PetSpecies };
```

(The manifest's `pet("pet_walk", "dog")` gate is unchanged — small animals simply never match it.)

- [ ] **Step 4: Widen the server schemas and Pet type**

In `src/features/accounts/account-actions.ts`, import the enum and use it:

```ts
import { speciesEnum, type PetSpecies } from "@/features/pets/species";
```

Replace `species: z.enum(["dog", "cat"]).default("dog"),` (line 33) with:

```ts
  species: speciesEnum.default("dog"),
```

Replace `species: "dog" | "cat";` in the `Pet` interface (line 48) with:

```ts
species: PetSpecies;
```

In `src/features/admin/onbehalf-actions.ts`, add the import and replace `species: z.enum(["dog", "cat"]).default("dog"),` (line 50) with `species: speciesEnum.default("dog"),`:

```ts
import { speciesEnum } from "@/features/pets/species";
```

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run src/features/booking/required-profiles.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/booking/required-profiles.ts src/features/booking/required-profiles.test.ts src/features/accounts/account-actions.ts src/features/admin/onbehalf-actions.ts
git commit -m "feat(pets): widen pet species to full taxonomy"
```

---

### Task 5: Pet form offers all 7 species

**Files:**

- Modify: `src/features/accounts/_components/pet-form.tsx:59-66` (schema) and `:179-187` (RadioGroup options)
- Test: `src/features/accounts/_components/pet-form.test.tsx` (create if absent)

**Interfaces:**

- Consumes: `SPECIES`, `speciesEnum` from Task 1.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/accounts/_components/pet-form.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PetForm } from "./pet-form";

describe("PetForm species options", () => {
  it("renders a radio for every canonical species", () => {
    render(<PetForm onSaved={() => {}} />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(7);
    expect(screen.getByRole("radio", { name: /Bird/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Fish/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/accounts/_components/pet-form.test.tsx`
Expected: FAIL — only 2 radios (dog/cat).

- [ ] **Step 3: Drive the schema + options from `SPECIES`**

In `pet-form.tsx`, add the import:

```ts
import { SPECIES, speciesEnum } from "@/features/pets/species";
```

Delete the comment at line 59 and replace `species: z.enum(["dog", "cat"]),` (line 62) with:

```ts
  species: speciesEnum,
```

Replace the hardcoded `options={[...]}` on the species `RadioGroup` (lines 183-186) with:

```tsx
            options={SPECIES.map((s) => ({
              value: s.value,
              label: `${s.emoji} ${s.label}`,
            }))}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/accounts/_components/pet-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/_components/pet-form.tsx src/features/accounts/_components/pet-form.test.tsx
git commit -m "feat(accounts): pet form offers full species taxonomy"
```

---

### Task 6: Species-conditional profile fields

**Files:**

- Modify: `src/features/accounts/_components/profile-fields.tsx` (FieldSpec shape, `friendly_dogs` predicate, `visibleFields`, `ProfileFields`/`FieldGroupBlock` species prop)
- Modify: `src/features/accounts/_components/form-card.tsx:220-337` (add `species` prop, pass to `ProfileFields`)
- Modify: `src/app/(site)/(account)/account/forms/_components/forms-client.tsx:138-144` (pass `pet.species`)
- Modify: `src/app/(site)/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx` (pass pet species to the `pet_care` FormCard)
- Test: `src/features/accounts/_components/profile-fields.test.ts` (create — pure `visibleFields`)

**Interfaces:**

- Consumes: `PetSpecies` from Task 1.
- Produces: `visibleFields(fields, species?)` pure helper; `FieldSpec.species?: PetSpecies[]`; `ProfileFields({ formKey, species? })`; `FormCard`'s new `species?: PetSpecies` prop.

- [ ] **Step 1: Write the failing test** (pure helper — no React)

```ts
// src/features/accounts/_components/profile-fields.test.ts
import { describe, it, expect } from "vitest";
import { visibleFields } from "./profile-fields";

const fields = [
  { name: "friendly_strangers", label: "With strangers", max: 100 },
  {
    name: "friendly_dogs",
    label: "With other dogs",
    max: 100,
    species: ["dog"] as const,
  },
];

describe("visibleFields", () => {
  it("hides dog-only fields for a cat", () => {
    expect(visibleFields(fields, "cat").map((f) => f.name)).toEqual([
      "friendly_strangers",
    ]);
  });
  it("shows dog-only fields for a dog", () => {
    expect(visibleFields(fields, "dog").map((f) => f.name)).toEqual([
      "friendly_strangers",
      "friendly_dogs",
    ]);
  });
  it("shows all fields when species is unknown (account-scoped forms)", () => {
    expect(visibleFields(fields, undefined).map((f) => f.name)).toEqual([
      "friendly_strangers",
      "friendly_dogs",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/accounts/_components/profile-fields.test.ts`
Expected: FAIL — `visibleFields` not exported.

- [ ] **Step 3: Add the predicate + pure helper**

In `profile-fields.tsx`, add the import and widen `FieldSpec`:

```ts
import type { PetSpecies } from "@/features/pets/species";
```

Add to the `FieldSpec` interface (after `max: number;`):

```ts
  /** When set, the field renders only for these species (omitted = all). */
  species?: readonly PetSpecies[];
```

Add the `species` predicate to the `friendly_dogs` field (line ~275) inside `PET_CARE_GROUPS`:

```ts
      { name: "friendly_dogs", label: "With other dogs", max: S, species: ["dog"] },
```

Add the pure helper (near `profileFieldNames`):

```ts
/** Fields that apply to a given pet's species (undefined species = all). */
export function visibleFields(
  fields: FieldSpec[],
  species: PetSpecies | undefined,
): FieldSpec[] {
  return fields.filter(
    (f) => !f.species || (species != null && f.species.includes(species)),
  );
}
```

- [ ] **Step 4: Thread `species` through the renderer**

Change `FieldGroupBlock` to accept and apply species:

```tsx
function FieldGroupBlock({
  group,
  species,
}: {
  group: FieldGroup;
  species?: PetSpecies;
}) {
  const headingId = useId();
  const {
    register,
    formState: { errors },
  } = useFormContext<FieldValues>();
  const fields = visibleFields(group.fields, species);
  return (
    <div role="group" aria-labelledby={headingId} className="flex flex-col gap-4">
      <Eyebrow id={headingId}>{group.title}</Eyebrow>
      {fields.map((f) => (
        // ...unchanged field JSX...
      ))}
    </div>
  );
}
```

(Keep the existing field JSX inside the `.map`; only the iterated list changed from `group.fields` to `fields`.)

Change `ProfileFields`:

```tsx
export function ProfileFields({
  formKey,
  species,
}: {
  formKey: FormKey;
  species?: PetSpecies;
}) {
  const groups = PROFILE_GROUPS[formKey] ?? [];
  return (
    <>
      {groups.map((g) => (
        <FieldGroupBlock key={g.title} group={g} species={species} />
      ))}
    </>
  );
}
```

- [ ] **Step 5: Pass `species` from `FormCard` and callers**

In `form-card.tsx`, add `species?: PetSpecies` to `FormCardProps` (import `PetSpecies` from `@/features/pets/species`), destructure it in `FormCard({ ... })`, and pass it at line 336:

```tsx
<ProfileFields formKey={formKey} species={species} />
```

In `forms-client.tsx`, the `pet_care` FormCard (line 138) gains the species:

```tsx
<FormCard
  formKey="pet_care"
  petId={pet.id}
  species={pet.species}
  title={`${pet.name} — care details`}
  existing={petResponses[`pet_care:${pet.id}`]}
  onSubmit={submitForm}
/>
```

In `client-detail-client.tsx`, find the `formKey="pet_care"` FormCard rendered per pet and add `species={pet.species}` the same way (the pet object in scope already carries `.species`).

- [ ] **Step 6: Run test + typecheck**

Run: `npx vitest run src/features/accounts/_components/profile-fields.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/accounts/_components/profile-fields.tsx src/features/accounts/_components/profile-fields.test.ts src/features/accounts/_components/form-card.tsx "src/app/(site)/(account)/account/forms/_components/forms-client.tsx" "src/app/(site)/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx"
git commit -m "feat(accounts): species-conditional profile fields"
```

---

### Task 7: Walk stepper is dog-gated

**Files:**

- Modify: `src/features/booking/_components/quantity-forms.tsx:172-228` (add `hasDog`, gate the walk stepper)
- Modify: `src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx:249-255` (compute + pass `hasDog`)
- Modify: `src/app/(site)/(account)/account/bookings/[id]/edit/_components/edit-booking-client.tsx` (pass `hasDog` from assigned pets)
- Test: `src/features/booking/_components/quantity-forms.test.tsx` (create if absent)

**Interfaces:**

- Consumes: nothing new (uses `pets`/`selectedPetIds` already in the booking client).
- Produces: `QuantityForm` gains `hasDog?: boolean` (default `true` — preserves behavior for any caller that doesn't wire it).

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/booking/_components/quantity-forms.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuantityForm } from "./quantity-forms";

const hsState = {
  type: "house_sitting" as const,
  qty: { walkMinutesPerDay: 0, maxHoursAway: 8, dogs: 0, cats: 0 },
};

describe("QuantityForm walk stepper gate", () => {
  it("hides the walk stepper when no dog is assigned", () => {
    render(<QuantityForm state={hsState} onChange={() => {}} hasDog={false} />);
    expect(screen.queryByText("Walk time per day")).not.toBeInTheDocument();
  });
  it("shows the walk stepper when a dog is assigned", () => {
    render(<QuantityForm state={hsState} onChange={() => {}} hasDog={true} />);
    expect(screen.getByText("Walk time per day")).toBeInTheDocument();
  });
});
```

(Match the `QuantityState` `house_sitting` shape to the actual type in `quantity-forms.tsx`; adjust `qty` keys if the real shape differs.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/_components/quantity-forms.test.tsx`
Expected: FAIL — stepper renders regardless of `hasDog`.

- [ ] **Step 3: Gate the stepper**

In `quantity-forms.tsx`, add `hasDog` to the `QuantityForm` props (default true):

```tsx
export function QuantityForm({
  state,
  onChange,
  kiche,
  minHours,
  maxHours,
  hasDog = true,
}: {
  state: QuantityState;
  onChange: (s: QuantityState) => void;
  kiche?: { welcome: boolean; onChange: (v: boolean) => void };
  minHours?: number;
  maxHours?: number;
  /** House-sitting: whether ≥1 dog is assigned. Gates the walk-time stepper. */
  hasDog?: boolean;
}) {
```

In the `house_sitting` branch, wrap the "Walk time per day" `StepperField` (lines 200-209) so it renders only when `hasDog`, and force the value to 0 when it hides:

```tsx
{
  hasDog ? (
    <StepperField
      id="hs-walk-min"
      label="Walk time per day"
      description="Daily walk time, in 15-min steps. The first 45 min/day are included."
      value={qty.walkMinutesPerDay}
      min={0}
      step={15}
      unit="min"
      onChange={(v) => set({ walkMinutesPerDay: v })}
    />
  ) : (
    qty.walkMinutesPerDay !== 0 && (
      <ZeroWalkOnHide onZero={() => set({ walkMinutesPerDay: 0 })} />
    )
  );
}
```

Add the tiny effect component near the top of the file (below imports):

```tsx
/** Zeroes leftover walk minutes once the stepper hides (no dog assigned). */
function ZeroWalkOnHide({ onZero }: { onZero: () => void }) {
  useEffect(onZero, [onZero]);
  return null;
}
```

Add `useEffect` to the React import at the top of the file.

- [ ] **Step 4: Compute `hasDog` in the booking clients**

In `service-booking-client.tsx`, before the return, derive it from the already-present `pets` + `selectedPetIds`:

```tsx
const hasDog = pets.some(
  (p) => selectedPetIds.includes(p.id) && p.species === "dog",
);
```

Pass it to `QuantityForm` (line 249):

```tsx
<QuantityForm
  state={quantities}
  onChange={onQuantitiesChange}
  kiche={{ welcome: kicheWelcome, onChange: onKicheWelcomeChange }}
  minHours={durationBounds.minHours}
  maxHours={durationBounds.maxHours}
  hasDog={hasDog}
/>
```

In `edit-booking-client.tsx`, the booking's assigned pets are already in scope (the edit form shows them). Compute `hasDog` from that assigned-pet list (`assignedPets.some((p) => p.species === "dog")` — use whatever the local variable is named) and pass `hasDog` to its `QuantityForm`.

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run src/features/booking/_components/quantity-forms.test.tsx`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/booking/_components/quantity-forms.tsx src/features/booking/_components/quantity-forms.test.tsx "src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx" "src/app/(site)/(account)/account/bookings/[id]/edit/_components/edit-booking-client.tsx"
git commit -m "feat(booking): dog-gate the walk-time stepper"
```

---

### Task 8: Full-suite verification + docs

**Files:**

- Modify: `docs/DESIGN.md` (species set, if it names the taxonomy) — same-commit doc rule.

- [ ] **Step 1: Run the whole unit suite** (the local Supabase stack must be up for integration tests)

Run: `npm run test`
Expected: all pass. If integration tests fail for lack of the local stack, note it and run the unit subset touched by this plan instead.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 3: Update DESIGN.md**

If `docs/DESIGN.md` states the species set as dog/cat, update it to the 7-species taxonomy and note the canonical module `src/features/pets/species.ts`. If it does not mention species, skip.

- [ ] **Step 4: Commit**

```bash
git add docs/DESIGN.md
git commit -m "docs: record expanded pet species taxonomy"
```

---

## Self-Review notes

- **Spec coverage:** B1 → Task 1 (+2 for pricing re-export). B2 → Tasks 3,4,5. B3 → Task 6. B4 → Task 7. `billingUnit` intentionally omitted (YAGNI, per spec + Global Constraints).
- **Type consistency:** `PetSpecies`, `SPECIES_VALUES`, `speciesEnum`, `SPECIES`, `visibleFields`, `hasDog` used identically across tasks.
- **Out of scope (this plan):** enabling non-dog/cat species for _booking assignment_ (services still `allowedSpecies: ["dog","cat"]`); the pet form change only affects the pet _profile_. Prod migration push is deferred.

---

_Last reviewed: 2026-07-12_
