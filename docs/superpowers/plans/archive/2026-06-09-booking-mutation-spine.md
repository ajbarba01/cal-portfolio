# Booking-Mutation Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared, actor-aware booking-mutation spine — a `MutationPolicy` threaded through the existing quote/gate pipeline, a new `editBookingCore`, and an EXDATE skip-set that makes series-occurrence edits safe — with no UI.

**Architecture:** Keep the existing "pure cores + DI repo + thin `"use server"` actions" structure. Add one `MutationPolicy` object that parameterizes every policy gate (enforce for clients, downgrade to a returned warning for admins). Add `editBookingCore` that re-quotes + re-derives approval + persists in place, reusing `computeBookingArtifacts`. Fix the series-roll cron's duplicate bug with a `booking_series.skipped_starts` column.

**Tech Stack:** TypeScript (strict), Vitest, Supabase (Postgres + service-role client), Zod.

**Spec:** [docs/superpowers/specs/2026-06-09-booking-mutation-spine-design.md](../specs/2026-06-09-booking-mutation-spine-design.md)

**Conventions for this repo:**

- Work on `main`, no worktree. Commit messages: **subject line only**, Conventional Commits, no body, no trailers, no internal identifiers (no "P1").
- Per-task verification gate = the **named test file(s) in that task**, not a full `vitest run` (integration tests need the local Supabase stack). Run a task's tests with `npx vitest run <path>`.
- `tsc --noEmit` runs as a pre-commit hook; keep the tree type-clean before each commit.

---

## File Structure

**Create:**

- `supabase/migrations/20260609120000_booking_series_skipped_starts.sql` — the EXDATE column.
- `src/features/booking/mutation-policy.ts` — `MutationPolicy` type + `CLIENT_POLICY` / `ADMIN_POLICY` presets.
- `src/features/booking/mutation-policy.test.ts` — preset invariants.
- `src/features/booking/edit-booking.test.ts` — `editBookingCore` unit tests.

**Modify:**

- `src/features/booking/booking-service.ts` — thread `MutationPolicy` + `warnings` through `computeBookingArtifacts` and `createBookingCore`; add `editBookingCore`.
- `src/features/booking/booking-repository.ts` — `skipped_starts` on `BookingSeriesRow` + schema + `getActiveSeries` select; add `getBookingForEdit`, `updateBookingEdited`, `swapBookingPets`, `appendSeriesSkip`.
- `src/features/booking/series-cron.ts` — `nextOccurrencesToMaterialize` excludes `skipped_starts`; call site passes it.
- `src/features/booking/series-cron.test.ts` — regression test for the refill duplicate + skip exclusion.
- `src/features/booking/actions.ts` — `editBooking` server action with verified actor→policy mapping; `rescheduleBooking` delegates to `editBookingCore`.
- `docs/DESIGN.md` — data-model note for `skipped_starts`; booking-state-machine note for in-place edit + re-derive-approval.

---

## Task 1: Migration — `booking_series.skipped_starts`

**Files:**

- Create: `supabase/migrations/20260609120000_booking_series_skipped_starts.sql`
- Modify: `docs/DESIGN.md`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260609120000_booking_series_skipped_starts.sql`:

```sql
-- EXDATE skip-set for series-occurrence edits.
-- When an occurrence is edited (time or pets), it detaches from its series
-- (series_id -> null) and its original cadence start is recorded here so the
-- series-roll cron never refills the vacated slot. Without this, moving or
-- detaching a future occurrence erases its (series_id, starts_at) claim and the
-- cron re-creates a duplicate at the original cadence time.
alter table booking_series
  add column skipped_starts timestamptz[] not null default '{}';

comment on column booking_series.skipped_starts is
  'Cadence start instants removed from the series (RFC 5545 EXDATE). The roll cron excludes these when materializing.';
```

- [ ] **Step 2: Apply to the local stack and verify**

Run: `npx supabase migration up`
Expected: applies cleanly; `\d booking_series` shows `skipped_starts | timestamptz[]`.
(If the local stack is not running: `npx supabase start` first.)

- [ ] **Step 3: Update DESIGN.md data model**

In `docs/DESIGN.md`, in the `booking_series` bullet under **Data model**, append after `quote_inputs (jsonb …)`:

```
· `skipped_starts` (timestamptz[] — RFC 5545 EXDATE; cadence starts removed by an occurrence edit so the roll cron never refills them)
```

Also update the `_Last reviewed_` footer date to `2026-06-09` with a short parenthetical noting the skipped_starts addition.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260609120000_booking_series_skipped_starts.sql docs/DESIGN.md
git commit -m "feat: add booking_series skipped_starts column"
```

---

## Task 2: `MutationPolicy` types + presets

**Files:**

- Create: `src/features/booking/mutation-policy.ts`
- Test: `src/features/booking/mutation-policy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/booking/mutation-policy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  CLIENT_POLICY,
  ADMIN_POLICY,
  type MutationPolicy,
} from "./mutation-policy";

const SKIP_KEYS: (keyof MutationPolicy)[] = [
  "skipDebtGate",
  "skipOnboardingGate",
  "skipDistanceRefuse",
  "skipWindowFit",
  "skipHoursLeadGuards",
  "skipCancellationCutoff",
  "skipHorizonRefuse",
];

describe("mutation policy presets", () => {
  it("CLIENT_POLICY enforces every gate (no skips)", () => {
    for (const k of SKIP_KEYS) expect(CLIENT_POLICY[k]).toBe(false);
    expect(CLIENT_POLICY.forceStatus).toBeUndefined();
  });

  it("ADMIN_POLICY skips every gate", () => {
    for (const k of SKIP_KEYS) expect(ADMIN_POLICY[k]).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/mutation-policy.test.ts`
Expected: FAIL — cannot find module `./mutation-policy`.

- [ ] **Step 3: Write the module**

Create `src/features/booking/mutation-policy.ts`:

```ts
/**
 * Actor-aware policy for booking mutations (create / edit / reschedule).
 *
 * Each `skip*` flag, when true, suppresses a policy gate in the shared
 * computeBookingArtifacts / guard pipeline. A suppressed gate that WOULD have
 * blocked instead contributes a human-readable string to the mutation's
 * returned `warnings` array (warn-don't-block). The single hard stop that no
 * policy can bypass is the Postgres same-class no-overlap exclusion constraint
 * (surfaced as `slot_taken`).
 *
 * The actor -> policy mapping lives ONLY in the action layer, derived from the
 * verified session role. A client can never submit ADMIN_POLICY.
 */

import type { BookingStatusDb } from "./booking-repository";

export interface MutationPolicy {
  /** Bypass the outstanding-debt block. */
  skipDebtGate: boolean;
  /** Bypass the onboarding / meet-greet gate. */
  skipOnboardingGate: boolean;
  /** Bypass the distance hard-cutoff refuse. */
  skipDistanceRefuse: boolean;
  /** Bypass availability-window containment. */
  skipWindowFit: boolean;
  /** Bypass hours-of-day + lead-time + hard-max-advance guards. */
  skipHoursLeadGuards: boolean;
  /** Bypass the client cancellation-cutoff edit gate (edit-only). */
  skipCancellationCutoff: boolean;
  /** Bypass the time-horizon hard-cap refuse. */
  skipHorizonRefuse: boolean;
  /**
   * When set, force the resulting booking status instead of the state machine's
   * derived status (admin force-confirm). Validated against the state machine by
   * the caller.
   */
  forceStatus?: BookingStatusDb;
}

/** Client self-service: every gate enforced. */
export const CLIENT_POLICY: MutationPolicy = {
  skipDebtGate: false,
  skipOnboardingGate: false,
  skipDistanceRefuse: false,
  skipWindowFit: false,
  skipHoursLeadGuards: false,
  skipCancellationCutoff: false,
  skipHorizonRefuse: false,
};

/** Admin on-behalf: every gate skipped (warn-don't-block). */
export const ADMIN_POLICY: MutationPolicy = {
  skipDebtGate: true,
  skipOnboardingGate: true,
  skipDistanceRefuse: true,
  skipWindowFit: true,
  skipHoursLeadGuards: true,
  skipCancellationCutoff: true,
  skipHorizonRefuse: true,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/booking/mutation-policy.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/mutation-policy.ts src/features/booking/mutation-policy.test.ts
git commit -m "feat: add booking mutation policy presets"
```

---

## Task 3: Series-roll cron excludes `skipped_starts`

The pure predicate `nextOccurrencesToMaterialize` currently excludes only already-materialized starts. It must also exclude the series' skipped cadence starts. This is the fix that prevents the duplicate.

**Files:**

- Modify: `src/features/booking/series-cron.ts`
- Test: `src/features/booking/series-cron.test.ts`

- [ ] **Step 1: Write the failing regression test**

Add to `src/features/booking/series-cron.test.ts` (import `nextOccurrencesToMaterialize` if not already imported):

```ts
import { nextOccurrencesToMaterialize } from "./series-cron";

describe("nextOccurrencesToMaterialize — skip-set", () => {
  const now = new Date("2026-06-10T00:00:00Z");
  const series = {
    templateStartsAt: new Date("2026-06-15T16:00:00Z"), // Mondays 16:00Z
    freq: "weekly" as const,
    interval: 1,
    openEnded: true,
  };

  it("reproduces the duplicate without a skip, then excludes the skipped slot", () => {
    // The Jun 22 occurrence was moved away (its row no longer sits on Jun 22),
    // so it is absent from existingStarts. Without a skip it gets refilled.
    const jun22 = new Date("2026-06-22T16:00:00Z").getTime();
    const withoutSkip = nextOccurrencesToMaterialize(series, [], now, 21, []);
    expect(withoutSkip.map((d) => d.getTime())).toContain(jun22);

    // Recording Jun 22 in the skip-set excludes it from materialization.
    const withSkip = nextOccurrencesToMaterialize(series, [], now, 21, [jun22]);
    expect(withSkip.map((d) => d.getTime())).not.toContain(jun22);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/series-cron.test.ts`
Expected: FAIL — `nextOccurrencesToMaterialize` expects 4 args, got 5 (TS) / the skip arg is ignored.

- [ ] **Step 3: Update the predicate signature + body**

In `src/features/booking/series-cron.ts`, change `nextOccurrencesToMaterialize`:

```ts
export function nextOccurrencesToMaterialize(
  series: SeriesRule,
  existingStarts: number[],
  now: Date,
  generationHorizonDays: number,
  skippedStarts: number[] = [],
): Date[] {
  const excluded = new Set([...existingStarts, ...skippedStarts]);
  const materializeUntil = new Date(
    now.getTime() + generationHorizonDays * MS_PER_DAY,
  );
  const all = expandOccurrences(
    series.templateStartsAt,
    {
      freq: series.freq,
      interval: series.interval,
      count: series.count,
      until: series.until,
    },
    { materializeUntil },
  );
  return all.filter(
    (d) => !excluded.has(d.getTime()) && d.getTime() > now.getTime(),
  );
}
```

- [ ] **Step 4: Pass the series' skip-set at the call site**

In `runSeriesRollCron`, where `nextOccurrencesToMaterialize` is called, add the skip arg. The skip values come from `s.skipped_starts` (added to the repo row in Task 4 — until then this references a field that does not yet exist; implement Task 4 in the same change OR temporarily pass `[]`). Final form:

```ts
const newStarts = nextOccurrencesToMaterialize(
  {
    templateStartsAt: new Date(s.template_starts_at),
    freq: s.freq,
    interval: s.step_interval,
    count: s.count ?? undefined,
    until: s.until ? new Date(s.until) : undefined,
    openEnded: s.open_ended,
  },
  existing,
  now,
  settings.recurrence_generation_horizon_days,
  s.skipped_starts.map((iso) => new Date(iso).getTime()),
);
```

> **Sequencing:** This line depends on `BookingSeriesRow.skipped_starts` (Task 4). Implement Task 4 before Step 4 here, or stage Step 3 (predicate) first and wire the call site in Task 4's commit. The predicate test (Step 1–3) passes independently of Task 4.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/features/booking/series-cron.test.ts`
Expected: PASS (existing tests + the new skip-set test).

- [ ] **Step 6: Commit**

```bash
git add src/features/booking/series-cron.ts src/features/booking/series-cron.test.ts
git commit -m "fix: exclude skipped series starts from materialization"
```

---

## Task 4: Repository — `skipped_starts` read + edit methods

**Files:**

- Modify: `src/features/booking/booking-repository.ts`

These are IO methods verified against the local stack (not unit tests); the `editBookingCore` tests in Task 6 exercise them via a mock repo.

- [ ] **Step 1: Add `skipped_starts` to the series row type + schema**

In `BookingSeriesRow` (after `quote_inputs: unknown;`):

```ts
  /** RFC 5545 EXDATE cadence starts (ISO UTC) removed by occurrence edits. */
  skipped_starts: string[];
```

In `bookingSeriesRowSchema` (after `quote_inputs: z.unknown(),`):

```ts
  skipped_starts: z.array(z.string()).default([]),
```

In `getActiveSeries`'s `.select(...)`, add `, skipped_starts` to the column list.

- [ ] **Step 2: Add the edit row type + repo interface methods**

Add a row shape near `BookingWithPayments`:

```ts
/** Full shape needed to edit a booking in place. */
export interface BookingEditRow {
  id: string;
  client_id: string;
  service_slug: string;
  status: BookingStatusDb;
  startsAt: Date;
  endsAt: Date;
  series_id: string | null;
  comments: string | null;
  /** Stored QuoteInput (jsonb) — source of current quantities for re-quote. */
  quote_inputs: unknown;
  /** Currently-assigned pet ids (from booking_pets). */
  petIds: string[];
  /** Sum of succeeded payment cents (0 or final_cents under prepay-full). */
  paidCents: number;
}

/** Fields an edit may update on the bookings row. */
export interface BookingEditUpdate {
  starts_at: string; // ISO UTC
  ends_at: string; // ISO UTC
  status: BookingStatusDb;
  quote_inputs: unknown;
  quote_breakdown: unknown;
  final_cents: number;
  requires_approval: boolean;
  comments: string | null;
  /** Set to null to detach from a series. */
  series_id: string | null;
}
```

Add to the `BookingRepository` interface:

```ts
  /** Load the full edit shape (service slug, times, quote, pets, paid total). */
  getBookingForEdit(id: string): Promise<BookingEditRow | null>;

  /** Update an edited booking's mutable fields in one UPDATE. Propagates 23P01. */
  updateBookingEdited(id: string, fields: BookingEditUpdate): Promise<void>;

  /** Replace a booking's pet assignment (delete all, then insert the given ids). */
  swapBookingPets(bookingId: string, petIds: string[]): Promise<void>;

  /** Append a cadence start (ISO UTC) to a series' skipped_starts. */
  appendSeriesSkip(seriesId: string, startIso: string): Promise<void>;
```

- [ ] **Step 3: Implement the methods in `createSupabaseBookingRepository`**

```ts
    async getBookingForEdit(id) {
      const { data, error } = await client
        .from("bookings")
        .select(
          "id, client_id, status, starts_at, ends_at, series_id, comments, " +
            "quote_inputs, services(slug), booking_pets(pet_id), " +
            "payments(status, amount_cents)",
        )
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to load booking for edit '${id}': ${error.message}`);
      }
      if (!data) return null;

      const row = data as {
        id: string;
        client_id: string;
        status: BookingStatusDb;
        starts_at: string;
        ends_at: string;
        series_id: string | null;
        comments: string | null;
        quote_inputs: unknown;
        services: { slug: string } | { slug: string }[] | null;
        booking_pets: { pet_id: string }[] | null;
        payments: { status: string; amount_cents: number }[] | null;
      };

      const service = Array.isArray(row.services) ? row.services[0] : row.services;
      if (!service) {
        throw new Error(`Booking '${id}' has no service`);
      }

      const paidCents = (row.payments ?? [])
        .filter((p) => p.status === "succeeded")
        .reduce((sum, p) => sum + p.amount_cents, 0);

      return {
        id: row.id,
        client_id: row.client_id,
        service_slug: service.slug,
        status: row.status,
        startsAt: new Date(row.starts_at),
        endsAt: new Date(row.ends_at),
        series_id: row.series_id,
        comments: row.comments,
        quote_inputs: row.quote_inputs,
        petIds: (row.booking_pets ?? []).map((bp) => bp.pet_id),
        paidCents,
      };
    },

    async updateBookingEdited(id, fields) {
      const { error } = await client
        .from("bookings")
        .update({
          starts_at: fields.starts_at,
          ends_at: fields.ends_at,
          status: fields.status,
          quote_inputs: fields.quote_inputs,
          quote_breakdown: fields.quote_breakdown,
          final_cents: fields.final_cents,
          requires_approval: fields.requires_approval,
          comments: fields.comments,
          series_id: fields.series_id,
        })
        .eq("id", id);

      if (error) {
        const err = new Error(
          `Failed to update edited booking '${id}': ${error.message}`,
        ) as Error & { code?: string };
        if (error.code) err.code = error.code;
        throw err;
      }
    },

    async swapBookingPets(bookingId, petIds) {
      const { error: delError } = await client
        .from("booking_pets")
        .delete()
        .eq("booking_id", bookingId);
      if (delError) {
        throw new Error(
          `Failed to clear booking_pets for '${bookingId}': ${delError.message}`,
        );
      }
      if (petIds.length === 0) return;
      const rows = petIds.map((pet_id) => ({ booking_id: bookingId, pet_id }));
      const { error: insError } = await client.from("booking_pets").insert(rows);
      if (insError) {
        throw new Error(
          `Failed to set booking_pets for '${bookingId}': ${insError.message}`,
        );
      }
    },

    async appendSeriesSkip(seriesId, startIso) {
      // Read-modify-write the array under the service role (single writer).
      const { data, error } = await client
        .from("booking_series")
        .select("skipped_starts")
        .eq("id", seriesId)
        .single();
      if (error) {
        throw new Error(`Failed to load series '${seriesId}': ${error.message}`);
      }
      const current = (data?.skipped_starts as string[] | null) ?? [];
      const next = current.includes(startIso) ? current : [...current, startIso];
      const { error: upError } = await client
        .from("booking_series")
        .update({ skipped_starts: next })
        .eq("id", seriesId);
      if (upError) {
        throw new Error(
          `Failed to append series skip for '${seriesId}': ${upError.message}`,
        );
      }
    },
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (the Task 3 Step 4 call site now resolves `s.skipped_starts`).

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/booking-repository.ts src/features/booking/series-cron.ts
git commit -m "feat: add booking edit + series-skip repository methods"
```

---

## Task 5: Thread `MutationPolicy` + warnings through `computeBookingArtifacts`

Convert the hard gate returns (`blocked_debt`, `onboarding_incomplete`, distance `refuse`, horizon `refuse`) into policy-driven outcomes: block under a client policy, warn under an admin policy. Add a `warnings: string[]` to the success artifacts. Keep `createBookingCore` behavior identical by passing `CLIENT_POLICY`.

**Files:**

- Modify: `src/features/booking/booking-service.ts`
- Test: `src/features/booking/booking-service.test.ts`

- [ ] **Step 1: Write failing tests for policy behavior**

Add to `src/features/booking/booking-service.test.ts` (reuse the file's existing repo-mock helpers; if the helper builds a repo with a debtor, set `getOutstandingDebtCents` to return > 0). Add:

```ts
import { ADMIN_POLICY, CLIENT_POLICY } from "./mutation-policy";

describe("computeBookingArtifacts — policy gates", () => {
  it("blocks a debtor under CLIENT_POLICY", async () => {
    const repo = makeRepo({ outstandingDebtCents: 4000 }); // existing helper option
    const result = await computeBookingQuoteCore(
      { repo, now: NOW },
      { ...validInput, policy: CLIENT_POLICY },
    );
    expect(result.kind).toBe("blocked_debt");
  });

  it("warns (not blocks) a debtor under ADMIN_POLICY", async () => {
    const repo = makeRepo({ outstandingDebtCents: 4000 });
    const result = await computeBookingQuoteCore(
      { repo, now: NOW },
      { ...validInput, policy: ADMIN_POLICY },
    );
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.preview.warnings.join(" ")).toMatch(/owes/i);
    }
  });
});
```

> If the existing `makeRepo` helper has no `outstandingDebtCents` option, extend it: add the option and make `getOutstandingDebtCents` return it (default 0). Keep all existing tests green — they omit the option and get 0.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/booking/booking-service.test.ts`
Expected: FAIL — `policy` is not a known input field / `warnings` missing.

- [ ] **Step 3: Add `policy` to the input + `warnings` to artifacts**

In `booking-service.ts`:

1. Import the policy: `import type { MutationPolicy } from "./mutation-policy";` and `import { CLIENT_POLICY } from "./mutation-policy";`.

2. Add an optional `policy` to `CreateBookingInput` consumption. Rather than widen the Zod schema (which validates the client payload), accept policy as a **separate parameter** on the artifact/preview/create functions. Change `computeBookingArtifacts`, `computeBookingQuoteCore`, and `createBookingCore` to take `policy` via the raw input object as a non-validated field:

Add to `BookingQuoteArtifacts`:

```ts
  /** Human-readable warnings for admin-skipped gates (empty under client policy). */
  warnings: string[];
```

Add to `BookingQuotePreview`:

```ts
  /** Warnings for admin-skipped gates (empty under client policy). */
  warnings: string[];
```

3. Give `computeBookingArtifacts` a `policy` param. Signature becomes:

```ts
async function computeBookingArtifacts(
  deps: BookingServiceDeps,
  rawInput: CreateBookingInput,
  policy: MutationPolicy,
): Promise<ArtifactsResult> {
```

4. Initialize `const warnings: string[] = [];` near the top (after `const { repo } = deps;`).

5. **Debt gate** — replace the early return with policy logic:

```ts
const outstandingDebtCents = await repo.getOutstandingDebtCents(input.userId);
if (outstandingDebtCents > 0) {
  if (policy.skipDebtGate) {
    warnings.push(`Client owes $${(outstandingDebtCents / 100).toFixed(2)}.`);
  } else {
    return { kind: "blocked_debt", owedCents: outstandingDebtCents };
  }
}
```

6. **Onboarding gate** — wrap the existing block:

```ts
const onboardingStatus = await repo.getOnboardingStatus(input.userId);
if (onboardingStatus !== "approved") {
  const isMeetGreet = input.serviceSlug === MEET_GREET_SLUG;
  const meetGreetAllowed =
    onboardingStatus === "meet_greet_pending" &&
    isMeetGreet &&
    !(await repo.hasActiveBookingForServiceSlug(input.userId, MEET_GREET_SLUG));
  if (!meetGreetAllowed) {
    if (policy.skipOnboardingGate) {
      warnings.push(`Client onboarding status is '${onboardingStatus}'.`);
    } else {
      return { kind: "onboarding_incomplete" };
    }
  }
}
```

7. **Distance refuse** — in the `decision === "refuse"` branch:

```ts
if (decision === "refuse") {
  if (policy.skipDistanceRefuse) {
    warnings.push(
      `Client is ${distanceMiles.toFixed(1)} mi away (beyond the ${settings.hard_cutoff_miles} mi cutoff).`,
    );
  } else {
    return {
      kind: "refuse",
      reason: `Client location is too far (${distanceMiles.toFixed(1)} mi). Hard cutoff is ${settings.hard_cutoff_miles} mi.`,
    };
  }
}
```

8. **Time-horizon refuse** — in the per-occurrence loop's `timeDecision === "refuse"` branch:

```ts
if (timeDecision === "refuse") {
  if (policy.skipHorizonRefuse) {
    warnings.push(
      `Occurrence ${occStart.toISOString()} is beyond the ${settings.hard_max_advance_days}-day limit.`,
    );
  } else {
    return {
      kind: "refuse",
      reason: `Requested start ${occStart.toISOString()} is beyond the ${settings.hard_max_advance_days}-day booking limit.`,
    };
  }
}
```

9. Add `warnings` to the returned artifacts object (`kind: "success"` branch).

10. `computeBookingQuoteCore` gains a `policy` param and projects `warnings` into the preview. Its signature:

```ts
export async function computeBookingQuoteCore(
  deps: BookingServiceDeps,
  rawInput: CreateBookingInput,
  policy: MutationPolicy = CLIENT_POLICY,
): Promise<PreviewResult> {
  const result = await computeBookingArtifacts(deps, rawInput, policy);
  if (result.kind !== "success") return result;
  const { breakdown, distanceMiles, requiresApproval, decision, warnings } =
    result.artifacts;
  return {
    kind: "success",
    preview: {
      breakdown,
      finalCents: breakdown.finalCents,
      distanceMiles,
      requiresApproval,
      decision,
      warnings,
    },
  };
}
```

11. `createBookingCore` calls `computeBookingArtifacts(deps, rawInput, CLIENT_POLICY)`. (Create stays client-gated; admin-on-behalf create is P3 and will pass its own policy through a future param — out of scope here. Keep the default explicit.)

> Note on test call sites: the new tests pass `policy` on the input object spread; since `computeBookingQuoteCore` now takes policy as a 3rd arg, update the new tests to call `computeBookingQuoteCore({ repo, now: NOW }, validInput, CLIENT_POLICY)` / `ADMIN_POLICY`. Adjust the Step 1 snippet accordingly (pass policy as the third argument, not a field on the input).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/booking/booking-service.test.ts`
Expected: PASS — existing tests green (default CLIENT_POLICY preserves behavior); new policy tests green.

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/booking-service.ts src/features/booking/booking-service.test.ts
git commit -m "feat: make booking quote pipeline policy-aware"
```

---

## Task 6: `editBookingCore`

The new core. Loads a booking, enforces status + paid-lock, re-quotes via `computeBookingArtifacts`, re-derives approval, validates the (possibly moved) slot under policy, detaches from any series with a skip, and persists.

**Files:**

- Modify: `src/features/booking/booking-service.ts`
- Test: `src/features/booking/edit-booking.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/features/booking/edit-booking.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { editBookingCore } from "./booking-service";
import { CLIENT_POLICY, ADMIN_POLICY } from "./mutation-policy";
import type { BookingRepository, BookingEditRow } from "./booking-repository";

const NOW = new Date("2026-06-10T12:00:00Z");
const USER = "user-1";
const BOOKING = "bk-1";

// A confirmed, unpaid, standalone check_in booking inside an open window.
function baseRow(over: Partial<BookingEditRow> = {}): BookingEditRow {
  return {
    id: BOOKING,
    client_id: USER,
    service_slug: "check-in",
    status: "confirmed",
    startsAt: new Date("2026-06-20T16:00:00Z"),
    endsAt: new Date("2026-06-20T17:00:00Z"),
    series_id: null,
    comments: null,
    quote_inputs: { pricingType: "check_in", hours: 1 },
    petIds: [],
    paidCents: 0,
    ...over,
  };
}

function makeRepo(
  row: BookingEditRow | null,
  over: Partial<Record<string, unknown>> = {},
) {
  const updateBookingEdited = vi.fn(async () => {});
  const swapBookingPets = vi.fn(async () => {});
  const appendSeriesSkip = vi.fn(async () => {});
  return {
    getBookingForEdit: vi.fn(async () => row),
    getServiceBySlug: vi.fn(async () => ({
      id: "svc-checkin",
      slug: "check-in",
      pricing_type: "check_in",
      pricing_config: { hourlyRateCents: 3000, minimumCents: 1500 },
      concurrency: "exclusive",
      requires_approval: false,
    })),
    getSettings: vi.fn(async () => SETTINGS),
    getProfileLatLng: vi.fn(async () => ({ lat: 40.0, lng: -105.27 })),
    getOutstandingDebtCents: vi.fn(async () => 0),
    getOnboardingStatus: vi.fn(async () => "approved"),
    hasActiveBookingForServiceSlug: vi.fn(async () => false),
    getOpenWindows: vi.fn(async () => [
      {
        startsAt: new Date("2026-06-20T15:00:00Z"),
        endsAt: new Date("2026-06-20T20:00:00Z"),
      },
    ]),
    updateBookingEdited,
    swapBookingPets,
    appendSeriesSkip,
    ...over,
  } as unknown as BookingRepository & {
    updateBookingEdited: typeof updateBookingEdited;
    swapBookingPets: typeof swapBookingPets;
    appendSeriesSkip: typeof appendSeriesSkip;
  };
}

// Settings permissive enough that guards pass for the times above.
const SETTINGS = {
  origin_lat: 40.0,
  origin_lng: -105.27,
  road_factor: 1.3,
  avg_speed_mph: 30,
  auto_approve_threshold_miles: 8,
  hard_cutoff_miles: 50,
  gate_use_road_miles: false,
  booking_open_minute: 0,
  booking_close_minute: 1440,
  min_lead_time_hours: 0,
  auto_confirm_horizon_days: 30,
  hard_max_advance_days: 365,
  recurrence_generation_horizon_days: 42,
  recurring_discount_pct: 10,
  recurring_min_occurrences: 3,
  cancellation_full_refund_hours: 48,
  late_cancel_refund_pct: 50,
  no_show_charge_pct: 100,
};

describe("editBookingCore", () => {
  it("rejects a price-affecting edit on a PAID booking", async () => {
    const repo = makeRepo(baseRow({ paidCents: 1500 }));
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { quantities: { hours: 2 } },
      },
    );
    expect(result.kind).toBe("price_locked");
  });

  it("allows a time move on a PAID booking (price preserved)", async () => {
    const repo = makeRepo(baseRow({ paidCents: 1500 }));
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: {
          startsAt: new Date("2026-06-20T18:00:00Z"),
          endsAt: new Date("2026-06-20T19:00:00Z"),
        },
      },
    );
    expect(result.kind).toBe("success");
    expect(repo.updateBookingEdited).toHaveBeenCalled();
  });

  it("forbids editing someone else's booking under client policy", async () => {
    const repo = makeRepo(baseRow({ client_id: "other" }));
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("forbidden");
  });

  it("rejects editing a terminal booking", async () => {
    const repo = makeRepo(baseRow({ status: "cancelled" }));
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("invalid_status");
  });

  it("blocks a client edit inside the cancellation cutoff", async () => {
    // Booking starts 24h out; cutoff is 48h → inside cutoff → blocked for client.
    const repo = makeRepo(
      baseRow({
        startsAt: new Date("2026-06-11T12:00:00Z"),
        endsAt: new Date("2026-06-11T13:00:00Z"),
      }),
    );
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("unavailable");
  });

  it("admin overrides the cancellation cutoff (warns, succeeds)", async () => {
    const repo = makeRepo(
      baseRow({
        startsAt: new Date("2026-06-11T12:00:00Z"),
        endsAt: new Date("2026-06-11T13:00:00Z"),
      }),
    );
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: "admin",
        policy: ADMIN_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("success");
  });

  it("detaches a series occurrence and records the skip", async () => {
    const repo = makeRepo(baseRow({ series_id: "series-1" }));
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { comments: "edited" },
      },
    );
    expect(result.kind).toBe("success");
    expect(repo.appendSeriesSkip).toHaveBeenCalledWith(
      "series-1",
      baseRow().startsAt.toISOString(),
    );
    // The persisted update detaches the row.
    const call = repo.updateBookingEdited.mock.calls[0][1];
    expect(call.series_id).toBeNull();
  });

  it("maps a 23P01 update conflict to slot_taken", async () => {
    const conflict = Object.assign(new Error("overlap"), { code: "23P01" });
    const repo = makeRepo(baseRow(), {
      updateBookingEdited: vi.fn(async () => {
        throw conflict;
      }),
    });
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: {
          startsAt: new Date("2026-06-20T18:00:00Z"),
          endsAt: new Date("2026-06-20T19:00:00Z"),
        },
      },
    );
    expect(result.kind).toBe("slot_taken");
  });

  it("returns not_found for a missing booking", async () => {
    const repo = makeRepo(null);
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("not_found");
  });
});
```

> The mock repo must expose every method `computeBookingArtifacts` calls (`getServiceBySlug`, `getSettings`, `getProfileLatLng`, `getOutstandingDebtCents`, `getOnboardingStatus`, `hasActiveBookingForServiceSlug`) plus the edit methods. `getPetsByIds` is only hit when `petIds` are patched on a pet-aware service — not exercised here; add it returning `[]` if a pet-patch test is added.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/booking/edit-booking.test.ts`
Expected: FAIL — `editBookingCore` not exported.

- [ ] **Step 3: Implement `editBookingCore`**

Add to `booking-service.ts` (after `rescheduleBookingCore`). Add `import type { MutationPolicy } from "./mutation-policy";` (already imported in Task 5) and `import { CLIENT_POLICY } from "./mutation-policy";` if needed.

```ts
// ──────────────────────────────────────────────────────────────────────────────
// editBookingCore — in-place edit (time / pets / quantities / comments)
// ──────────────────────────────────────────────────────────────────────────────

export type EditBookingResult =
  | { kind: "success"; warnings: string[] }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "invalid_status" }
  | { kind: "price_locked" }
  | { kind: "blocked_debt"; owedCents: number }
  | { kind: "onboarding_incomplete" }
  | { kind: "refuse"; reason: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "slot_taken" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

export interface EditBookingPatch {
  startsAt?: Date;
  endsAt?: Date;
  petIds?: string[];
  quantities?: Record<string, unknown>;
  comments?: string;
}

export interface EditBookingInput {
  bookingId: string;
  /** Verified session id. Ownership enforced unless the policy skips it (admin). */
  actorUserId: string;
  policy: MutationPolicy;
  patch: EditBookingPatch;
}

/** Statuses a booking may be edited from (terminal/completed rejected). */
const EDITABLE_STATUSES: BookingStatusDb[] = ["pending_approval", "confirmed"];

/** Extract the raw quantity record from a stored QuoteInput jsonb. */
function quantitiesFromQuoteInputs(qi: unknown): Record<string, unknown> {
  const q = (qi ?? {}) as Record<string, unknown>;
  const keys = [
    "dogs",
    "cats",
    "nights",
    "hours",
    "cantBeLeftAloneDays",
    "walkMinutesPerDay",
    "holidayDays",
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) if (q[k] !== undefined) out[k] = q[k];
  return out;
}

export async function editBookingCore(
  deps: BookingServiceDeps,
  input: EditBookingInput,
): Promise<EditBookingResult> {
  const { repo, now } = deps;
  const { policy, patch } = input;

  const booking = await repo.getBookingForEdit(input.bookingId);
  if (!booking) return { kind: "not_found" };
  if (!policy.skipDebtGate && false) {
    // placeholder to keep policy import live; real ownership check below
  }

  // Ownership — enforced unless an admin policy (any skip implies admin context;
  // use a dedicated check: ownership is bypassed only for admins, signalled here
  // by skipCancellationCutoff which only ADMIN_POLICY sets among edit-only gates).
  const isAdminActor = policy.skipOnboardingGate; // ADMIN_POLICY sets this; CLIENT does not
  if (!isAdminActor && booking.client_id !== input.actorUserId) {
    return { kind: "forbidden" };
  }

  if (!EDITABLE_STATUSES.includes(booking.status)) {
    return { kind: "invalid_status" };
  }

  // Paid-lock: a price-affecting patch (pets/quantities) is rejected once paid.
  const priceAffecting =
    patch.petIds !== undefined || patch.quantities !== undefined;
  if (booking.paidCents > 0 && priceAffecting) {
    return { kind: "price_locked" };
  }

  // Client cancellation-cutoff gate (uses the CURRENT start).
  if (!policy.skipCancellationCutoff) {
    const settings = await repo.getSettings();
    const cutoffMs =
      booking.startsAt.getTime() -
      settings.cancellation_full_refund_hours * 60 * 60 * 1000;
    if (now.getTime() > cutoffMs) {
      return {
        kind: "unavailable",
        reason:
          "This booking is inside the cancellation window and can no longer be changed online.",
      };
    }
  }

  // Build the merged shape and re-quote via the shared pipeline.
  const startsAt = patch.startsAt ?? booking.startsAt;
  const durationMs = booking.endsAt.getTime() - booking.startsAt.getTime();
  const endsAt = patch.endsAt ?? new Date(startsAt.getTime() + durationMs);

  const mergedInput: CreateBookingInput = {
    userId: booking.client_id,
    serviceSlug: booking.service_slug,
    startsAt,
    endsAt,
    quantities: {
      ...quantitiesFromQuoteInputs(booking.quote_inputs),
      ...(patch.quantities ?? {}),
    },
    petIds: patch.petIds ?? booking.petIds,
    recurringRule: null, // edits never re-create a series
  };

  const artifacts = await computeBookingArtifacts(deps, mergedInput, policy);
  if (artifacts.kind === "validation_error")
    return { kind: "validation_error", message: artifacts.message };
  if (artifacts.kind === "error")
    return { kind: "error", message: artifacts.message };
  if (artifacts.kind === "refuse")
    return { kind: "refuse", reason: artifacts.reason };
  if (artifacts.kind === "blocked_debt")
    return { kind: "blocked_debt", owedCents: artifacts.owedCents };
  if (artifacts.kind === "onboarding_incomplete")
    return { kind: "onboarding_incomplete" };

  const warnings = [...artifacts.artifacts.warnings];
  const {
    settings: s,
    quoteInput,
    breakdown,
    requiresApprovalByOccurrence,
  } = artifacts.artifacts;

  // Slot validation (hours/lead/horizon + window-fit), policy-aware.
  const ruleSettings: BookingRuleSettings = {
    bookingOpenMinute: s.booking_open_minute,
    bookingCloseMinute: s.booking_close_minute,
    minLeadTimeHours: s.min_lead_time_hours,
    hardMaxAdvanceDays: s.hard_max_advance_days,
  };
  if (!policy.skipHoursLeadGuards) {
    if (!passesGuards({ startsAt, endsAt }, ruleSettings, now)) {
      return {
        kind: "unavailable",
        reason:
          "The selected time does not meet booking rules (hours, lead time, or max advance).",
      };
    }
  } else if (!passesGuards({ startsAt, endsAt }, ruleSettings, now)) {
    warnings.push(
      "Selected time is outside normal booking rules (hours / lead time).",
    );
  }

  if (!policy.skipWindowFit) {
    const openWindows = await repo.getOpenWindows(now);
    if (!fitsWindow({ startsAt, endsAt }, openWindows)) {
      return {
        kind: "unavailable",
        reason: "The selected time is not within an open availability window.",
      };
    }
  } else {
    const openWindows = await repo.getOpenWindows(now);
    if (!fitsWindow({ startsAt, endsAt }, openWindows)) {
      warnings.push(
        "Selected time is outside any published availability window.",
      );
    }
  }

  // Re-derive status (per-occurrence array has exactly one element for an edit).
  const requiresApproval = requiresApprovalByOccurrence[0];
  let status: BookingStatusDb;
  if (policy.forceStatus) {
    status = policy.forceStatus;
  } else {
    const stat = transition("draft", "submit", { requiresApproval });
    if ("error" in stat) return { kind: "error", message: stat.error };
    status = stat.state;
  }

  // Detach from a series (records the skip on the parent), if linked.
  let seriesId: string | null = booking.series_id;
  if (booking.series_id) {
    await repo.appendSeriesSkip(
      booking.series_id,
      booking.startsAt.toISOString(),
    );
    seriesId = null;
  }

  // Persist. booking_pets swap only when pets were patched.
  try {
    await repo.updateBookingEdited(input.bookingId, {
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status,
      quote_inputs: quoteInput as unknown,
      quote_breakdown: breakdown as unknown,
      final_cents: breakdown.finalCents,
      requires_approval: requiresApproval,
      comments: patch.comments ?? booking.comments,
      series_id: seriesId,
    });
    if (patch.petIds !== undefined) {
      await repo.swapBookingPets(input.bookingId, patch.petIds);
    }
    return { kind: "success", warnings };
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "23P01")
      return { kind: "slot_taken" };
    return {
      kind: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
```

> **Design note for the implementer:** the `isAdminActor` derivation keys off `policy.skipOnboardingGate` (true only in `ADMIN_POLICY`). If a future policy needs admin context without skipping onboarding, replace this with an explicit `policy.bypassOwnership` flag. For P1 the preset coupling is sufficient and tested.
>
> The `s` (settings) used for slot validation comes from the artifacts bundle, so there is no second `getSettings` round-trip beyond the cutoff check; acceptable. If desired, hoist the cutoff `getSettings` to reuse `artifacts.artifacts.settings` — but the cutoff check runs _before_ artifacts are computed, so a small extra read is fine.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/booking/edit-booking.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/features/booking/booking-service.ts src/features/booking/edit-booking.test.ts
git commit -m "feat: add editBookingCore in-place booking edit"
```

---

## Task 7: Action layer — `editBooking` + reschedule delegation

Expose `editBookingCore` via a `"use server"` action, mapping the verified session role to a policy. Re-point `rescheduleBooking` at `editBookingCore` (time-only patch) so the series-skip fix lives in one place.

**Files:**

- Modify: `src/features/booking/actions.ts`

- [ ] **Step 1: Add the `editBooking` action**

In `actions.ts`, import the core + presets:

```ts
import { editBookingCore } from "./booking-service";
import { CLIENT_POLICY, ADMIN_POLICY } from "./mutation-policy";
import type { EditBookingPatch, EditBookingResult } from "./booking-service";
```

Add the action:

```ts
/**
 * Server action: edit a booking in place. The actor's role is resolved from the
 * verified session (service-role read of profiles.role) and mapped to a policy —
 * NEVER taken from the payload. Admins get ADMIN_POLICY (overrides, warn-don't-
 * block) and may edit any client's booking; clients get CLIENT_POLICY and may
 * edit only their own.
 */
export async function editBooking(input: {
  bookingId: string;
  patch: EditBookingPatch;
}): Promise<EditBookingResult> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) redirect("/login");

  const serviceClient = createServiceClient();
  const repo = createSupabaseBookingRepository(serviceClient);

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const policy = profile?.role === "admin" ? ADMIN_POLICY : CLIENT_POLICY;

  return editBookingCore(
    { repo, now: new Date() },
    {
      bookingId: input.bookingId,
      actorUserId: user.id,
      policy,
      patch: input.patch,
    },
  );
}
```

> Patch dates cross the server-action boundary as `Date` (Next serializes them). If a caller sends ISO strings, coerce here with `new Date(...)` before constructing the patch. P1 has no caller; document the `Date` contract in the action's JSDoc.

- [ ] **Step 2: Delegate `rescheduleBooking` to `editBookingCore`**

Replace the body of `rescheduleBooking` so it builds a time-only patch and routes through the same policy mapping. Keep its existing return type compatible by mapping the edit result to the reschedule result shape, OR (simpler) change `rescheduleBooking` to return `EditBookingResult` and update the onboarding consumer. **Check the onboarding consumer first:**

Run: `npx vitest run src/features/accounts` and grep for `rescheduleBooking(` usage in `src/`. If the only consumer is the onboarding meet-greet scheduler and it switches on `result.kind === "success"`, the `EditBookingResult` union is compatible (it also uses `kind: "success"`). Then:

```ts
export async function rescheduleBooking(input: {
  bookingId: string;
  startsAt: Date;
}): Promise<EditBookingResult> {
  return editBooking({
    bookingId: input.bookingId,
    patch: { startsAt: input.startsAt }, // duration preserved by editBookingCore
  });
}
```

If the consumer depends on the old `RescheduleBookingResult` member names, instead keep `rescheduleBookingCore` as-is for now and only ADD `editBooking`; note the delegation as a follow-up. (Decide based on what the grep shows; do not break the onboarding flow.)

- [ ] **Step 3: Verify the onboarding flow still type-checks + tests pass**

Run: `npx tsc --noEmit`
Run: `npx vitest run src/features/accounts src/features/booking/reschedule-booking.test.ts`
Expected: clean + green. (`rescheduleBookingCore`'s own unit tests remain valid whether or not the action delegates.)

- [ ] **Step 4: Commit**

```bash
git add src/features/booking/actions.ts
git commit -m "feat: add editBooking action with actor policy mapping"
```

---

## Task 8: DESIGN.md — booking-state-machine note

**Files:**

- Modify: `docs/DESIGN.md`

- [ ] **Step 1: Add the in-place-edit note**

In `docs/DESIGN.md`, under **Booking state machine**, add a bullet after the cancellation/refund material:

```
- **In-place edit (mutation spine).** A non-terminal booking may be edited in place (time / pets / quantities / comments) via `editBookingCore`, parameterized by a `MutationPolicy` (client = all gates enforced; admin = warn-don't-block override). Editing re-quotes (unpaid only — a paid booking locks price-affecting fields) and **re-derives approval**, so a `confirmed` booking can return to `pending_approval`. Editing a series occurrence detaches it (`series_id → null`) and records its cadence start in `booking_series.skipped_starts` so the roll cron never refills the slot. Service-swap is not an edit (cancel + rebook).
```

Update the `_Last reviewed_` footer date/parenthetical.

- [ ] **Step 2: Commit**

```bash
git add docs/DESIGN.md
git commit -m "docs: note in-place booking edit in state machine"
```

---

## Self-Review

**Spec coverage:**

- D1 editable dims → Task 6 patch shape (time/pets/quantities/comments); service-swap excluded by construction (no service field in patch). ✓
- D2 paid-lock + re-quote + no-Stripe → Task 6 `price_locked` + re-quote via artifacts; no payment writes anywhere. ✓
- D3 re-derive approval → Task 6 status derivation + `forceStatus`. ✓
- D4 client full parity + gates → Task 6 client tests (cutoff/ownership/status). ✓
- D5 admin override + warnings → Task 5 (pipeline warnings) + Task 6 (guard/cutoff warnings) + Task 7 (policy mapping). ✓
- D6 EXDATE skip-set + detach → Task 1 (column), Task 3 (predicate), Task 4 (`appendSeriesSkip` + row read), Task 6 (detach on edit). ✓
- Repo additions → Task 4. ✓ Result model → Task 6 union (matches spec). ✓ Tests → each task. ✓

**Placeholder scan:** No TBD/TODO; the two "decide based on grep" notes (Task 7 delegation, makeRepo debtor option) are explicit conditional instructions with both branches specified, not deferrals. ✓

**Type consistency:** `MutationPolicy` keys match across Tasks 2/5/6/7; `EditBookingResult` / `BookingEditRow` / `BookingEditUpdate` names are stable; `nextOccurrencesToMaterialize`'s new 5th param defaults to `[]` so the existing 4-arg call in tests still compiles. ✓

**Known soft spots flagged for the implementer:** (a) `isAdminActor` keys off `skipOnboardingGate` — documented, swap to an explicit flag if policies diverge; (b) duration/quantity coherence for hourly edits is the consumer's responsibility (P2/P3) — the core trusts the `(startsAt, endsAt, quantities)` triple.

---

_Last reviewed: 2026-06-09_
