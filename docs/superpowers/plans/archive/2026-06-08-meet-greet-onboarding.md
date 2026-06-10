# Meet & Greet Onboarding Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert a required, free, in-person meet-and-greet between intro-form completion and full booking access, gated by a Cal-controlled per-client approval.

**Architecture:** Replace the binary `profiles.onboarding_complete` with a 4-state `onboarding_status` enum (`info_pending → meet_greet_pending → approved`, plus `declined`). Model the meet-and-greet as a real `services` row (`pricing_type = 'meet_greet'`, always $0) so it reuses the Scheduler/calendar/window/distance machinery. The authoritative gate lives in `createBookingCore`: a `meet_greet_pending` client may book only the `meet-greet` service. Cal flips the client status from the existing admin clients views.

**Tech Stack:** Next.js (App Router) + TypeScript strict · Supabase (Postgres enum + RLS) · Vitest · Zod. Spec: `docs/superpowers/specs/2026-06-08-meet-greet-onboarding-design.md`.

**Communication / process notes for the implementer:**

- Repo policy: work on `main`, no worktree unless asked, commit messages are **subject-line only** (Conventional Commits, no body/trailer/footer), no project-internal identifiers in the subject.
- **UI gate (Alex's standing rule):** before writing or altering ANY UI (Tasks 16–18), invoke the `frontend-design` skill first, and honor the mobile-parity standard (mobile as intentional as desktop). Mockups already exist under `.superpowers/brainstorm/` (flow, wizard, admin) — use them as the visual reference.
- Run the full test file after each implementation step. The repo uses Vitest: `npx vitest run <path>`.
- Doc discipline: the DESIGN.md update (Task 19) ships in the same commit set as the code it documents.

---

## File Structure

**Migrations (new):**

- `supabase/migrations/<ts>_onboarding_status_and_meet_greet_enum.sql` — new `onboarding_status` enum + column + backfill, `handle_new_user` update, RLS column-grant swap, drop `onboarding_complete`, `ALTER TYPE pricing_type ADD VALUE 'meet_greet'`.
- `supabase/migrations/<ts2>_seed_meet_greet_service.sql` — **separate file** (a new enum value cannot be used in the same transaction it is added in) seeding the `meet-greet` service row.

**Pricing (modify):**

- `src/features/pricing/types.ts` — add `meet_greet` to `PricingType`, `MeetGreetConfig`, `MeetGreetQuantities`, `QuoteInput` variant.
- `src/features/pricing/config-schemas.ts` — empty config schema + dispatch case.
- `src/features/pricing/quote.ts` — `quoteMeetGreet()` returns `$0`.
- `src/features/pricing/display.ts` — `headlineRate` case ("Free").
- `src/features/booking/service-card-display.ts` — two switch cases.

**Booking core (modify):**

- `src/features/booking/booking-repository.ts` — `serviceRowSchema` enum, `OnboardingStatus` type, `getOnboardingStatus`, `hasActiveBookingForServiceSlug` repo methods.
- `src/features/booking/booking-service.ts` — gate in `computeBookingArtifacts`, new result kind `onboarding_incomplete`, `parseQuantities` + `buildQuoteInput` meet_greet cases.
- `src/features/booking/actions.ts` — surface `onboarding_incomplete`.

**Accounts / gate (modify):**

- `src/features/accounts/onboarding-action.ts` — advance to `meet_greet_pending`, not `approved`.
- `src/features/accounts/account-actions.ts` — swap any `onboarding_complete` read.
- `src/lib/supabase/proxy.ts` — gate reads `onboarding_status = 'approved'`.
- `src/app/(marketing)/book/[serviceSlug]/page.tsx` — `AuthState` extended.

**Admin (modify):**

- `src/features/admin/clients-actions.ts` — `onboarding_status` in list/detail views + `setOnboardingStatusCore`.

**UI (modify — frontend-design gated):**

- `src/app/(account)/onboarding/page.tsx` — stateful wizard.
- `src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx` — needs-meet-greet panel.
- `src/app/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx` — Onboarding card.
- `src/app/(admin)/admin/clients/_components/clients-index-client.tsx` — status badge column.

**Docs (modify):** `docs/DESIGN.md`.

---

## Phase 1 — Database

### Task 1: Migration — onboarding_status enum, column, backfill, gate, drop, pricing enum value

**Files:**

- Create: `supabase/migrations/<ts>_onboarding_status_and_meet_greet_enum.sql` (use a timestamp later than the latest existing migration, format `YYYYMMDDHHMMSS`)

- [ ] **Step 1: Find the existing profiles column-grant / RLS so the swap mirrors it**

Run: `rg -n "onboarding_complete" supabase/migrations`
Expected: hits in `20260529205116_init_schema.sql` (table + `handle_new_user`) and a later RLS/grant migration that whitelists self-editable vs system-only profile columns. Note the exact `revoke/grant update (...)` or policy statement that lists `onboarding_complete` among the **system-only** columns — Step 2 mirrors it for `onboarding_status`.

- [ ] **Step 2: Write the migration**

```sql
-- New onboarding lifecycle enum (replaces the onboarding_complete boolean).
create type onboarding_status as enum (
  'info_pending',
  'meet_greet_pending',
  'approved',
  'declined'
);

-- Add the column with the new-signup default.
alter table profiles
  add column onboarding_status onboarding_status not null default 'info_pending';

-- Backfill from the old boolean: completed → approved, else info_pending.
-- Existing onboarded clients become 'approved' and are never re-gated.
update profiles
  set onboarding_status = case
    when onboarding_complete then 'approved'::onboarding_status
    else 'info_pending'::onboarding_status
  end;

-- Re-point the auto-provision trigger at the new column.
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, role, onboarding_status)
  values (new.id, new.email, 'client', 'info_pending');
  return new;
end;
$$;

-- Column-level guard: onboarding_status is system/admin-set, NEVER client-writable
-- (a client must not self-approve). Mirror the existing statement found in Step 1
-- that listed onboarding_complete among the system-only profile columns, swapping
-- onboarding_complete → onboarding_status. (Paste the exact mirrored statement here.)

-- Drop the old boolean now that the trigger, guard, and all code readers move in
-- this same commit set.
alter table profiles drop column onboarding_complete;

-- Add the meet-and-greet pricing type. NOTE: a new enum value cannot be USED in
-- the same transaction that adds it — the seed lives in a separate migration.
alter type pricing_type add value if not exists 'meet_greet';
```

- [ ] **Step 3: Apply locally and verify**

Run: `npx supabase migration up` (or the repo's documented local-apply command — see `docs/DEV_NOTES.md`)
Expected: applies cleanly. Verify: `psql ... -c "select onboarding_status, count(*) from profiles group by 1;"` returns rows; `\d profiles` shows no `onboarding_complete`; `select unnest(enum_range(null::pricing_type));` includes `meet_greet`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<ts>_onboarding_status_and_meet_greet_enum.sql
git commit -m "feat: add onboarding_status enum and meet_greet pricing type"
```

### Task 2: Migration — seed the meet-and-greet service

**Files:**

- Create: `supabase/migrations/<ts2>_seed_meet_greet_service.sql` (timestamp after Task 1)

- [ ] **Step 1: Write the seed**

```sql
-- Free onboarding meet-and-greet. Separate migration so the 'meet_greet' enum
-- value added in the previous migration is already committed and usable.
insert into services (slug, name, description, pricing_type, pricing_config,
                      default_duration_min, max_pets, concurrency,
                      form_key, requires_approval, active, sort_order)
values (
  'meet-greet',
  'Meet & Greet',
  'A free, in-person introduction before your first booking.',
  'meet_greet',
  '{}'::jsonb,
  30,
  null,
  'exclusive',
  null,
  false,
  true,
  -1            -- sorts ahead of paid services; it is onboarding-only
)
on conflict (slug) do nothing;
```

- [ ] **Step 2: Apply and verify**

Run: `npx supabase migration up`
Expected: `select slug, pricing_type, active from services where slug = 'meet-greet';` → one row, `meet_greet`, `true`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/<ts2>_seed_meet_greet_service.sql
git commit -m "feat: seed the meet-and-greet service"
```

---

## Phase 2 — Pricing: thread the meet_greet type

### Task 3: Add the meet_greet pricing types

**Files:**

- Modify: `src/features/pricing/types.ts`

- [ ] **Step 1: Add the config + quantities interfaces and union member**

In `types.ts`, extend the union and add the shapes:

```ts
/** The pricing types (closed union). meet_greet is the free onboarding visit. */
export type PricingType =
  | "house_sitting"
  | "check_in"
  | "walk"
  | "training"
  | "meet_greet";
```

```ts
/** Validated pricing_config for the meet-and-greet (no priced fields). */
export type MeetGreetConfig = Record<string, never>;

/** Quantities for a meet-and-greet (none — it is free and unpriced). */
export type MeetGreetQuantities = Record<string, never>;
```

Add the union variant to `QuoteInput`:

```ts
  | ({
      pricingType: "meet_greet";
      pricingConfig: MeetGreetConfig;
    } & MeetGreetQuantities &
      QuoteInputModifiers);
```

- [ ] **Step 2: Verify typecheck surfaces the expected gaps**

Run: `npx tsc --noEmit`
Expected: FAIL — exhaustiveness errors in `config-schemas.ts`, `quote.ts`, `display.ts`, `service-card-display.ts`, `booking-service.ts`. These are the sites Tasks 4–8 fix. (Do not commit yet.)

### Task 4: meet_greet config schema

**Files:**

- Modify: `src/features/pricing/config-schemas.ts`
- Test: `src/features/pricing/config-schemas.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { parsePricingConfig } from "./config-schemas";

test("meet_greet config is an empty object", () => {
  expect(parsePricingConfig("meet_greet", {})).toEqual({});
});
```

- [ ] **Step 2: Run it, expect fail**

Run: `npx vitest run src/features/pricing/config-schemas.test.ts -t "meet_greet"`
Expected: FAIL (no case for meet_greet).

- [ ] **Step 3: Implement**

Add to `ConfigForType<T>`:

```ts
        : T extends "meet_greet"
          ? MeetGreetConfig
          : never;
```

Import `MeetGreetConfig` from `./types`. Add a schema + case:

```ts
const meetGreetConfigSchema = z.object({}).strict();
```

```ts
    case "meet_greet":
      return meetGreetConfigSchema.parse(raw) as ConfigForType<T>;
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/features/pricing/config-schemas.test.ts`
Expected: PASS.

### Task 5: quoteMeetGreet returns $0

**Files:**

- Modify: `src/features/pricing/quote.ts`
- Test: `src/features/pricing/quote.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("meet_greet quote is free with no lines", () => {
  const result = quote({
    pricingType: "meet_greet",
    pricingConfig: {},
    recurringDiscountApplies: false,
    recurringDiscountPct: 10,
    applyKiche: false,
  });
  expect(result).toEqual({ lines: [], finalCents: 0 });
});
```

- [ ] **Step 2: Run it, expect fail**

Run: `npx vitest run src/features/pricing/quote.test.ts -t "meet_greet"`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add the function and dispatch case (no modifiers — a free service is never discounted or travel-charged):

```ts
function quoteMeetGreet(
  _input: Extract<QuoteInput, { pricingType: "meet_greet" }>,
): QuoteBreakdown {
  return { lines: [], finalCents: 0 };
}
```

```ts
    case "meet_greet":
      return quoteMeetGreet(input);
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/features/pricing/quote.test.ts`
Expected: PASS.

### Task 6: display.headlineRate — "Free"

**Files:**

- Modify: `src/features/pricing/display.ts`
- Test: `src/features/pricing/display.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("meet_greet headline rate is Free", () => {
  expect(headlineRate("meet_greet", {})).toBe("Free");
});
```

(Match the actual `headlineRate` signature in `display.ts` — adjust the second arg to the config it expects.)

- [ ] **Step 2: Run it, expect fail**

Run: `npx vitest run src/features/pricing/display.test.ts -t "meet_greet"`
Expected: FAIL.

- [ ] **Step 3: Implement**

Extend the `ConfigForType` alias in `display.ts` with the `meet_greet → MeetGreetConfig` branch (mirror Task 4), then add the switch case before the exhaustiveness default:

```ts
    case "meet_greet":
      return "Free";
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/features/pricing/display.test.ts`
Expected: PASS.

### Task 7: service-card-display — two cases

**Files:**

- Modify: `src/features/booking/service-card-display.ts`
- Test: `src/features/booking/service-card-display.test.ts`

- [ ] **Step 1: Write the failing test**

Read `service-card-display.ts` first to see what the two switches return (e.g. a CTA label and a selection-mode). Then assert the meet_greet outputs, e.g.:

```ts
test("meet_greet service card uses a single-visit booking mode", () => {
  expect(bookingModeFor("meet_greet")).toBe("week-slots"); // match the check_in mode
  expect(ctaLabelFor("meet_greet")).toBe("Schedule"); // match neighbouring labels
});
```

(Use the real exported function names + expected values from the file.)

- [ ] **Step 2: Run it, expect fail**

Run: `npx vitest run src/features/booking/service-card-display.test.ts -t "meet_greet"`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add a `case "meet_greet":` to **both** switches, returning the same values as `check_in` (a single-day timed visit). Place each before its `_exhaustive` default.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/features/booking/service-card-display.test.ts`
Expected: PASS.

### Task 8: parseQuantities + buildQuoteInput meet_greet cases

**Files:**

- Modify: `src/features/booking/booking-service.ts`
- Test: `src/features/booking/booking-service.test.ts`

- [ ] **Step 1: Write the failing test (pure helpers via a meet_greet create)**

A meet-greet submit carries no quantities. Add a test asserting `parseQuantities("meet_greet", {})` succeeds. Since `parseQuantities`/`buildQuoteInput` are module-internal, test through the public path in Task 11 instead, OR export a thin test hook. Simplest: add the cases now and rely on Task 11's integration test. Mark this step done by adding the cases in Step 3.

- [ ] **Step 2: Confirm the compile gap**

Run: `npx tsc --noEmit`
Expected: FAIL — `parseQuantities` and `buildQuoteInput` switches lack `meet_greet`.

- [ ] **Step 3: Implement**

Add the quantities schema near the others:

```ts
const meetGreetQuantitiesSchema = z.object({}).strict();
type MeetGreetQty = z.infer<typeof meetGreetQuantitiesSchema>;
```

Extend `ParsedQuantities`:

```ts
  | { pricingType: "meet_greet"; data: MeetGreetQty };
```

Add the `parseQuantities` case:

```ts
    case "meet_greet": {
      const r = meetGreetQuantitiesSchema.safeParse(raw);
      if (!r.success) return { success: false, message: r.error.message };
      return { success: true, pricingType: "meet_greet", data: r.data };
    }
```

Add the `buildQuoteInput` case:

```ts
    case "meet_greet":
      return {
        pricingType: "meet_greet",
        pricingConfig: opts.pricingConfig as QuoteInput["pricingConfig"],
        ...shared,
      } as QuoteInput;
```

- [ ] **Step 4: Typecheck clean**

Run: `npx tsc --noEmit`
Expected: PASS (all PricingType exhaustiveness gaps closed).

- [ ] **Step 5: Commit Phase 2**

```bash
git add src/features/pricing src/features/booking/service-card-display.ts src/features/booking/booking-service.ts
git commit -m "feat: add meet-and-greet as a free pricing type"
```

---

## Phase 3 — Booking core gate

### Task 9: Repo — serviceRowSchema enum + onboarding reads

**Files:**

- Modify: `src/features/booking/booking-repository.ts`

- [ ] **Step 1: Widen the service row enum**

Change `serviceRowSchema`'s `pricing_type` to include the new value:

```ts
  pricing_type: z.enum([
    "house_sitting",
    "check_in",
    "walk",
    "training",
    "meet_greet",
  ]),
```

- [ ] **Step 2: Add the OnboardingStatus type + interface methods**

```ts
export type OnboardingStatus =
  | "info_pending"
  | "meet_greet_pending"
  | "approved"
  | "declined";
```

Add to the `BookingRepository` interface:

```ts
  /** The caller's onboarding lifecycle status (gate input). */
  getOnboardingStatus(userId: string): Promise<OnboardingStatus>;

  /**
   * True when the user already has a NON-TERMINAL booking (pending_approval |
   * confirmed) for the given service slug — used to enforce one meet-and-greet
   * at a time.
   */
  hasActiveBookingForServiceSlug(
    userId: string,
    slug: string,
  ): Promise<boolean>;
```

- [ ] **Step 3: Implement both in the Supabase factory**

```ts
    async getOnboardingStatus(userId) {
      const { data, error } = await client
        .from("profiles")
        .select("onboarding_status")
        .eq("id", userId)
        .single();
      if (error) {
        if (error.code === "PGRST116") return "info_pending";
        throw new Error(
          `Failed to load onboarding_status for '${userId}': ${error.message}`,
        );
      }
      return data.onboarding_status as OnboardingStatus;
    },

    async hasActiveBookingForServiceSlug(userId, slug) {
      const { data, error } = await client
        .from("bookings")
        .select("id, services!inner(slug)")
        .eq("client_id", userId)
        .eq("services.slug", slug)
        .in("status", ["pending_approval", "confirmed"])
        .limit(1);
      if (error) {
        throw new Error(
          `Failed to check active '${slug}' booking for '${userId}': ${error.message}`,
        );
      }
      return (data ?? []).length > 0;
    },
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

### Task 10: Gate logic in computeBookingArtifacts + new result kind

**Files:**

- Modify: `src/features/booking/booking-service.ts`
- Test: `src/features/booking/booking-service.test.ts`

- [ ] **Step 1: Write failing tests (use the existing in-memory/fake repo in the test file)**

Add a `MEET_GREET_SLUG` constant and cases. Find the fake repo helper already used in `booking-service.test.ts` and extend it with `getOnboardingStatus` / `hasActiveBookingForServiceSlug` returning configurable values. Tests:

```ts
test("meet_greet_pending client cannot book a paid service", async () => {
  const deps = makeDeps({ onboardingStatus: "meet_greet_pending" });
  const result = await createBookingCore(
    deps,
    baseInput({ serviceSlug: "walk" }),
  );
  expect(result.kind).toBe("onboarding_incomplete");
});

test("meet_greet_pending client CAN book the meet-greet", async () => {
  const deps = makeDeps({
    onboardingStatus: "meet_greet_pending",
    serviceSlug: "meet-greet",
  });
  const result = await createBookingCore(
    deps,
    baseInput({ serviceSlug: "meet-greet" }),
  );
  expect(result.kind).toBe("success");
});

test("info_pending client can book nothing", async () => {
  const deps = makeDeps({
    onboardingStatus: "info_pending",
    serviceSlug: "meet-greet",
  });
  const result = await createBookingCore(
    deps,
    baseInput({ serviceSlug: "meet-greet" }),
  );
  expect(result.kind).toBe("onboarding_incomplete");
});

test("declined client can book nothing", async () => {
  const deps = makeDeps({
    onboardingStatus: "declined",
    serviceSlug: "meet-greet",
  });
  const result = await createBookingCore(
    deps,
    baseInput({ serviceSlug: "meet-greet" }),
  );
  expect(result.kind).toBe("onboarding_incomplete");
});

test("second meet-greet is blocked while one is active", async () => {
  const deps = makeDeps({
    onboardingStatus: "meet_greet_pending",
    serviceSlug: "meet-greet",
    hasActiveMeetGreet: true,
  });
  const result = await createBookingCore(
    deps,
    baseInput({ serviceSlug: "meet-greet" }),
  );
  expect(result.kind).toBe("onboarding_incomplete");
});

test("approved client books any service (regression)", async () => {
  const deps = makeDeps({ onboardingStatus: "approved", serviceSlug: "walk" });
  const result = await createBookingCore(
    deps,
    baseInput({ serviceSlug: "walk" }),
  );
  expect(result.kind).toBe("success");
});
```

- [ ] **Step 2: Run, expect fail**

Run: `npx vitest run src/features/booking/booking-service.test.ts -t "meet"`
Expected: FAIL (`onboarding_incomplete` not produced).

- [ ] **Step 3: Implement the gate**

Add the result kind to both `CreateBookingResult` and `ArtifactsResult`:

```ts
  | { kind: "onboarding_incomplete" }
```

Define the slug constant near the top of the module:

```ts
const MEET_GREET_SLUG = "meet-greet";
```

In `computeBookingArtifacts`, immediately after the debt-gate block (before loading service/settings), add:

```ts
// Onboarding gate (DESIGN: meet-and-greet). A client may book paid services
// only once approved; a meet_greet_pending client may book ONLY the
// meet-and-greet, and only one at a time. info_pending / declined book nothing.
const onboardingStatus = await repo.getOnboardingStatus(input.userId);
if (onboardingStatus !== "approved") {
  const isMeetGreet = input.serviceSlug === MEET_GREET_SLUG;
  if (onboardingStatus !== "meet_greet_pending" || !isMeetGreet) {
    return { kind: "onboarding_incomplete" };
  }
  if (
    await repo.hasActiveBookingForServiceSlug(input.userId, MEET_GREET_SLUG)
  ) {
    return { kind: "onboarding_incomplete" };
  }
}
```

In `createBookingCore`, forward the new kind from `computeBookingArtifacts`:

```ts
if (result.kind === "onboarding_incomplete") {
  return { kind: "onboarding_incomplete" };
}
```

(Place alongside the other early-return kind checks.) Also add the same forward in `computeBookingQuoteCore` if `PreviewResult` should carry it — add `{ kind: "onboarding_incomplete" }` to `PreviewResult` and forward, so the price preview also blocks.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/features/booking/booking-service.test.ts`
Expected: PASS (new + existing).

### Task 11: Action surfaces onboarding_incomplete

**Files:**

- Modify: `src/features/booking/actions.ts`

- [ ] **Step 1: Confirm the union flows out**

`createBooking` returns `CreateBookingResult` directly, so `onboarding_incomplete` already propagates. No code change unless the action maps results. Verify by reading `actions.ts` — if it pattern-matches `result.kind`, ensure the new kind is not dropped.

- [ ] **Step 2: Typecheck + commit Phase 3**

Run: `npx tsc --noEmit && npx vitest run src/features/booking`
Expected: PASS.

```bash
git add src/features/booking
git commit -m "feat: gate booking on onboarding status"
```

---

## Phase 4 — Onboarding completion advances to meet_greet_pending

### Task 12: runOnboarding sets meet_greet_pending

**Files:**

- Modify: `src/features/accounts/onboarding-action.ts`
- Test: `src/features/accounts/onboarding-action.test.ts`

- [ ] **Step 1: Update the failing test**

In `onboarding-action.test.ts`, the existing test asserts `onboarding_complete` is flipped true. Change it to assert the final profile update sets `onboarding_status: "meet_greet_pending"` (and that it does NOT set `approved`). Match the existing fake/mock serviceClient assertion style in that file.

- [ ] **Step 2: Run, expect fail**

Run: `npx vitest run src/features/accounts/onboarding-action.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `runOnboarding`, change step 3 from flipping `onboarding_complete` to advancing the status:

```ts
// 3. Advance onboarding to the meet-and-greet stage — single writer (service
// role only; RLS + column grant blocks client writes). This NO LONGER unlocks
// booking; the client must now book + attend a meet-and-greet, then Cal approves.
const { error: flagError } = await serviceClient
  .from("profiles")
  .update({ onboarding_status: "meet_greet_pending" })
  .eq("id", userId);

if (flagError) {
  throw new Error(`onboarding_status advance failed: ${flagError.message}`);
}
```

Update the surrounding comment/JSDoc that references `onboarding_complete`.

- [ ] **Step 4: Run, expect pass; commit**

Run: `npx vitest run src/features/accounts/onboarding-action.test.ts`
Expected: PASS.

```bash
git add src/features/accounts/onboarding-action.ts src/features/accounts/onboarding-action.test.ts
git commit -m "feat: advance onboarding to meet-and-greet stage after forms"
```

---

## Phase 5 — Gate readers (middleware + book page)

### Task 13: Middleware reads onboarding_status

**Files:**

- Modify: `src/lib/supabase/proxy.ts`

- [ ] **Step 1: Swap the read**

Replace the `onboarding_complete` self-read + `onboarded` derivation:

```ts
const { data: profile } = await supabase
  .from("profiles")
  .select("onboarding_status")
  .eq("id", claims.sub)
  .single();
const onboarded = profile?.onboarding_status === "approved";
```

Behavior is unchanged: only an `approved` user is "onboarded" for `/account` access; everyone else is confined to `/onboarding`. (`meet_greet_pending` users stay on `/onboarding`, which Task 16 makes stateful.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

### Task 14: Book page AuthState

**Files:**

- Modify: `src/app/(marketing)/book/[serviceSlug]/page.tsx`
- Modify: `src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx` (the `AuthState` type lives here; UI handled in Task 17)

- [ ] **Step 1: Extend AuthState**

In `service-booking-client.tsx`, change:

```ts
export type AuthState = "guest" | "needs-info" | "needs-meet-greet" | "ready";
```

- [ ] **Step 2: Compute the richer state in the page**

In `page.tsx`, replace the profile read + `authState` derivation:

```ts
const { data: profile } = await svc
  .from("profiles")
  .select("onboarding_status")
  .eq("id", user.id)
  .single();

const status = profile?.onboarding_status as
  | "info_pending"
  | "meet_greet_pending"
  | "approved"
  | "declined"
  | undefined;

if (status === "approved") {
  authState = "ready";
} else if (status === "meet_greet_pending") {
  // May book ONLY the meet-and-greet; any other service shows the gate.
  authState = serviceSlug === "meet-greet" ? "ready" : "needs-meet-greet";
} else {
  authState = "needs-info";
}
```

Leave the `authState === "ready"` pets-loading block unchanged (it now also covers a `meet_greet_pending` user on the meet-greet page — they have pets to assign or none; meet-greet is not pet-aware so the block is harmless).

- [ ] **Step 3: Typecheck + commit Phase 5**

Run: `npx tsc --noEmit`
Expected: PASS (UI for the new states added in Task 17; the client component must still accept the widened union — a temporary exhaustive branch may be needed, completed in Task 17).

```bash
git add src/lib/supabase/proxy.ts "src/app/(marketing)/book/[serviceSlug]/page.tsx" "src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx"
git commit -m "feat: read onboarding status in gate and book page"
```

---

## Phase 6 — Admin actions

### Task 15: clients-actions — status in views + setOnboardingStatus

**Files:**

- Modify: `src/features/admin/clients-actions.ts`
- Test: `src/features/admin/clients-actions.test.ts` (create if absent, mirroring the existing admin action test pattern, e.g. `overnight-actions.test.ts`)

- [ ] **Step 1: Write failing tests**

```ts
test("setOnboardingStatusCore rejects a non-admin actor", async () => {
  const deps = makeAdminDeps({ isAdmin: false });
  const result = await setOnboardingStatusCore(deps, clientId, "approved");
  expect(result.kind).toBe("forbidden");
});

test("setOnboardingStatusCore approves a declined client (override any direction)", async () => {
  const deps = makeAdminDeps({ isAdmin: true });
  const result = await setOnboardingStatusCore(deps, clientId, "approved");
  expect(result.kind).toBe("success");
  expect(deps.lastUpdate).toEqual({ onboarding_status: "approved" });
});

test("setOnboardingStatusCore can revoke an approved client to declined", async () => {
  const deps = makeAdminDeps({ isAdmin: true });
  const result = await setOnboardingStatusCore(deps, clientId, "declined");
  expect(result.kind).toBe("success");
});

test("setOnboardingStatusCore rejects an invalid status", async () => {
  const deps = makeAdminDeps({ isAdmin: true });
  // @ts-expect-error invalid value at the boundary
  const result = await setOnboardingStatusCore(deps, clientId, "bogus");
  expect(result.kind).toBe("validation_error");
});
```

(Model `makeAdminDeps` on the in-memory serviceClient used by the existing admin action tests; capture the `.update(...)` payload as `lastUpdate`.)

- [ ] **Step 2: Run, expect fail**

Run: `npx vitest run src/features/admin/clients-actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add the enum + core action, mirroring `setKicheAllowedCore`:

```ts
const onboardingStatusSchema = z.enum([
  "info_pending",
  "meet_greet_pending",
  "approved",
  "declined",
]);

export async function setOnboardingStatusCore(
  deps: AdminDeps,
  clientId: string,
  status: string,
): Promise<ClientMutationResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }
  if (!uuidSchema.safeParse(clientId).success) {
    return { kind: "validation_error", message: "Invalid client id" };
  }
  const parsed = onboardingStatusSchema.safeParse(status);
  if (!parsed.success) {
    return { kind: "validation_error", message: "Invalid onboarding status" };
  }
  // No source/target transition restriction — Cal may override any time (DESIGN).
  const { error } = await deps.serviceClient
    .from("profiles")
    .update({ onboarding_status: parsed.data })
    .eq("id", clientId)
    .eq("role", "client");
  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}
```

Add the public wrapper:

```ts
export async function setOnboardingStatus(
  clientId: string,
  status: string,
): Promise<ClientMutationResult> {
  const actorUserId = await getActorOrRedirect();
  const result = await setOnboardingStatusCore(
    { serviceClient: createServiceClient(), actorUserId },
    clientId,
    status,
  );
  if (result.kind === "success") revalidatePath(`/admin/clients/${clientId}`);
  return result;
}
```

Swap the view types from boolean to status:

- `ClientListRow.onboardingComplete: boolean` → `onboardingStatus: OnboardingStatus`; in `listClientsCore` select `onboarding_status` and map it (import `OnboardingStatus` from the booking repo or redefine locally).
- `ClientDetailView.onboarding_complete: boolean` → `onboarding_status: OnboardingStatus`; in `getClientDetailCore` select `onboarding_status` and pass it through. Also surface the client's meet-and-greet booking for the card: the existing `bookings` query already returns `service_name`/`status`/`starts_at`, so the detail component can find the `Meet & Greet` row without an extra query.

- [ ] **Step 4: Run, expect pass; typecheck**

Run: `npx vitest run src/features/admin/clients-actions.test.ts && npx tsc --noEmit`
Expected: PASS (note: `client-search.ts` / index + detail components reference the renamed fields — fixed in Tasks 17–18; if typecheck flags them now, proceed to those tasks before committing Phase 6, or stage the rename together).

- [ ] **Step 5: Commit (with the Task 17–18 view updates, since the field rename couples them)**

```bash
git add src/features/admin/clients-actions.ts src/features/admin/clients-actions.test.ts
git commit -m "feat: add admin onboarding status control"
```

---

## Phase 7 — UI (invoke frontend-design FIRST)

> **Before Tasks 16–18:** invoke the `frontend-design` skill. Honor the Trail palette + Fraunces/Public Sans tokens, semantic tokens only (no hardcoded colors), accessibility floor (semantic HTML, focus, keyboard nav), and the mobile-parity standard. Reference the approved mockups in `.superpowers/brainstorm/` (flow, wizard, admin). The structure below is the spec; frontend-design drives the exact markup/polish.

### Task 16: /onboarding stateful wizard

**Files:**

- Modify: `src/app/(account)/onboarding/page.tsx` (currently a client component rendering only the forms)
- Likely add: a server wrapper that reads `onboarding_status` + the client's meet-greet booking, choosing which step to render. Split the existing form into a `_components/info-step.tsx` client component; add `_components/meet-greet-step.tsx`.

- [ ] **Step 1: invoke frontend-design**, then build the server component

Server reads the session + `onboarding_status` + (if `meet_greet_pending`) whether a non-terminal `meet-greet` booking exists and its `starts_at`. Render:

- `info_pending` → the existing profile + emergency form (`info-step.tsx`), submit advances via `completeOnboarding` (unchanged action; it now sets `meet_greet_pending`).
- `meet_greet_pending` + no booking → "Schedule your meet & greet" with a prominent link to `/book/meet-greet?returnTo=/onboarding`.
- `meet_greet_pending` + booking → status card: "Booked for {Denver date}. Cal will confirm you after the visit." + a reschedule link.
- `approved` → not reachable (middleware redirects to `/account`); render nothing / redirect defensively.
- `declined` → a `[[BODY: declined — reach out to Cal]]` placeholder panel + a contact link. (Copy is a placeholder per DESIGN copy rules.)

- [ ] **Step 2: Manual verify each state**

Run the dev server; with a test client, walk: fresh signup (info) → submit (schedule step) → book meet-greet (status card). Flip `onboarding_status` in the DB to `declined`/`approved` to verify those branches.
Expected: each state renders its step; an `approved` user visiting `/onboarding` lands on `/account`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(account)/onboarding"
git commit -m "feat: stateful onboarding wizard with meet-and-greet step"
```

### Task 17: Book page — needs-meet-greet / needs-info panels

**Files:**

- Modify: `src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx`

- [ ] **Step 1: invoke frontend-design**, then handle the widened AuthState

For `needs-info`: a panel "Finish your profile to book" → link `/onboarding`. For `needs-meet-greet`: "Book your meet & greet first" → link `/onboarding` (or `/book/meet-greet`). For `guest`/`ready`: unchanged. Also map a `createBooking` result of `kind: "onboarding_incomplete"` to a friendly message that routes the user to `/onboarding` (covers the race where status changed mid-session).

- [ ] **Step 2: Manual verify**

As a `meet_greet_pending` client, open `/book/walk` → see the needs-meet-greet panel; open `/book/meet-greet` → see the normal Scheduler.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx"
git commit -m "feat: show onboarding gate panels on the book page"
```

### Task 18: Admin clients views — status badge + Onboarding card

**Files:**

- Modify: `src/app/(admin)/admin/clients/_components/clients-index-client.tsx`
- Modify: `src/app/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx`
- Possibly: `src/features/admin/client-search.ts` (if it reads `onboardingComplete`)

- [ ] **Step 1: invoke frontend-design**, then update the index

Replace the "Onboarded" Yes/No column with a status badge (`info_pending` / `meet_greet_pending` / `approved` / `declined`) using the existing `Badge` component + semantic variants. Update the mobile card list similarly. Fix any `client.onboardingComplete` reference (and `client-search.ts` if it sorts/filters on it).

- [ ] **Step 2: Build the detail Onboarding control**

In `client-detail-client.tsx`: change the Account section's "Onboarded: Yes/No" row to show `onboarding_status`. Add an **Onboarding** `SECTION` with:

- the status badge + the client's meet-greet booking (date + booking status) if present (find it in `client.bookings` by `service_name === "Meet & Greet"`),
- transition buttons that differ from the current status, wired through the existing `run()` helper to `setOnboardingStatus(client.id, <target>)`:
  - `meet_greet_pending` → **Approve**, **Decline**
  - `approved` → **Revoke → declined**
  - `declined` → **Approve**, **Reset → meet_greet_pending**
  - `info_pending` → (no action; forms not done) show "Awaiting forms".
- **Pre-visit confirm:** the Approve handler checks the meet-greet booking's `starts_at`; if it is in the future, call the already-imported `useConfirm` `confirm({ title: "Approve before the visit?", description: "Meet & greet is scheduled for <date> and hasn't happened yet. Approve anyway?", confirmLabel: "Approve anyway" })` before calling the action. Past/no booking → approve directly.

- [ ] **Step 3: Manual verify**

Walk a client through states in the admin UI; confirm the pre-visit confirm fires only when approving ahead of a future meet-greet; confirm revoke/reset work.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/admin/clients" src/features/admin/client-search.ts
git commit -m "feat: admin onboarding status badge and approve controls"
```

---

## Phase 8 — Docs

### Task 19: Update DESIGN.md (same commit set as the code)

**Files:**

- Modify: `docs/DESIGN.md`

- [ ] **Step 1: Edit the authoritative facts**

- `profiles` row: replace `onboarding_complete` with `onboarding_status` (4-state enum; gate = `approved`); note `meet_greet_pending` is set when forms finish, `approved`/`declined` are admin-set.
- Pricing model / service table: add the Meet & Greet service (`meet_greet` pricing_type, free, `concurrency='exclusive'`, onboarding-only).
- Booking-flow section: note the onboarding gate (`meet_greet_pending` → only the meet-greet bookable).
- Route map: `/onboarding` → "stateful onboarding wizard (forms → meet-and-greet → approval)"; `/admin/clients` → add the onboarding approve/decline control.
- Column-level guard list: `onboarding_status` replaces `onboarding_complete` as system/admin-set.
- Bump the `_Last reviewed_` footer date.

- [ ] **Step 2: Verify no stale references**

Run: `rg -n "onboarding_complete" docs/ src/`
Expected: no hits (all replaced).

- [ ] **Step 3: Commit**

```bash
git add docs/DESIGN.md
git commit -m "docs: document meet-and-greet onboarding gate"
```

---

## Final verification

- [ ] **Full test + typecheck + build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: all PASS. (If the repo has a lint step, run it too.)

- [ ] **End-to-end smoke (manual)**

Fresh signup → forms → status `meet_greet_pending` → `/book/walk` blocked, `/book/meet-greet` bookable → book it (free, auto-confirms) → admin approves (with pre-visit confirm) → client status `approved` → `/book/walk` now works. Then admin revokes → `declined` → booking blocked again.

---

## Self-review notes (author)

- **Spec coverage:** state model (T1), meet-greet service (T2–T8), authoritative gate (T9–T10), one-at-a-time (T10), runOnboarding advance (T12), middleware + book gate (T13–T14, T17), admin any→any override + pre-visit confirm (T15, T18), wizard (T16), index/detail integration (T18), docs (T19). All spec sections mapped.
- **Migration ordering:** the `ALTER TYPE pricing_type ADD VALUE` and its use are split across two migration files (T1, T2) because a new enum value can't be used in the transaction that adds it.
- **Coupling note:** the `onboardingComplete → onboardingStatus` field rename (T15) couples the admin action and its consuming components (T18) + `client-search.ts`; stage them so typecheck is green at the Phase 6/7 boundary.
- **Type consistency:** `OnboardingStatus` is defined once in `booking-repository.ts` and reused; `MEET_GREET_SLUG = "meet-greet"` matches the seeded slug (T2); result kind `onboarding_incomplete` is used identically in core, preview, and action.

```

```
