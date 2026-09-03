# Pricing Constraints + Approval Reasons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the quote's typed `approvalReasons` in the price panel, and make the booking pickers obey each service's `pricing_config.constraints`.

**Architecture:** Constraints already exist as a Zod-validated `{ modifiers, constraints }` jsonb (Phase 1). This phase carries the parsed `Constraints` object onto the client `ServiceDetail`, then replaces the per-`pricingType` hardcodes in the scheduler/pickers with reads from it. Approval reasons are already carried end-to-end on `BookingQuotePreview`; we just render them.

**Tech Stack:** Next.js (App Router) + TypeScript strict · React client components · Vitest + Testing Library · Supabase (read path only) · Zod (already in place).

## Global Constraints

- TypeScript `strict`, no `any`, no `ts-ignore`.
- Seeded constraint values are authoritative — do NOT change them; enforce as-is.
- No species expansion — `pets.species` is the enum `pet_species ('dog','cat')`; house-sit's `allowedSpecies:[all 7]` is inert. Leave `PetAvatar`/labels untouched.
- Final state: `npx tsc --noEmit` ZERO errors; pricing + booking unit suites green; pre-commit hook passes with NO `--no-verify`.
- Working tree has UNRELATED uncommitted files (`TEMP.md`, `docs/DEV_NOTES.md`, `src/content/marketing.ts`, `SYNC.md`). Stage ONLY each task's own files explicitly (`git add <files>`) — NEVER `git commit -am`.
- Commit messages: Conventional Commits, subject line only — no body, no trailers, no phase numbers.

---

### Task 1: Render approval reasons in the quote panel

**Files:**

- Modify: `src/features/booking/_components/quote-panel.tsx` (the generic approval line, lines ~100-104)
- Test: `src/features/booking/_components/quote-panel.test.tsx` (create)

**Interfaces:**

- Consumes: `BookingQuotePreview.approvalReasons: ApprovalReason[]` where `ApprovalReason = { code: ApprovalReasonCode; message: string; severity: "info" | "warn" | "block" }` (from `@/features/pricing`, re-exported via `booking-service`); `preview.requiresApproval: boolean`.
- Produces: nothing new consumed by later tasks.

Severity → `Alert` variant: `block` → `"error"`, `warn` → `"warning"`, `info` → `"info"` (variants exist in `src/components/ui/alert.tsx`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/booking/_components/quote-panel.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { QuotePanel } from "./quote-panel";
import type { BookingQuotePreview } from "@/features/booking/booking-service";

function preview(over: Partial<BookingQuotePreview> = {}): BookingQuotePreview {
  return {
    breakdown: {
      lines: [{ label: "Base", amountCents: 5000 }],
      finalCents: 5000,
    },
    finalCents: 5000,
    distanceMiles: 3,
    requiresApproval: true,
    decision: "manual",
    approvalReasons: [],
    warnings: [],
    requirements: [],
    ...over,
  } as BookingQuotePreview;
}

describe("QuotePanel approval reasons", () => {
  it("renders each typed reason message", () => {
    render(
      <QuotePanel
        preview={preview({
          approvalReasons: [
            {
              code: "service_manual_only",
              message: "Cal confirms this personally.",
              severity: "info",
            },
            {
              code: "distance_refuse",
              message: "Beyond the service area.",
              severity: "block",
            },
          ],
        })}
      />,
    );
    expect(
      screen.getByText("Cal confirms this personally."),
    ).toBeInTheDocument();
    expect(screen.getByText("Beyond the service area.")).toBeInTheDocument();
  });

  it("falls back to the generic line when reasons are empty but approval is required", () => {
    render(<QuotePanel preview={preview({ approvalReasons: [] })} />);
    expect(
      screen.getByText(/Requires Cal.s approval before it is confirmed/i),
    ).toBeInTheDocument();
  });

  it("shows no approval text when not required and no reasons", () => {
    render(
      <QuotePanel
        preview={preview({ requiresApproval: false, decision: "auto" })}
      />,
    );
    expect(
      screen.queryByText(/Requires Cal.s approval/i),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/_components/quote-panel.test.tsx`
Expected: FAIL — the first test can't find the reason messages (panel renders only the generic line today).

- [ ] **Step 3: Implement the reasons block**

In `quote-panel.tsx`, replace the existing generic approval paragraph:

```tsx
{
  preview.requiresApproval && (
    <p className="text-foreground/70 mt-2 text-xs italic">
      Requires Cal&apos;s approval before it is confirmed.
    </p>
  );
}
```

with a typed-reasons block that falls back to the generic line:

```tsx
{
  preview.approvalReasons.length > 0 ? (
    <ul className="mt-3 space-y-2">
      {preview.approvalReasons.map((reason) => (
        <li key={reason.code}>
          <Alert
            variant={
              reason.severity === "block"
                ? "error"
                : reason.severity === "warn"
                  ? "warning"
                  : "info"
            }
          >
            {reason.message}
          </Alert>
        </li>
      ))}
    </ul>
  ) : (
    preview.requiresApproval && (
      <p className="text-foreground/70 mt-2 text-xs italic">
        Requires Cal&apos;s approval before it is confirmed.
      </p>
    )
  );
}
```

(`Alert` is already imported in this file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/booking/_components/quote-panel.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/features/booking/_components/quote-panel.tsx src/features/booking/_components/quote-panel.test.tsx
git commit -m "feat(booking): render typed approval reasons in quote panel"
```

---

### Task 2: Carry `constraints` on the client `ServiceDetail`

**Files:**

- Modify: `src/features/booking/service-detail.ts` (add field)
- Modify: `src/app/(site)/(marketing)/book/[serviceSlug]/page.tsx` (fetch + parse + attach)
- Modify: `src/app/(site)/(admin)/admin/clients/[clientId]/book/page.tsx`
- Modify: `src/app/(site)/(admin)/admin/clients/[clientId]/bookings/[bookingId]/edit/page.tsx`
- Modify: `src/app/(site)/(account)/account/bookings/[id]/edit/page.tsx`
- Modify: `src/app/(site)/(admin)/admin/clients/[clientId]/book/_components/admin-create-booking-flow.tsx` (its local picked-service type + the literal at line ~52)
- Modify (test fixtures, add `constraints`): `src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.characterization.test.tsx`, `.../use-service-booking.characterization.test.tsx`
- Test: `src/features/booking/service-detail.test.ts` (create)

**Interfaces:**

- Consumes: `Constraints`, `parsePricingConfig` from `@/features/pricing`.
- Produces: `ServiceDetail.constraints: Constraints` — read by Tasks 3, 4, 6.

`Constraints` shape (already defined in `src/features/pricing/modifier-types.ts`):
`{ intervalMin: number; minDurationMin?: number; maxDurationMin?: number; maxDogs?: number; allowedSpecies: Species[]; softDistanceWarnMiles?: number }`.

- [ ] **Step 1: Write the failing test for a default-constraints helper**

We need a single helper so every construction site (and tests) builds a valid fallback `Constraints` without duplication.

```ts
// src/features/booking/service-detail.test.ts
import { describe, it, expect } from "vitest";
import { DEFAULT_CONSTRAINTS } from "./service-detail";

describe("DEFAULT_CONSTRAINTS", () => {
  it("is a permissive dog/cat fallback used when a service has no parseable config", () => {
    expect(DEFAULT_CONSTRAINTS.intervalMin).toBeGreaterThan(0);
    expect(DEFAULT_CONSTRAINTS.allowedSpecies).toEqual(["dog", "cat"]);
    expect(DEFAULT_CONSTRAINTS.maxDogs).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/service-detail.test.ts`
Expected: FAIL — `DEFAULT_CONSTRAINTS` not exported.

- [ ] **Step 3: Add the field + default to `service-detail.ts`**

```ts
import type { PricingType, Constraints } from "@/features/pricing";

/**
 * Permissive fallback used only when a service row's pricing_config can't be
 * parsed — keeps the booking UI functional (dog/cat, 15-min grid, no caps)
 * rather than crashing. Real services always carry their seeded constraints.
 */
export const DEFAULT_CONSTRAINTS: Constraints = {
  intervalMin: 15,
  allowedSpecies: ["dog", "cat"],
};

export interface ServiceDetail {
  slug: string;
  name: string;
  description: string | null;
  pricingType: PricingType;
  defaultDurationMin: number | null;
  /** The service's booking constraints (parsed from pricing_config). */
  constraints: Constraints;
}
```

- [ ] **Step 4: Run helper test to verify it passes**

Run: `npx vitest run src/features/booking/service-detail.test.ts`
Expected: PASS.

- [ ] **Step 5: Run tsc to enumerate the broken construction sites**

Run: `npx tsc --noEmit`
Expected: FAIL — each `ServiceDetail` literal now misses `constraints` (book page, two admin pages, account edit page, `admin-create-booking-flow.tsx`, and the two characterization test fixtures).

- [ ] **Step 6: Attach `constraints` at the public book page**

In `book/[serviceSlug]/page.tsx`, add `pricing_config` to the single-service select (currently `"id, slug, name, description, pricing_type, default_duration_min"`):

```ts
        .select(
          "id, slug, name, description, pricing_type, pricing_config, default_duration_min",
        )
```

Add the import and parse-with-fallback, then attach to the `service` literal:

```ts
import { parsePricingConfig } from "@/features/pricing";
import { type ServiceDetail, DEFAULT_CONSTRAINTS } from "@/features/booking";
// …
let constraints = DEFAULT_CONSTRAINTS;
try {
  constraints = parsePricingConfig(serviceRow.pricing_config).constraints;
} catch {
  // keep DEFAULT_CONSTRAINTS — never crash the booking page on bad config
}

const service: ServiceDetail = {
  slug: serviceRow.slug as string,
  name: serviceRow.name as string,
  description:
    typeof serviceRow.description === "string" ? serviceRow.description : null,
  pricingType: serviceRow.pricing_type as PricingType,
  defaultDurationMin:
    typeof serviceRow.default_duration_min === "number"
      ? serviceRow.default_duration_min
      : null,
  constraints,
};
```

Ensure `DEFAULT_CONSTRAINTS` is exported from the `@/features/booking` barrel (`src/features/booking/index.ts`) — add it next to the existing `service-detail` re-exports if not already present.

- [ ] **Step 7: Attach `constraints` at the remaining construction sites**

Apply the SAME pattern (add `pricing_config` to the select, `parsePricingConfig(...).constraints` with a `DEFAULT_CONSTRAINTS` fallback, add `constraints` to the literal) at:

- `admin/clients/[clientId]/book/page.tsx` (literal ~line 56)
- `admin/clients/[clientId]/bookings/[bookingId]/edit/page.tsx` (literal ~line 75)
- `account/bookings/[id]/edit/page.tsx` (literal ~line 91)

For `admin-create-booking-flow.tsx`: its picked-service type (line ~15) and the `ServiceDetail` literal it builds (line ~52) come from a list already loaded upstream. Add `constraints: Constraints` to that local type and thread it from the upstream loader (which calls `listActiveServices` → `PublicService.pricingConfig.constraints` is available); set `constraints: picked.constraints` in the literal.

For the two characterization test fixtures, add `constraints: DEFAULT_CONSTRAINTS` to each `ServiceDetail` fixture literal (import `DEFAULT_CONSTRAINTS` from `@/features/booking`).

- [ ] **Step 8: Run tsc to verify zero errors**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors). If any site remains, the error names it — fix and re-run.

- [ ] **Step 9: Run the affected unit suites**

Run: `npx vitest run src/features/booking/service-detail.test.ts src/app/(site)/(marketing)/book`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/features/booking/service-detail.ts src/features/booking/service-detail.test.ts src/features/booking/index.ts "src/app/(site)/(marketing)/book/[serviceSlug]/page.tsx" "src/app/(site)/(admin)/admin/clients/[clientId]/book/page.tsx" "src/app/(site)/(admin)/admin/clients/[clientId]/bookings/[bookingId]/edit/page.tsx" "src/app/(site)/(account)/account/bookings/[id]/edit/page.tsx" "src/app/(site)/(admin)/admin/clients/[clientId]/book/_components/admin-create-booking-flow.tsx" "src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.characterization.test.tsx" "src/app/(site)/(marketing)/book/[serviceSlug]/_components/use-service-booking.characterization.test.tsx"
git commit -m "feat(booking): carry pricing constraints on ServiceDetail"
```

---

### Task 3: Scheduler reads `allowedSpecies` + `maxPets` from constraints

**Files:**

- Modify: `src/features/booking/use-booking-scheduler.ts` (lines ~273-276)
- Test: `src/features/booking/use-booking-scheduler.characterization.test.ts` or the existing hook characterization test that covers these derivations (search for the test asserting `allowedSpecies`/`maxPets`); if none isolates them, create `src/features/booking/scheduler-constraints.test.ts` around a small pure helper (below).

**Interfaces:**

- Consumes: `service.constraints.allowedSpecies`, `service.constraints.maxDogs` (Task 2).
- Produces: unchanged return fields `allowedSpecies: PetSpecies[]`, `maxPets: number | null`.

To keep this pure-testable, extract the two reads into exported helpers.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/booking/scheduler-constraints.test.ts
import { describe, it, expect } from "vitest";
import { allowedSpeciesOf, maxPetsOf } from "./use-booking-scheduler";
import type { Constraints } from "@/features/pricing";

const walk: Constraints = {
  intervalMin: 15,
  maxDogs: 2,
  allowedSpecies: ["dog"],
};
const houseSit: Constraints = {
  intervalMin: 15,
  allowedSpecies: ["dog", "cat", "bird", "rodent", "reptile", "fish", "other"],
};

describe("scheduler constraint reads", () => {
  it("maxPetsOf returns maxDogs, or null when absent", () => {
    expect(maxPetsOf(walk)).toBe(2);
    expect(maxPetsOf(houseSit)).toBeNull();
  });
  it("allowedSpeciesOf narrows config species to the avatar's dog/cat set", () => {
    // pets are dog/cat by DB enum, so non-dog/cat config entries are dropped
    expect(allowedSpeciesOf(walk)).toEqual(["dog"]);
    expect(allowedSpeciesOf(houseSit)).toEqual(["dog", "cat"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/scheduler-constraints.test.ts`
Expected: FAIL — `allowedSpeciesOf`/`maxPetsOf` not exported.

- [ ] **Step 3: Add the helpers and use them in the hook**

In `use-booking-scheduler.ts`, add near the other module helpers:

```ts
import type { Constraints } from "@/features/pricing";

/** Pets are dog/cat by DB enum; narrow the config's species to that avatar set. */
export function allowedSpeciesOf(constraints: Constraints): PetSpecies[] {
  const set: PetSpecies[] = [];
  if (constraints.allowedSpecies.includes("dog")) set.push("dog");
  if (constraints.allowedSpecies.includes("cat")) set.push("cat");
  return set;
}

/** Cap on selected pets — the service's maxDogs, or null for unlimited. */
export function maxPetsOf(constraints: Constraints): number | null {
  return constraints.maxDogs ?? null;
}
```

Replace the hardcodes (lines ~273-276):

```ts
const allowedSpecies: PetSpecies[] = allowedSpeciesOf(service.constraints);
const maxPets: number | null = maxPetsOf(service.constraints);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/booking/scheduler-constraints.test.ts`
Expected: PASS.

- [ ] **Step 5: Update any characterization test that asserted the old hardcodes**

Run: `npx vitest run src/features/booking src/app/(site)/(marketing)/book`
If a characterization test fixture used a `ServiceDetail` with default constraints and asserted `maxPets === null` for walk, update its fixture `constraints` to the realistic seeded values and assert the constraint-driven result. Do NOT delete coverage — adjust expectations.
Expected after fixes: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/features/booking/use-booking-scheduler.ts src/features/booking/scheduler-constraints.test.ts
git commit -m "feat(booking): derive allowed species and pet cap from constraints"
```

---

### Task 4: Clamp booking duration to `min/maxDurationMin`

**Files:**

- Modify: `src/features/booking/use-booking-scheduler.ts` (expose duration bounds)
- Modify: `src/features/booking/_components/quantity-forms.tsx` (hours branch min/max + clamp)
- Modify: `src/app/(site)/(marketing)/book/[serviceSlug]/_components/use-service-booking.ts` + `service-booking-client.tsx` (thread bounds → `<QuantityForm>`)
- Modify (same one-line prop pass): the admin-create and edit surface clients that render `<QuantityForm>` (`admin-create-booking-flow.tsx` / `edit-booking-client.tsx`)
- Test: `src/features/booking/duration-bounds.test.ts` (create)

**Interfaces:**

- Consumes: `service.constraints.minDurationMin?`, `service.constraints.maxDurationMin?`.
- Produces: `durationBoundsOf(constraints): { minHours: number; maxHours?: number }`; the scheduler return gains `durationBounds: { minHours: number; maxHours?: number }`; `QuantityForm` gains optional props `minHours?: number; maxHours?: number`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/booking/duration-bounds.test.ts
import { describe, it, expect } from "vitest";
import { durationBoundsOf } from "./use-booking-scheduler";
import type { Constraints } from "@/features/pricing";

describe("durationBoundsOf", () => {
  it("converts minute bounds to hours", () => {
    const walk: Constraints = {
      intervalMin: 15,
      minDurationMin: 30,
      maxDurationMin: 180,
      allowedSpecies: ["dog"],
    };
    expect(durationBoundsOf(walk)).toEqual({ minHours: 0.5, maxHours: 3 });
  });
  it("defaults minHours to 0.25 and omits maxHours when unbounded", () => {
    const hs: Constraints = { intervalMin: 15, allowedSpecies: ["dog", "cat"] };
    expect(durationBoundsOf(hs)).toEqual({ minHours: 0.25 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/duration-bounds.test.ts`
Expected: FAIL — `durationBoundsOf` not exported.

- [ ] **Step 3: Add the helper + expose on the scheduler return**

In `use-booking-scheduler.ts`:

```ts
export function durationBoundsOf(constraints: Constraints): {
  minHours: number;
  maxHours?: number;
} {
  const minHours =
    constraints.minDurationMin !== undefined
      ? constraints.minDurationMin / 60
      : 0.25;
  return constraints.maxDurationMin !== undefined
    ? { minHours, maxHours: constraints.maxDurationMin / 60 }
    : { minHours };
}
```

Compute `const durationBounds = durationBoundsOf(service.constraints);` in the hook body and add `durationBounds` to both `UseBookingSchedulerReturn` (type) and the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/booking/duration-bounds.test.ts`
Expected: PASS.

- [ ] **Step 5: Accept + clamp bounds in `QuantityForm`**

In `quantity-forms.tsx`, add optional props to `QuantityForm`:

```tsx
export function QuantityForm({
  state,
  onChange,
  kiche,
  minHours,
  maxHours,
}: {
  state: QuantityState;
  onChange: (s: QuantityState) => void;
  kiche?: { welcome: boolean; onChange: (v: boolean) => void };
  /** Duration bounds (hours) from the service constraints. Hours services only. */
  minHours?: number;
  maxHours?: number;
}) {
```

In the hours-based branch, feed and clamp:

```tsx
<StepperField
  id={copy.id}
  label={copy.label}
  description={copy.description}
  value={state.qty.hours}
  min={minHours ?? 0.25}
  max={maxHours}
  step={0.25}
  unit="hr"
  onChange={(v) => {
    const lo = minHours ?? 0.25;
    const clamped = Math.min(Math.max(v, lo), maxHours ?? v);
    onChange({ type: state.type, qty: { hours: clamped } });
  }}
/>
```

- [ ] **Step 6: Thread bounds through the public surface**

In `use-service-booking.ts`, surface `durationBounds` from the shared hook (add to its return). In `service-booking-client.tsx`, where `<QuantityForm>` is rendered in the details section, pass `minHours={durationBounds.minHours} maxHours={durationBounds.maxHours}`. Apply the identical one-line prop pass in the admin-create and edit surface clients that render `<QuantityForm>`.

- [ ] **Step 7: Run tests + tsc**

Run: `npx vitest run src/features/booking/duration-bounds.test.ts src/features/booking` then `npx tsc --noEmit`
Expected: PASS, 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/features/booking/use-booking-scheduler.ts src/features/booking/duration-bounds.test.ts src/features/booking/_components/quantity-forms.tsx "src/app/(site)/(marketing)/book/[serviceSlug]/_components/use-service-booking.ts" "src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx" "src/app/(site)/(admin)/admin/clients/[clientId]/book/_components/admin-create-booking-flow.tsx" "src/app/(site)/(account)/account/bookings/[id]/edit/_components/edit-booking-client.tsx"
git commit -m "feat(booking): clamp booking duration to service constraints"
```

---

### Task 5: At-cap feedback in the pet picker

**Files:**

- Modify: `src/features/booking/_components/pet-assignment.tsx`
- Test: `src/features/booking/_components/pet-assignment.test.tsx` (create)

**Interfaces:**

- Consumes: existing props `maxSelect?: number | null`, `allowedSpecies`, `pets`, `selected`, `onChange`.
- Produces: nothing new for later tasks. Adds a visible at-cap notice (today the over-cap toggle is a silent no-op at line ~63).

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/booking/_components/pet-assignment.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PetAssignment, type AssignablePet } from "./pet-assignment";

const pets: AssignablePet[] = [
  {
    id: "a",
    name: "Rex",
    species: "dog",
    breed: null,
    notes: null,
    photoUrl: null,
  },
  {
    id: "b",
    name: "Milo",
    species: "dog",
    breed: null,
    notes: null,
    photoUrl: null,
  },
  {
    id: "c",
    name: "Spot",
    species: "dog",
    breed: null,
    notes: null,
    photoUrl: null,
  },
];

describe("PetAssignment cap feedback", () => {
  it("shows an at-cap notice and does not add beyond maxSelect", () => {
    const onChange = vi.fn();
    render(
      <PetAssignment
        pets={pets}
        allowedSpecies={["dog"]}
        selected={["a", "b"]}
        onChange={onChange}
        onPetAdded={() => {}}
        maxSelect={2}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Spot/ }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/up to 2/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/_components/pet-assignment.test.tsx`
Expected: FAIL — no at-cap notice rendered.

- [ ] **Step 3: Add at-cap state + notice**

In `pet-assignment.tsx`, add an `atCap` flag set when a toggle is blocked, and render a notice. Replace the `toggle` body's blocked branch:

```tsx
const [showCapNotice, setShowCapNotice] = useState(false);

function toggle(id: string) {
  if (maxSelect === 1) {
    onChange(selected.includes(id) ? [] : [id]);
    return;
  }
  const next = selected.includes(id)
    ? selected.filter((s) => s !== id)
    : [...selected, id];
  if (typeof maxSelect === "number" && next.length > maxSelect) {
    setShowCapNotice(true);
    return;
  }
  setShowCapNotice(false);
  onChange(next);
}
```

Render the notice under the pet grid (only when `maxSelect` is a finite number > 1 and `showCapNotice`):

```tsx
{
  showCapNotice && typeof maxSelect === "number" && maxSelect > 1 && (
    <p className="text-muted-foreground text-xs" role="status">
      You can select up to {maxSelect} pets for this service.
    </p>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/booking/_components/pet-assignment.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/features/booking/_components/pet-assignment.tsx src/features/booking/_components/pet-assignment.test.tsx
git commit -m "feat(booking): show at-cap notice in pet picker"
```

---

### Task 6: Drive the slot-start grid from `constraints.intervalMin`

**Files:**

- Modify: `src/features/booking/hourly-scheduler-data.ts` (param the hardcoded `granularityMin: 15` at line ~51)
- Modify: `src/features/booking/use-booking-scheduler.ts` (pass `granularityMin` into `hourlySchedulerData`; carry interval into capabilities)
- Modify: `src/features/booking/schedule-capabilities.ts` (add optional `startGranularityMin`)
- Modify: `src/features/booking/_components/scheduler/day-timeline.tsx` (use `capabilities.startGranularityMin ?? 15` in place of the hardcoded `granularityMin: 15` at line ~212)
- Test: `src/features/booking/hourly-scheduler-data.test.ts` (extend)

**Interfaces:**

- Consumes: `service.constraints.intervalMin` (Task 2).
- Produces: `HourlySchedulerDataInput.granularityMin: number`; `SchedulerCapabilities.startGranularityMin?: number`.

Note: `capabilities.intervalMinutes` is the booking BLOCK length (= duration) — leave it as-is. Only the start-grid (`granularityMin`, hardcoded 15 in two places) becomes constraint-driven. Walk (15) is unchanged; check_in/training (5) gain finer starts.

- [ ] **Step 1: Write the failing test**

```ts
// add to src/features/booking/hourly-scheduler-data.test.ts
import { describe, it, expect } from "vitest";
import { hourlySchedulerData } from "./hourly-scheduler-data";

describe("hourlySchedulerData granularity", () => {
  it("passes a 5-minute start grid through to availability", () => {
    const now = new Date("2026-06-20T08:00:00-06:00");
    const open = {
      startsAt: new Date("2026-06-20T09:00:00-06:00"),
      endsAt: new Date("2026-06-20T09:20:00-06:00"),
    };
    const data = hourlySchedulerData({
      now,
      openWindows: [open],
      busy: [],
      durationMin: 15,
      granularityMin: 5,
      rules: { hardMaxAdvanceDays: 1, minLeadTimeHours: 0 } as never,
      myBookings: new Set(),
      premiumDays: new Set(),
      bufferMin: 0,
    });
    // A 20-min window fitting a 15-min booking on a 5-min grid has a bookable start.
    expect(data.overnightNights.size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/hourly-scheduler-data.test.ts`
Expected: FAIL — `granularityMin` is not an accepted input (TS error / runtime ignores it).

- [ ] **Step 3: Param the granularity in `hourly-scheduler-data.ts`**

Add `granularityMin: number;` to `HourlySchedulerDataInput`, destructure it, and pass it through instead of the literal `15`:

```ts
const overnightNights = hourlyAvailableDayKeys({
  days,
  windows: openWindows,
  busy,
  durationMin,
  granularityMin,
  leadTimeMs: rules.minLeadTimeHours * 60 * 60 * 1000,
  now,
  bufferMin,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/booking/hourly-scheduler-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread the constraint through the hook + capabilities + timeline**

In `schedule-capabilities.ts`, add `startGranularityMin?: number;` to `SchedulerCapabilities`.

In `use-booking-scheduler.ts`:

- pass `granularityMin: service.constraints.intervalMin` into the `hourlySchedulerData({ … })` call (mode `week-slots` branch);
- in `buildCapabilities`, accept the interval and set `startGranularityMin` on the week-slots capability object:

```ts
function buildCapabilities(
  mode: BookingMode,
  durationMin: number,
  startGranularityMin: number,
) {
  return mode === "month-range"
    ? BOOK_HOUSE_SITTING_CAPABILITIES
    : {
        ...BOOK_WALK_CAPABILITIES,
        weekNavigable: false,
        intervalMinutes: durationMin,
        startGranularityMin,
      };
}
```

Update its call site (`useMemo`) to pass `service.constraints.intervalMin` and add it to the dep array.

In `day-timeline.tsx`, replace the hardcoded start grid (line ~212) `granularityMin: 15` with `granularityMin: capabilities.startGranularityMin ?? 15`.

- [ ] **Step 6: Run the scheduler + timeline suites + tsc**

Run: `npx vitest run src/features/booking/hourly-scheduler-data.test.ts src/features/booking/day-timeline-model.test.ts src/features/booking` then `npx tsc --noEmit`
Expected: PASS, 0 errors. Existing walk tests (15-min grid) stay green because walk's `intervalMin` is 15.

- [ ] **Step 7: Commit**

```bash
git add src/features/booking/hourly-scheduler-data.ts src/features/booking/hourly-scheduler-data.test.ts src/features/booking/use-booking-scheduler.ts src/features/booking/schedule-capabilities.ts src/features/booking/_components/scheduler/day-timeline.tsx
git commit -m "feat(booking): drive slot-start grid from service interval"
```

---

### Final verification (after Task 6)

- [ ] **Full typecheck:** `npx tsc --noEmit` → 0 errors.
- [ ] **Pricing + booking suites:** `npx vitest run src/features/pricing src/features/booking` → green (DB-integration tests that need a seeded local stack are not a gate; note any pre-existing failures).
- [ ] **Hook + pre-commit:** confirm the pre-commit hook (lint-staged + full tsc) passes on the final commit with NO `--no-verify`.
- [ ] Update `docs/superpowers/PRICING-HANDOFF.md` "Do next" to mark P3 done and surface the new accepted behavior changes (walk 2-dog cap; duration clamps; finer check_in/training start grid) for the eventual prod-ship sign-off. Commit with the handoff doc only.
