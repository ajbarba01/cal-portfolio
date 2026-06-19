# Booking Page Refactors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seven cross-surface refactors to the service-booking flow (public, admin-create, admin-edit, client-edit): remove nested card outlines, fix pet wording + cap hint, nuke can't-be-left-alone days, decouple the forms gate from date selection, reword the empty quote, force house-sitting approval, and restyle the page header.

**Architecture:** All three booking surfaces compose the shared `BookingFlow` + `Scheduler` + `QuotePanel`, and all quotes flow through `computeBookingArtifacts` in `booking-service-shared.ts`. Changes are made at those shared seams so each surface inherits them; surface-specific wiring (forms gate is public-only; header switcher is the public page only) is called out per task.

**Tech Stack:** Next.js App Router, TypeScript (strict, no `any`), Tailwind + shadcn-style primitives, Supabase (Postgres + migrations), Vitest + React Testing Library, Zod.

## Global Constraints

- **TypeScript `strict`, no `any`.** (CODE_STYLE / ENGINEERING)
- **Design tokens are law** — semantic tokens only, never hardcoded colors. (FRONTEND)
- **No drop shadows** on page cards (floating elements excepted). Active states use fills/tints, not elevation.
- **Accessibility floor** — semantic HTML, `aria-current`, visible focus, keyboard nav.
- **Commit messages: subject line only.** Conventional Commits, no body, no trailers, no project-internal identifiers (no phase/plan/ticket codes).
- **Single `main` branch**; commit only after verification; stage files by name.
- **PowerShell mojibakes UTF-8** — use Edit/Write tools for source edits, never PS here-strings.
- **Same-commit doc rule** — a change that adds/moves/deletes files updates the relevant doc in the same commit.
- Run unit tests per-task with `npx vitest run <path>` (NOT full `vitest run` — integration tests need the local Supabase stack).

---

## File map

- `src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx` — public surface (copy, pet heading, forms gate, empty-state border).
- `src/app/(site)/(marketing)/book/[serviceSlug]/_components/use-service-booking.ts` — public hook (forms-from-pets compute).
- `src/app/(site)/(marketing)/book/[serviceSlug]/page.tsx` — server page (pass `submitted_at`; header switcher).
- `src/app/(site)/(admin)/admin/clients/[clientId]/book/_components/admin-create-booking-client.tsx` — admin-create (copy, pet heading, empty-state border).
- `src/app/(site)/(account)/account/bookings/[id]/edit/_components/edit-booking-client.tsx` — edit (pet heading, empty-state border).
- `src/features/booking/_components/scheduler/scheduler.tsx` — add `bare` prop.
- `src/features/booking/_components/booking-flow.tsx` — pass `bare`.
- `src/features/booking/_components/quote-panel.tsx` — remove inner border.
- `src/features/booking/_components/quantity-forms.tsx` — nuke can't-be-left-alone field + state.
- `src/features/booking/quantity-state-from-quote-inputs.ts` / `diff-booking-patch.ts` — nuke key.
- `src/features/booking/booking-service-shared.ts` — nuke schema key; force HS approval.
- `src/features/pricing/types.ts` — nuke deprecated config/quantity keys.
- `src/features/booking/pet-step-heading.ts` — **new** pure helper.
- `src/components/ui/service-switcher.tsx` — **new** link-based segmented nav (or inline in page.tsx).
- `supabase/migrations/20260619120000_checkin_allow_all_species.sql` — **new**.

---

### Task 1: Reword the empty-quote copy (item 5)

**Files:**

- Modify: `src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx:413`
- Modify: `src/app/(site)/(admin)/admin/clients/[clientId]/book/_components/admin-create-booking-client.tsx:250`
- Test: `src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.characterization.test.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: nothing downstream relies on this string.

- [ ] **Step 1: Update the characterization test expectation**

In `service-booking-client.characterization.test.tsx`, find the assertion referencing `"Select a day and time to see your price"` and change the expected text to `"Fill out the above details to see your price."`. (Grep the file first: `Select a day and time`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.characterization.test.tsx"`
Expected: FAIL — old string no longer matched.

- [ ] **Step 3: Update public copy**

In `service-booking-client.tsx`, the empty-state ternary:

```tsx
{
  isPreviewing
    ? "Calculating…"
    : "Fill out the above details to see your price.";
}
```

- [ ] **Step 4: Update admin copy**

In `admin-create-booking-client.tsx`:

```tsx
{
  isPreviewing
    ? "Calculating…"
    : "Fill out the above details to see the price.";
}
```

(Edit surface copy is intentionally unchanged.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run "src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.characterization.test.tsx"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx" "src/app/(site)/(admin)/admin/clients/[clientId]/book/_components/admin-create-booking-client.tsx" "src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.characterization.test.tsx"
git commit -m "feat(booking): reword empty-quote prompt to fill out details"
```

---

### Task 2: House-sitting always requires approval (item 6)

**Files:**

- Modify: `src/features/booking/booking-service-shared.ts:688`
- Test: `src/features/booking/booking-service.test.ts`

**Interfaces:**

- Consumes: existing `deriveApprovalWithReasons({ requiresApproval, … })` from `@/features/pricing` and `service.pricing_type`, `service.requires_approval` already in scope in `computeBookingArtifacts`.
- Produces: every house-sitting quote/preview/create now carries `requiresApproval: true` and an `approvalReasons` entry `{ code: "service_manual_only", severity: "info" }`, which `QuotePanel` already renders as an info `Alert`.

- [ ] **Step 1: Write the failing test**

In `booking-service.test.ts`, add (adapt the existing house-sitting quote helper/fixtures in that file — match how other tests build a house-sitting artifacts call; use a service whose `requires_approval` is false and a client whose distance auto-approves):

```ts
it("house-sitting always requires approval regardless of the service flag", async () => {
  const result =
    await computeBookingArtifacts(/* …house_sitting, requires_approval:false, near/auto-approve distance… */);
  expect(result.kind).toBe("success");
  if (result.kind !== "success") return;
  expect(result.artifacts.requiresApproval).toBe(true);
  expect(
    result.artifacts.approvalReasons.some(
      (r) => r.code === "service_manual_only",
    ),
  ).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/booking/booking-service.test.ts -t "always requires approval"`
Expected: FAIL — `requiresApproval` is false for an auto-approve house-sit with the flag off.

- [ ] **Step 3: Force approval by pricing_type**

In `booking-service-shared.ts`, the `deriveApprovalWithReasons` call (~line 688), change:

```ts
requiresApproval: !!service.requires_approval,
```

to:

```ts
// House-sits are always personally confirmed by Cal — non-overridable, so the
// per-service flag can never accidentally auto-approve an overnight stay.
requiresApproval:
  !!service.requires_approval || service.pricing_type === "house_sitting",
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/features/booking/booking-service.test.ts`
Expected: PASS (the new test + no regressions in the file).

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/booking-service-shared.ts src/features/booking/booking-service.test.ts
git commit -m "feat(booking): house-sitting always requires approval"
```

---

### Task 3: Allow all pets for check-in (item 2a)

**Files:**

- Create: `supabase/migrations/20260619120000_checkin_allow_all_species.sql`
- Modify (if it sets check_in `allowedSpecies`): `scripts/db-seed/scenarios.ts`

**Interfaces:**

- Consumes: `allowedSpeciesOf(constraints)` (narrows config species to the dog|cat avatar set) — already reads `constraints.allowedSpecies`.
- Produces: check-in service `pricing_config.constraints.allowedSpecies = ["dog","cat"]`, so the pet picker offers cats and the heading helper (Task 4) derives "pet".

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260619120000_checkin_allow_all_species.sql`:

```sql
-- Check-in drop-ins apply to any pet, not just dogs. Widening allowedSpecies to
-- dog+cat makes cats selectable and flips the pet-step heading to "Which pets?".
-- (System pets are dog|cat only; allowedSpeciesOf narrows to that avatar set.)
update services
set pricing_config = jsonb_set(
  pricing_config,
  '{constraints,allowedSpecies}',
  '["dog", "cat"]'::jsonb,
  true
)
where pricing_type = 'check_in';
```

- [ ] **Step 2: Check the local seed scenarios**

Grep: `allowedSpecies` in `scripts/db-seed/scenarios.ts`. If a check-in service config there pins `["dog"]`, update it to `["dog", "cat"]` to keep local seeds in parity. If it does not set check-in species, leave it.

- [ ] **Step 3: Apply + verify locally**

Run: `npx supabase migration up` (local stack). Then verify:
Run: `npx supabase db reset --debug` is NOT required; instead query the row.
Expected: the check-in service's `pricing_config -> 'constraints' -> 'allowedSpecies'` is `["dog", "cat"]`.

- [ ] **Step 4: Manual smoke**

Load `/book/check-in` as a ready user with a cat in the account → the cat is now selectable in the pet picker and the heading reads "Which pets?" (heading helper lands in Task 4; until then the existing dynamic public label already flips because `allowedSpecies` now includes cat).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260619120000_checkin_allow_all_species.sql scripts/db-seed/scenarios.ts
git commit -m "feat(booking): allow all pets for check-in drop-ins"
```

---

### Task 4: Unified pet-step heading + walk cap hint (item 2b, all surfaces)

**Files:**

- Create: `src/features/booking/pet-step-heading.ts`
- Create: `src/features/booking/pet-step-heading.test.ts`
- Modify: `src/features/booking/index.client.ts` (export the helper)
- Modify: `service-booking-client.tsx`, `admin-create-booking-client.tsx`, `edit-booking-client.tsx`

**Interfaces:**

- Consumes: `PetSpecies` from the booking feature, `pricingType`, `allowedSpecies: PetSpecies[]`, `maxPets: number | null`.
- Produces:

  ```ts
  export function petStepHeading(args: {
    pricingType: PricingType;
    allowedSpecies: PetSpecies[];
    maxPets: number | null;
  }): { label: string; hint?: string };
  ```

  `label` e.g. "Which dogs?" / "Which pets?" / "Which dog?"; `hint` is `"up to N"` only for the walk service when `maxPets` is finite and > 1, else `undefined`. Both `BookingFlowStepHead` consumers pass `label` to `label` and `hint` to `hint`.

- [ ] **Step 1: Write the failing test**

Create `pet-step-heading.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { petStepHeading } from "./pet-step-heading";

describe("petStepHeading", () => {
  it("walk: dog-only, plural, with 'up to 2' hint", () => {
    expect(
      petStepHeading({
        pricingType: "walk",
        allowedSpecies: ["dog"],
        maxPets: 2,
      }),
    ).toEqual({ label: "Which dogs?", hint: "up to 2" });
  });

  it("check_in: dog+cat, plural, no hint", () => {
    expect(
      petStepHeading({
        pricingType: "check_in",
        allowedSpecies: ["dog", "cat"],
        maxPets: null,
      }),
    ).toEqual({ label: "Which pets?" });
  });

  it("training: single dog, singular noun, no hint", () => {
    expect(
      petStepHeading({
        pricingType: "training",
        allowedSpecies: ["dog"],
        maxPets: 1,
      }),
    ).toEqual({ label: "Which dog?" });
  });

  it("house_sitting: dog+cat plural, no hint even if a cap exists", () => {
    expect(
      petStepHeading({
        pricingType: "house_sitting",
        allowedSpecies: ["dog", "cat"],
        maxPets: null,
      }),
    ).toEqual({ label: "Which pets?" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/booking/pet-step-heading.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `pet-step-heading.ts`:

```ts
/**
 * Pure helper for the booking pet-step heading + optional cap hint, shared by the
 * public, admin-create, and edit surfaces so the wording never diverges. The noun
 * derives from the service's allowed species (dog-only → "dog", else "pet") and
 * pluralizes unless the service takes at most one pet. The "up to N" hint is
 * walk-only (the one capped, multi-pet service), driven by the configured cap.
 */
import type { PricingType } from "@/features/pricing";
import type { PetSpecies } from "@/features/booking/use-booking-scheduler";

export function petStepHeading({
  pricingType,
  allowedSpecies,
  maxPets,
}: {
  pricingType: PricingType;
  allowedSpecies: PetSpecies[];
  maxPets: number | null;
}): { label: string; hint?: string } {
  const noun =
    allowedSpecies.length === 1 && allowedSpecies[0] === "dog" ? "dog" : "pet";
  const label = `Which ${maxPets === 1 ? noun : `${noun}s`}?`;
  const hint =
    pricingType === "walk" && maxPets !== null && maxPets > 1
      ? `up to ${maxPets}`
      : undefined;
  return hint ? { label, hint } : { label };
}
```

> Note: confirm `PetSpecies` is exported from `use-booking-scheduler`; if it lives elsewhere (e.g. `@/features/booking`), import from there instead. Grep `export type PetSpecies` first.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/features/booking/pet-step-heading.test.ts`
Expected: PASS.

- [ ] **Step 5: Export from the client barrel**

In `src/features/booking/index.client.ts`, add:

```ts
export { petStepHeading } from "./pet-step-heading";
```

- [ ] **Step 6: Wire into the public surface**

In `service-booking-client.tsx`, replace the local `petNoun`/`petSectionLabel` block (~lines 164-166) with:

```tsx
const { label: petSectionLabel, hint: petCapHint } = petStepHeading({
  pricingType: service.pricingType,
  allowedSpecies,
  maxPets,
});
```

and pass the hint into the step head:

```tsx
<BookingFlowStepHead
  num={petStepLabel}
  label={petSectionLabel}
  labelId="pets-heading"
  hint={petCapHint}
/>
```

Add `petStepHeading` to the import from `@/features/booking/index.client`.

- [ ] **Step 7: Wire into admin-create**

In `admin-create-booking-client.tsx`, the hook already returns `allowedSpecies`; also pull `maxPets` from `useAdminCreateBooking` (it is part of the shared scheduler return — add it to the destructure if absent). Compute and use:

```tsx
const { label: petSectionLabel, hint: petCapHint } = petStepHeading({
  pricingType: service.pricingType,
  allowedSpecies,
  maxPets,
});
```

Replace the hardcoded `label="Which pets?"` with `label={petSectionLabel}` and add `hint={petCapHint}`. Add `petStepHeading` to the imports. Also pass `maxSelect={maxPets}` to `PetAssignment` for parity with the other surfaces (the cap is now surfaced in copy).

- [ ] **Step 8: Wire into edit**

In `edit-booking-client.tsx` (already destructures `allowedSpecies` and `maxPets`):

```tsx
const { label: petSectionLabel, hint: petCapHint } = petStepHeading({
  pricingType: service.pricingType,
  allowedSpecies,
  maxPets,
});
```

Replace `label="Which pets?"` with `label={petSectionLabel}` and add `hint={petCapHint}`. Add `petStepHeading` to imports.

- [ ] **Step 9: Run the booking component tests**

Run: `npx vitest run src/features/booking/pet-step-heading.test.ts "src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.characterization.test.tsx"`
Expected: PASS. If the characterization test asserts "Which dogs?" for walk it still holds; if it asserts a check-in heading, update it to "Which pets?".

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (verifies `maxPets` is in scope in admin-create).

- [ ] **Step 11: Commit**

```bash
git add src/features/booking/pet-step-heading.ts src/features/booking/pet-step-heading.test.ts src/features/booking/index.client.ts "src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx" "src/app/(site)/(admin)/admin/clients/[clientId]/book/_components/admin-create-booking-client.tsx" "src/app/(site)/(account)/account/bookings/[id]/edit/_components/edit-booking-client.tsx"
git commit -m "feat(booking): unify pet-step heading and add walk cap hint"
```

---

### Task 5: Nuke can't-be-left-alone days (item 3, full removal)

**Files:**

- Modify: `src/features/booking/_components/quantity-forms.tsx`
- Modify: `src/features/booking/quantity-state-from-quote-inputs.ts` (+ `.test.ts`)
- Modify: `src/features/booking/diff-booking-patch.ts` (+ `diff-booking-patch.test.ts`)
- Modify: `src/features/booking/booking-service-shared.ts` (schema)
- Modify: `src/features/pricing/types.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `HouseSittingExtras` becomes `{ walkMinutesPerDay: number; maxHoursAway: number; holidayDays?: number }` — every consumer of `HouseSittingExtras`/`quantitiesToRecord` updates accordingly.

- [ ] **Step 1: Confirm no persisted config dependency**

Grep repo-wide: `cant_be_left_alone`. Expected hits: only `src/features/pricing/types.ts` (deprecated interface, declared-not-read) and docs. Confirm NO migration/seed sets `cant_be_left_alone_cents_per_day` (the 2026-06-18 modifier migration replaced configs). If a migration/seed does set it, add a follow-up `jsonb` cleanup migration; otherwise none is needed.

- [ ] **Step 2: Update the failing tests first**

In `diff-booking-patch.test.ts`: remove `cantBeLeftAloneDays` from every `qty` fixture and delete the test case "User adds 1 cantBeLeftAloneDays …" (and its `expect(patch.quantities?.cantBeLeftAloneDays)` assertion). In `quantity-state-from-quote-inputs.test.ts`: remove `cantBeLeftAloneDays` from the expected `qty` objects.

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/features/booking/diff-booking-patch.test.ts src/features/booking/quantity-state-from-quote-inputs.test.ts`
Expected: FAIL — fixtures still reference removed field OR types mismatch (until impl is updated). This anchors the change.

- [ ] **Step 4: Remove from the form component**

In `quantity-forms.tsx`:

- `HouseSittingExtras`: delete the `cantBeLeftAloneDays: number;` member.
- `defaultQuantities` house_sitting: `qty: { walkMinutesPerDay: 0, maxHoursAway: 8 }`.
- `quantitiesToRecord` house_sitting: delete the `if (qs.qty.cantBeLeftAloneDays > 0) …` lines.
- Delete the entire `<StepperField id="hs-cant-alone" … />` block (the "Can't-be-left-alone days" field).

- [ ] **Step 5: Remove from round-trip + diff**

In `quantity-state-from-quote-inputs.ts` house_sitting case, delete the `cantBeLeftAloneDays: num(q.cantBeLeftAloneDays, 0),` line. In `diff-booking-patch.ts`, remove any `cantBeLeftAloneDays` diffing (grep the file).

- [ ] **Step 6: Remove from the wire schema + types**

In `booking-service-shared.ts` `houseSittingQuantitiesSchema`, delete line `cantBeLeftAloneDays: z.number().int().min(0).optional(),`. (The schema is a plain `z.object` → strips unknown keys, so legacy stored `quote_inputs` carrying the key still parse — the key is simply dropped.) In `src/features/pricing/types.ts`, delete `cant_be_left_alone_cents_per_day: number;` from `HouseSittingConfig` and `cantBeLeftAloneDays?: number;` from `HouseSittingQuantities`.

- [ ] **Step 7: Run the targeted tests**

Run: `npx vitest run src/features/booking/diff-booking-patch.test.ts src/features/booking/quantity-state-from-quote-inputs.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors. Fix any remaining `cantBeLeftAloneDays` references the compiler surfaces (e.g. other fixtures: `diff-booking-patch.test.ts` already handled; check `admin-create-booking.integration.test.ts` / `edit-booking.integration.test.ts` only run with the local stack but still typecheck — strip the key from their fixtures if present).

- [ ] **Step 9: Commit**

```bash
git add src/features/booking/_components/quantity-forms.tsx src/features/booking/quantity-state-from-quote-inputs.ts src/features/booking/quantity-state-from-quote-inputs.test.ts src/features/booking/diff-booking-patch.ts src/features/booking/diff-booking-patch.test.ts src/features/booking/booking-service-shared.ts src/features/pricing/types.ts
git commit -m "refactor(booking): remove deprecated cant-be-left-alone-days input"
```

---

### Task 6: Remove nested card outlines (item 1, all surfaces)

**Files:**

- Modify: `src/features/booking/_components/scheduler/scheduler.tsx` (add `bare`)
- Modify: `src/features/booking/_components/booking-flow.tsx` (pass `bare`)
- Modify: `src/features/booking/_components/quote-panel.tsx` (drop border) (+ `quote-panel.test.tsx`)
- Modify: empty-state `Surface` in the three clients
- Test: `src/features/booking/_components/booking-flow.test.tsx`

**Interfaces:**

- Consumes: `Surface` variants.
- Produces: `Scheduler` gains `bare?: boolean`. When `bare`, the inner wrapper is a borderless `<div>` (no `Surface`), so the calendar+timeline sit flush inside the step card. `outlined` and `bare` are mutually exclusive (`bare` wins if both passed). Default behavior (neither) is unchanged → admin-bookings calendar and meet-greet keep their frame.

- [ ] **Step 1: Add the `bare` prop to Scheduler**

In `scheduler.tsx`, extend props and the render:

```tsx
  /**
   * Render the scheduler with NO outer card chrome (no border/background) — for
   * use INSIDE a step shell that already provides the card, so the calendar reads
   * as flush content rather than a nested card. Mutually exclusive with `outlined`.
   */
  bare?: boolean;
```

In the component signature add `bare = false,` and replace the return wrapper:

```tsx
if (bare) {
  return (
    <SchedulerProvider value={value}>
      <div className="min-w-0">{children}</div>
    </SchedulerProvider>
  );
}
return (
  <SchedulerProvider value={value}>
    <Surface variant={outlined ? "emphasis" : "plain"} className="p-4">
      {children}
    </Surface>
  </SchedulerProvider>
);
```

- [ ] **Step 2: Pass `bare` from BookingFlow**

In `booking-flow.tsx`, both `<Scheduler …>` instances (week-slots ~line 367 and month-range ~line 395) get `bare`:

```tsx
<Scheduler
  bare
  capabilities={capabilities}
  data={schedulerData}
  onSelectionChange={onSelectionChange}
  initialSlot={initialSlot}
>
```

(and the same `bare` on the month-range instance).

- [ ] **Step 3: Drop the QuotePanel inner border**

In `quote-panel.tsx`, change the root from a bordered `Surface` to a borderless container (it is always nested in the "Your booking" step shell):

```tsx
return (
  <section aria-label="Price estimate" className="min-w-0">
    {/* …existing children unchanged… */}
  </section>
);
```

Remove the `Surface` import if now unused. Keep all inner content (Live badge, line items, dashed total divider, alerts, footer, Book button).

- [ ] **Step 4: Update the QuotePanel test**

In `quote-panel.test.tsx`, if any assertion targets the `Surface`/`data-slot="surface"` wrapper or `aria-label="Price estimate"` on a `Surface`, update it to the new `<section aria-label="Price estimate">`. Run it to confirm intent in Step 6.

- [ ] **Step 5: De-card the three empty-states**

In `service-booking-client.tsx`, `admin-create-booking-client.tsx`, and `edit-booking-client.tsx`, the quote empty-state currently uses `<Surface variant="plain" className="text-muted-foreground border-dashed p-6 text-center text-sm">`. Replace each with a borderless block:

```tsx
<p className="text-muted-foreground py-6 text-center text-sm">
  {/* same conditional copy as before */}
</p>
```

Remove now-unused `Surface` imports where applicable (check each file — `Surface` is still used elsewhere in the public client's `GatePanel`, so keep it there).

- [ ] **Step 6: Run the component tests**

Run: `npx vitest run src/features/booking/_components/quote-panel.test.tsx src/features/booking/_components/booking-flow.test.tsx`
Expected: PASS (update assertions that referenced removed borders/wrappers).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (catches dangling `Surface` imports).

- [ ] **Step 8: Manual visual check**

Run the app (`/run` or `npm run dev`), open `/book/house-sitting` and `/book/walk`: the calendar+time no longer has its own outline inside "Pick your dates"; the quote has no inner card. Outer step cards + background unchanged.

- [ ] **Step 9: Commit**

```bash
git add src/features/booking/_components/scheduler/scheduler.tsx src/features/booking/_components/booking-flow.tsx src/features/booking/_components/quote-panel.tsx src/features/booking/_components/quote-panel.test.tsx "src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx" "src/app/(site)/(admin)/admin/clients/[clientId]/book/_components/admin-create-booking-client.tsx" "src/app/(site)/(account)/account/bookings/[id]/edit/_components/edit-booking-client.tsx"
git commit -m "feat(booking): remove nested card outlines in calendar and quote"
```

---

### Task 7: Forms gate depends on pet selection, not date (item 4, public surface)

**Files:**

- Modify: `src/app/(site)/(marketing)/book/[serviceSlug]/page.tsx` (pass `submitted_at`)
- Modify: `src/app/(site)/(marketing)/book/[serviceSlug]/_components/use-service-booking.ts` (compute from pets)
- Modify: `src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx` (render rows when complete; remove date copy)
- Test: `service-booking-client.characterization.test.tsx`

**Interfaces:**

- Consumes: `bookingRequirements`, `requirementsSatisfied`, `RequirementItem` from `@/features/booking` (already exported); `petStepHeading` not involved here.
- Produces: `formResponses` prop entries gain `submittedAt: string | null`; the hook exposes the same `formsIncomplete` / `profileRequirements`, now recomputed from `selectedPetIds` + form timestamps on every pet change, independent of the quote.

- [ ] **Step 1: Pass `submitted_at` from the page**

In `page.tsx`, change the `form_responses` select (~line 245) to include the timestamp:

```ts
svc
  .from("form_responses")
  .select("form_key, pet_id, data, submitted_at")
  .eq("client_id", user.id);
```

and when building `formResponses` (~line 266), capture it:

```ts
for (const r of formRows ?? []) {
  const key = r.pet_id
    ? `${r.form_key as string}:${r.pet_id as string}`
    : (r.form_key as string);
  formResponses[key] = {
    data: (r.data ?? {}) as Record<string, unknown>,
    submittedAt: (r.submitted_at as string | null) ?? null,
  };
}
```

Update the `formResponses` typing at its declaration (~line 143) to:

```ts
const formResponses: Record<
  string,
  { data: Record<string, unknown>; submittedAt: string | null }
> = {};
```

- [ ] **Step 2: Widen the prop type**

In `service-booking-client.tsx`, change `formResponses` prop type to:

```ts
formResponses: Record<
  string,
  { data: Record<string, unknown>; submittedAt: string | null }
>;
```

`FormCard`'s `existing` prop only reads `.data`, so passing the wider object is compatible; confirm with the typecheck in Step 8.

- [ ] **Step 3: Thread pets + timestamps into the hook**

`useServiceBooking` already receives `pets` and `formResponses`? Confirm — if `formResponses` is not currently passed into the hook, add it to `UseServiceBookingArgs` and the call site in `service-booking-client.tsx`. The hook needs `pets`, `selectedPetIds`, `service.pricingType`, and `formResponses` to compute requirements.

- [ ] **Step 4: Compute requirements from pets (replace quote-derived gate)**

In `use-service-booking.ts`, add a pure derivation that runs on pet/timestamp change. Build the `bookingRequirements` input the same way the server does (mirror `booking-service-shared.ts:600-624`):

```ts
import {
  bookingRequirements,
  type RequirementItem,
  type AccountFormKey,
  type PetFormKey,
} from "@/features/booking";

// …inside the hook…
const profileRequirements: RequirementItem[] = useMemo(() => {
  if (authState !== "ready") return [];
  const assignedPets = pets
    .filter((p) => selectedPetIds.includes(p.id))
    .map((p) => ({ id: p.id, name: p.name, species: p.species }));

  const accountForms: Partial<Record<AccountFormKey, string | null>> = {
    owner: formResponses["owner"]?.submittedAt ?? null,
    home_access: formResponses["home_access"]?.submittedAt ?? null,
    home_sitting: formResponses["home_sitting"]?.submittedAt ?? null,
  };
  const petForms: Record<
    string,
    Partial<Record<PetFormKey, string | null>>
  > = {};
  for (const p of assignedPets) {
    petForms[p.id] = {
      pet_care: formResponses[`pet_care:${p.id}`]?.submittedAt ?? null,
      pet_walk: formResponses[`pet_walk:${p.id}`]?.submittedAt ?? null,
    };
  }
  return bookingRequirements({
    pricingType: service.pricingType,
    assignedPets,
    accountForms,
    petForms,
    now: new Date(),
  });
}, [authState, pets, selectedPetIds, formResponses, service.pricingType]);

const formsIncomplete = useMemo(
  () => profileRequirements.some((r) => r.status !== "complete"),
  [profileRequirements],
);
```

Remove the old `useState`-based `formsIncomplete` / `profileRequirements` and the lines in `runPreviewRef`/`clearOnSelectRef`/`clearOnIdleRef` that set them from `out.preview.requirements`. Keep `refreshRequirements` but repoint it: a form save mutates server timestamps, so after save the page-supplied `formResponses` is stale — `refreshRequirements` should call `router.refresh()` (re-runs the server component to re-fetch `submitted_at`). Replace its body:

```ts
function refreshRequirements() {
  router.refresh();
}
```

`router` is already imported in this hook (used by `handleBook`). Verify.

- [ ] **Step 5: Keep the create backstop**

Leave the `result.kind === "profiles_incomplete"` branch in `handleBook` as-is (server remains authoritative). It currently calls `setFormsIncomplete(true)`/`setProfileRequirements(...)`; since those are now derived, instead surface the toast only (the derived gate will reflect reality after `router.refresh()`), OR keep a small `serverGateOverride` state if you want an immediate re-block. Simplest: drop the two setter calls (the toast still informs the user) and rely on the derived gate. Confirm `bookEnabled` still includes `!formsIncomplete && (authState !== "ready" || quote !== null)`.

- [ ] **Step 6: Render forms when complete + remove date copy**

In `service-booking-client.tsx` `formsSection`, restructure the ready branch so rows always render and the success line shows when satisfied. Replace the `formsIncomplete ? <RequirementsGate/> : quote ? <up-to-date/> : <pick-a-date/>` ternary with:

```tsx
{
  profileRequirements.length === 0 ? (
    <p className="text-status-available-foreground inline-flex items-center gap-1.5 text-sm font-medium">
      <Check className="size-4" strokeWidth={2.5} aria-hidden="true" />
      Your forms are up to date.
    </p>
  ) : (
    <>
      {!formsIncomplete && (
        <p className="text-status-available-foreground mb-3 inline-flex items-center gap-1.5 text-sm font-medium">
          <Check className="size-4" strokeWidth={2.5} aria-hidden="true" />
          Your forms are up to date.
        </p>
      )}
      <RequirementsGate
        requirements={profileRequirements}
        pets={pets}
        formResponses={formResponses}
        auth={
          {
            /* unchanged auth config object */
          }
        }
        onSaved={refreshRequirements}
        allComplete={!formsIncomplete}
      />
    </>
  );
}
```

In `RequirementsGate`, accept `allComplete?: boolean` and swap the intro line: when `allComplete`, show nothing extra (rows + the success line above suffice); when incomplete, keep "So Cal has what's needed… Complete or reconfirm these to finish booking." The `FormCard` rows already start collapsed with status, so complete rows render fine. `formResponses` now has the wider type; `FormCard existing` reads `.data` only — pass `formResponses[scopeKey]` unchanged.

Delete the standalone "Pick a date and time and we'll list any forms…" paragraph entirely.

- [ ] **Step 7: Update the characterization test**

In `service-booking-client.characterization.test.tsx`, remove/replace any assertion expecting "Pick a date and time and we'll list any forms"; add coverage that with a ready user + selected pet whose forms are complete, both the rows and "Your forms are up to date" render before any date is chosen. (Mirror the file's existing render harness — it stubs the hooks/props.)

- [ ] **Step 8: Run tests + typecheck**

Run: `npx vitest run "src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.characterization.test.tsx" && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 9: Manual smoke (all states)**

`/book/house-sitting` as a ready user: (a) zero pets → owner/home/home-sitting rows show immediately, no date needed; (b) add a pet with stale/missing forms → pet rows appear, Book disabled; (c) all complete → rows + "up to date" line; (d) Book still requires a date (quote) to enable.

- [ ] **Step 10: Commit**

```bash
git add "src/app/(site)/(marketing)/book/[serviceSlug]/page.tsx" "src/app/(site)/(marketing)/book/[serviceSlug]/_components/use-service-booking.ts" "src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx" "src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.characterization.test.tsx"
git commit -m "feat(booking): drive required-forms gate from pet selection"
```

---

### Task 8: Restyle the booking-page header (item 7, public page only)

**Files:**

- Create: `src/components/ui/service-switcher.tsx`
- Modify: `src/app/(site)/(marketing)/book/[serviceSlug]/page.tsx` (replace the pills/back-link block)
- Modify: `docs/COMPONENT_SYSTEM.md` (register the new primitive — same-commit doc rule)

**Interfaces:**

- Consumes: sibling services list already loaded in `page.tsx` (`siblingServices: { slug; name }[]`), current `service.slug`.
- Produces:

  ```tsx
  export function ServiceSwitcher(props: {
    services: { slug: string; name: string }[];
    activeSlug: string;
  }): JSX.Element;
  ```

  A link-based segmented control matching the Multiswitch track styling, with `aria-current="page"` on the active anchor. Server-renderable (no client JS).

- [ ] **Step 1: Build the switcher (visual match to Multiswitch track)**

Create `service-switcher.tsx`:

```tsx
import Link from "next/link";
import { controlBox } from "@/components/ui/control-variants";
import { cn } from "@/lib/utils";

/**
 * Link-based segmented service switcher for the booking page header. Visually
 * matches the Multiswitch track (muted track, hairline border, control radius)
 * but each segment is a real <Link> to /book/[slug] — route nav, not stateful
 * toggle — so it works without JS and is keyboard/SEO-friendly. The active
 * service is a filled brand segment carrying aria-current.
 */
export function ServiceSwitcher({
  services,
  activeSlug,
}: {
  services: { slug: string; name: string }[];
  activeSlug: string;
}) {
  return (
    <nav
      aria-label="Choose a service"
      className={cn(
        controlBox.md,
        "bg-muted border-border inline-flex flex-wrap items-stretch gap-0.5 border p-1",
      )}
    >
      {services.map((s) => {
        const isActive = s.slug === activeSlug;
        return (
          <Link
            key={s.slug}
            href={`/book/${s.slug}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring inline-flex items-center rounded-md px-3 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none",
              isActive
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.name}
          </Link>
        );
      })}
    </nav>
  );
}
```

> If `controlBox.md` (fixed height) crowds wrapped rows on mobile, drop it and use `rounded-control` + `py-1` so the track grows with wrapping. Decide during the visual check in Step 4.

- [ ] **Step 2: Replace the header block in page.tsx**

In `page.tsx`, swap the `RevealGroup` header internals. Keep the `Reveal` wrappers + `<h1>` + description; replace the muted "← All services" link + the pill `nav` with the breadcrumb + switcher:

```tsx
<RevealGroup className="mx-auto mb-8 w-full max-w-xl">
  <Reveal>
    <Link
      href="/services"
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium tracking-wide uppercase"
    >
      Services
    </Link>
  </Reveal>
  {siblingServices.length > 1 && (
    <Reveal className="mt-3 mb-6">
      <ServiceSwitcher services={siblingServices} activeSlug={service.slug} />
    </Reveal>
  )}
  <Reveal as="h1" className="font-heading mb-1 text-2xl font-semibold">
    {service.name}
  </Reveal>
  {service.description && (
    <Reveal as="p" className="text-muted-foreground text-sm">
      {service.description}
    </Reveal>
  )}
</RevealGroup>
```

Add `import { ServiceSwitcher } from "@/components/ui/service-switcher";`. Ensure `font-heading` (Fraunces) is applied to the title (match the site's other page titles — grep an existing `<h1>` for the exact class if it differs). Keep the `siblingServices.length <= 1` case rendering just the title (no empty switcher).

- [ ] **Step 3: Register in the component doc**

Add a one-line entry for `ServiceSwitcher` to `docs/COMPONENT_SYSTEM.md` under the controls/nav section (same-commit rule).

- [ ] **Step 4: Visual check + a11y**

Run the app, open `/book/walk`. Confirm: switcher reads as a segmented control matching the site's Multiswitch look; active service is the filled brand segment; Tab moves through the service links with a visible focus ring; the breadcrumb "Services" links to `/services`; wraps cleanly on a 360px-wide viewport (mobile parity). Adjust per the Step 1 note if wrapping looks cramped.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/service-switcher.tsx "src/app/(site)/(marketing)/book/[serviceSlug]/page.tsx" docs/COMPONENT_SYSTEM.md
git commit -m "feat(booking): restyle service header as a segmented switcher"
```

---

## Final verification

- [ ] Run the full booking-feature unit suite (excluding integration tests that need the local stack):
      `npx vitest run src/features/booking/pet-step-heading.test.ts src/features/booking/booking-service.test.ts src/features/booking/diff-booking-patch.test.ts src/features/booking/quantity-state-from-quote-inputs.test.ts src/features/booking/_components/quote-panel.test.tsx src/features/booking/_components/booking-flow.test.tsx "src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.characterization.test.tsx"`
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run lint` clean (token/lint rules).
- [ ] Manual pass across all three surfaces: public `/book/<slug>`, admin create-on-behalf, owner/admin edit — verify no nested outlines, correct pet headings + walk hint, no can't-be-left-alone field, house-sitting shows the approval note in the quote, reworded empty quote, forms gate behaves on pet selection (public), and the new header switcher.

## Self-review notes

- **Spec coverage:** item 1 → Task 6; item 2 → Tasks 3+4; item 3 → Task 5; item 4 → Task 7; item 5 → Task 1; item 6 → Task 2; item 7 → Task 8. All seven covered, plus the cross-surface heading-parity decision (Task 4) and the public-only scoping of items 4 & 7.
- **Risks flagged inline:** legacy zod strip (Task 5 Step 1/6), `router.refresh()` for post-save freshness (Task 7 Step 4), `maxPets` scope in admin-create (Task 4 Step 7/10), `PetSpecies` import location (Task 4 Step 3).
- **Type consistency:** `petStepHeading` signature is identical across Tasks 4 call sites; `formResponses` widened type (`{ data; submittedAt }`) is applied at the page, the prop, and the hook together in Task 7.
