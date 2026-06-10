# Admin Create-on-Behalf + Edit Bookings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Cal (admin) create bookings on behalf of any client and edit any client's booking as the admin actor — every policy gate warn-don't-block, optional force-confirm — reusing the existing booking flow.

**Architecture:** The mutation spine (P1) already makes `editBooking`/`previewEdit` admin-aware. This plan (a) closes the one backend gap by making `createBookingCore` policy-aware, (b) adds two admin actions (`createBookingForClient`, `previewQuoteForClient`) and a force-confirm input on `editBooking`, (c) extends the client `EditBookingClient` with an optional `admin` prop, (d) adds a focused `AdminCreateBookingClient` orchestrator with a service-pick step, and (e) wires entry affordances on the client-detail page + calendar. Both admin surfaces are nested under the client (`/admin/clients/[clientId]/...`).

**Tech Stack:** Next.js App Router (server components + `"use server"` actions), TypeScript strict, Supabase (service-role repo), Tailwind + semantic CSS tokens, Vitest.

**Spec:** [docs/superpowers/specs/2026-06-10-admin-create-edit-bookings-design.md](../specs/2026-06-10-admin-create-edit-bookings-design.md)

**Conventions (repo rules — non-negotiable):**

- Commit messages: subject line only, Conventional Commits, NO body/trailer/co-author, NO internal identifiers (no phase numbers). Stage files by name (never `git add -A`). Let git hooks run.
- Design tokens are law (semantic tokens, never hardcoded hex in components). TS strict, no `any`. Core logic pure + tested.
- Booking integration tests need `npx supabase db reset` first. Gate per-task **unit** tests, not the full `vitest run`.

---

## File Structure

**Backend (pure / actions):**

- Modify `src/features/booking/booking-service.ts` — `createBookingCore` gains a `policy` param (default `CLIENT_POLICY`); steps 6/7 warn-don't-block; `forceStatus` applied; `CreateBookingResult.success` gains `warnings`.
- Modify `src/features/booking/actions.ts` — new `createBookingForClient`; `editBooking` gains optional `forceConfirm`.
- Create `src/features/booking/preview-quote-for-client.ts` — admin `previewQuoteForClient` action.
- Modify `src/features/booking/preview-edit.ts` — (no signature change; documented no-op for force-confirm).

**Design system:**

- Modify `src/app/globals.css` — `--warning` + `--warning-foreground` (light + dark) wired through `@theme inline`.
- Modify `src/lib/design-tokens.ts` — add `"warning"` to `SEMANTIC_COLORS`.
- Modify `docs/FRONTEND.md` — one-line note on the new token (same-commit doc rule).

**Shared component:**

- Modify `src/features/booking/_components/quote-panel.tsx` — optional `warnings?: string[]` (amber block above CTA) + optional `footer` slot (force-confirm checkbox).

**Admin edit surface:**

- Modify `src/app/(account)/account/bookings/[id]/edit/_components/edit-booking-client.tsx` — optional `admin` prop bundle.
- Create `src/app/(admin)/admin/clients/[clientId]/bookings/[bookingId]/edit/page.tsx` — admin edit route.

**Admin create surface:**

- Create `src/app/(admin)/admin/clients/[clientId]/book/page.tsx` — admin create route (service-pick + loader).
- Create `src/app/(admin)/admin/clients/[clientId]/book/_components/admin-create-booking-client.tsx` — create orchestrator.
- Create `src/app/(admin)/admin/clients/[clientId]/book/_components/service-pick.tsx` — service chooser.

**Entry affordances:**

- Modify `src/app/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx` — Edit links + "New booking" button.
- Modify `src/app/(admin)/admin/bookings/_components/bookings-calendar-client.tsx` — Edit link on editable day-list rows.

**Tests:**

- Modify `src/features/booking/booking-service.test.ts` — `createBookingCore` policy-aware unit tests.
- Create `src/features/booking/admin-create-booking.integration.test.ts` — admin create + edit + paid-lock integration.

---

## Task 1: `--warning` semantic token

**Files:**

- Modify: `src/app/globals.css`
- Modify: `src/lib/design-tokens.ts`
- Modify: `docs/FRONTEND.md`

- [ ] **Step 1: Add the primitive + semantic role (light) in globals.css**

In the `:root` primitive block (near the other status primitives like `--green-soft`), add:

```css
/* Warn-don't-block accent (amber/honey) — admin override notices */
--amber-soft: #f3e3c8;
--amber-deep: #7a5a1e;
```

In the `:root` semantic-roles block (near `--status-*`), add:

```css
--warning: var(--amber-soft);
--warning-foreground: var(--amber-deep);
```

- [ ] **Step 2: Add the dark-mode override in globals.css**

In `.dark` (near the dark status overrides), add a warm-dark variant:

```css
--warning: #3a2f1c;
--warning-foreground: #e4c48f;
```

- [ ] **Step 3: Wire the roles through `@theme inline`**

In the `@theme inline` block (near `--color-status-*`), add:

```css
--color-warning: var(--warning);
--color-warning-foreground: var(--warning-foreground);
```

This makes `bg-warning` / `text-warning-foreground` / `border-warning` available as Tailwind utilities.

- [ ] **Step 4: Add `"warning"` to the semantic-color reference**

In `src/lib/design-tokens.ts`, add `"warning"` to the `SEMANTIC_COLORS` array (after `"status-unavailable-foreground"`):

```ts
  "status-unavailable-foreground",
  "warning",
] as const;
```

- [ ] **Step 5: Note the token in FRONTEND.md**

Add one line under the theming/status-token section of `docs/FRONTEND.md`:

```markdown
- `--warning` / `--warning-foreground` — amber "warn-don't-block" accent (admin override notices). Light + dark defined in `globals.css`.
```

- [ ] **Step 6: Verify build picks up the utilities**

Run: `npm run build`
Expected: build succeeds (no usage yet; this just confirms the CSS parses).

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/lib/design-tokens.ts docs/FRONTEND.md
git commit -m "feat: add warning semantic color token"
```

---

## Task 2: QuotePanel warnings block + footer slot

**Files:**

- Modify: `src/features/booking/_components/quote-panel.tsx`

(Presentational component; the repo keeps no unit tests for it — verified via build + the surfaces that consume it. No test step here, consistent with the existing component.)

- [ ] **Step 1: Extend the props**

In `quote-panel.tsx`, update `QuotePanelProps`:

```ts
interface QuotePanelProps {
  preview: BookingQuotePreview;
  onBook?: () => void;
  bookLabel?: string;
  bookDisabled?: boolean;
  showBook?: boolean;
  priorFinalCents?: number;
  approvalWillReReview?: boolean;
  /** Warn-don't-block override notices (admin). Rendered as an amber block above the CTA. */
  warnings?: string[];
  /** Optional control rendered directly above the CTA (e.g. admin force-confirm). */
  footer?: React.ReactNode;
}
```

Add `import type { ReactNode } from "react";` if not present, or reference `React.ReactNode` (the file is a client component — add `import type { ReactNode } from "react";` and use `ReactNode`).

- [ ] **Step 2: Destructure the new props**

```ts
export function QuotePanel({
  preview,
  onBook,
  bookLabel = "Book now",
  bookDisabled,
  showBook,
  priorFinalCents,
  approvalWillReReview,
  warnings,
  footer,
}: QuotePanelProps) {
```

- [ ] **Step 3: Render the warnings block + footer above the CTA**

Immediately BEFORE the `{showBook && onBook && (` button block, insert:

```tsx
{
  warnings && warnings.length > 0 && (
    <div className="bg-warning border-warning-foreground/30 text-warning-foreground mt-3 rounded-md border p-2.5 text-sm">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
        <span aria-hidden="true">⚠</span> Overrides in effect — you can still
        save
      </p>
      <ul className="list-disc space-y-0.5 pl-4">
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
{
  footer && <div className="mt-3">{footer}</div>;
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS. Client surfaces pass no `warnings`/`footer` → no visual change.

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/_components/quote-panel.tsx
git commit -m "feat: support override warnings and footer slot in quote panel"
```

---

## Task 3: Make `createBookingCore` policy-aware

**Files:**

- Modify: `src/features/booking/booking-service.ts`
- Test: `src/features/booking/booking-service.test.ts`

- [ ] **Step 1: Write failing tests**

In `booking-service.test.ts`, add a `describe("createBookingCore policy-aware", ...)` block. Use the existing test's repo-builder pattern in that file (mirror how other `createBookingCore` tests construct the fake repo + settings + service). Add these cases — adapt the repo/builder names to the ones already in the file:

```ts
import { ADMIN_POLICY } from "./mutation-policy";

// 1. Client policy unchanged: a slot outside all windows → unavailable.
it("client policy still blocks an out-of-window slot", async () => {
  const deps = makeDeps({ openWindows: [] }); // zero windows
  const result = await createBookingCore(deps, validClientInput);
  expect(result.kind).toBe("unavailable");
});

// 2. Admin policy: same out-of-window slot succeeds with a warning.
it("admin policy turns out-of-window into a warning, not a block", async () => {
  const deps = makeDeps({ openWindows: [] });
  const result = await createBookingCore(deps, validClientInput, ADMIN_POLICY);
  expect(result.kind).toBe("success");
  if (result.kind === "success") {
    expect(result.warnings.some((w) => /availability window/i.test(w))).toBe(
      true,
    );
  }
});

// 3. Admin forceStatus confirms regardless of derived approval.
it("admin forceStatus forces the inserted status", async () => {
  const deps = makeDeps({ openWindows: [openWindowCoveringSlot] });
  const policy = { ...ADMIN_POLICY, forceStatus: "confirmed" as const };
  const result = await createBookingCore(deps, manualApprovalInput, policy);
  expect(result.kind).toBe("success");
  expect(deps.repo.lastInsertedStatuses).toEqual(["confirmed"]);
});

// 4. Client success now carries an empty warnings array (back-compat shape).
it("client success returns empty warnings", async () => {
  const deps = makeDeps({ openWindows: [openWindowCoveringSlot] });
  const result = await createBookingCore(deps, validClientInput);
  expect(result.kind).toBe("success");
  if (result.kind === "success") expect(result.warnings).toEqual([]);
});
```

If the file's fake repo does not already record inserted statuses, extend it to capture `insertBookings` rows (e.g. `lastInsertedStatuses = rows.map(r => r.status)`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/booking/booking-service.test.ts -t "policy-aware"`
Expected: FAIL (createBookingCore takes no policy arg / success has no `warnings`).

- [ ] **Step 3: Add `warnings` to the success result type**

In `booking-service.ts`, change `CreateBookingResult`:

```ts
export type CreateBookingResult =
  | { kind: "success"; bookingIds: string[]; warnings: string[] }
  | { kind: "refuse"; reason: string }
  | { kind: "slot_taken" }
  | { kind: "unavailable"; reason: string }
  | { kind: "blocked_debt"; owedCents: number }
  | { kind: "onboarding_incomplete" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };
```

- [ ] **Step 4: Add the `policy` param + thread it into artifacts**

Change the signature and the `computeBookingArtifacts` call:

```ts
export async function createBookingCore(
  deps: BookingServiceDeps,
  rawInput: CreateBookingInput,
  policy: MutationPolicy = CLIENT_POLICY,
): Promise<CreateBookingResult> {
  // 1–5. Load artifacts + quote/approval (shared with the preview path).
  const result = await computeBookingArtifacts(deps, rawInput, policy);
```

`CLIENT_POLICY` is already imported in this file. Keep all the existing early-return mappings unchanged.

- [ ] **Step 5: Collect warnings + make steps 6/7 warn-don't-block**

After destructuring `result.artifacts`, seed a warnings array from the artifacts:

```ts
const warnings = [...result.artifacts.warnings];
```

Replace the step-6 guard loop body so it warns under policy:

```ts
// 6. Booking-rule guards per occurrence (policy-aware).
for (const occStart of occurrences) {
  const occEnd = new Date(occStart.getTime() + durationMs);
  if (
    !passesGuards({ startsAt: occStart, endsAt: occEnd }, ruleSettings, now)
  ) {
    if (policy.skipHoursLeadGuards) {
      warnings.push(
        `Occurrence at ${occStart.toISOString()} is outside normal booking rules (hours / lead time).`,
      );
    } else {
      return {
        kind: "unavailable",
        reason: `Occurrence at ${occStart.toISOString()} does not meet booking rules (hours-of-day, lead time, or max advance).`,
      };
    }
  }
}
```

Replace the step-7 window-fit loop body the same way:

```ts
// 7. Availability-window containment (policy-aware).
const openWindows = await repo.getOpenWindows(now);
for (const occStart of occurrences) {
  const occEnd = new Date(occStart.getTime() + durationMs);
  if (!fitsWindow({ startsAt: occStart, endsAt: occEnd }, openWindows)) {
    if (policy.skipWindowFit) {
      warnings.push(
        `Occurrence at ${occStart.toISOString()} is outside any published availability window.`,
      );
    } else {
      return {
        kind: "unavailable",
        reason: `Occurrence at ${occStart.toISOString()} does not fall within any open availability window.`,
      };
    }
  }
}
```

- [ ] **Step 6: Apply `forceStatus` in the status loop**

Replace the step 8–9 status derivation loop:

```ts
const statuses: BookingStatusDb[] = [];
for (const occRequiresApproval of requiresApprovalByOccurrence) {
  if (policy.forceStatus) {
    statuses.push(policy.forceStatus);
    continue;
  }
  const statResult = transition("draft", "submit", {
    requiresApproval: occRequiresApproval,
  });
  if ("error" in statResult) {
    return { kind: "error", message: statResult.error };
  }
  statuses.push(statResult.state);
}
```

- [ ] **Step 7: Return warnings on success**

Change the success return (the `return { kind: "success", bookingIds: ids };` after pet linking) to:

```ts
return { kind: "success", bookingIds: ids, warnings };
```

- [ ] **Step 8: Fix the existing create success assertions**

Search `booking-service.test.ts` for existing `createBookingCore` success assertions using `toEqual`/object-match on the result and add `warnings: []` (or assert `result.kind === "success"` + check `bookingIds` only). Run the whole create suite:

Run: `npx vitest run src/features/booking/booking-service.test.ts`
Expected: PASS (new + existing).

- [ ] **Step 9: Commit**

```bash
git add src/features/booking/booking-service.ts src/features/booking/booking-service.test.ts
git commit -m "feat: make createBookingCore policy-aware with warnings and force-status"
```

---

## Task 4: Admin actions — create-on-behalf, preview, edit force-confirm

**Files:**

- Modify: `src/features/booking/actions.ts`
- Create: `src/features/booking/preview-quote-for-client.ts`

(Server actions hit Supabase auth — exercised via the integration test in Task 8, not unit tests. Logic is thin delegation to already-tested cores.)

- [ ] **Step 1: Extend `requireAdminDeps` to also return the authed user id**

In `actions.ts`, the `requireAdminDeps` helper currently returns `{ ok, repo, gateway }`. Add the verified `userId` so create-on-behalf can be audited later and the repo can be reused. Change its success branch to:

```ts
return {
  ok: true,
  userId: user.id,
  repo: createSupabaseBookingRepository(serviceClient),
  gateway: new StripeGateway(),
  serviceClient,
};
```

and widen its return type accordingly (add `userId: string; serviceClient: ReturnType<typeof createServiceClient>;` to the `ok: true` shape).

- [ ] **Step 2: Add `forceConfirm` to `editBooking`**

In `actions.ts`, update `editBooking`:

```ts
export async function editBooking(input: {
  bookingId: string;
  patch: EditBookingPatch;
  forceConfirm?: boolean;
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
  const isAdmin = profile?.role === "admin";
  const policy = isAdmin
    ? {
        ...ADMIN_POLICY,
        forceStatus: input.forceConfirm ? ("confirmed" as const) : undefined,
      }
    : CLIENT_POLICY;

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

(`forceConfirm` is ignored for non-admins — they always get `CLIENT_POLICY`.)

- [ ] **Step 3: Add the `createBookingForClient` action**

Append to `actions.ts`:

```ts
/**
 * Admin: create a booking on behalf of a client. The target client id comes
 * from the (admin-verified) caller, never trusted as the actor identity. Runs
 * ADMIN_POLICY (all gates warn-don't-block) with optional force-confirm. Takes
 * no payment and never touches Stripe (offline payment is handled separately).
 */
export async function createBookingForClient(input: {
  clientId: string;
  serviceSlug: string;
  startsAt: Date;
  endsAt: Date;
  quantities: Record<string, unknown>;
  petIds?: string[];
  recurringRule: {
    freq: "daily" | "weekly" | "monthly";
    interval: number;
    count?: number;
    until?: Date;
  } | null;
  forceConfirm?: boolean;
}): Promise<CreateBookingResult> {
  const admin = await requireAdminDeps();
  if (!admin.ok) return { kind: "error", message: "Forbidden" };

  // Verify the target is a real client profile (service-role read bypasses RLS).
  const { data: target } = await admin.serviceClient
    .from("profiles")
    .select("role")
    .eq("id", input.clientId)
    .single();
  if (!target || target.role !== "client") {
    return { kind: "error", message: "Target is not a client" };
  }

  const policy = {
    ...ADMIN_POLICY,
    forceStatus: input.forceConfirm ? ("confirmed" as const) : undefined,
  };

  return createBookingCore(
    { repo: admin.repo, now: new Date() },
    {
      userId: input.clientId,
      serviceSlug: input.serviceSlug,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      quantities: input.quantities,
      petIds: input.petIds,
      recurringRule: input.recurringRule,
    },
    policy,
  );
}
```

Add `createBookingCore` to the import from `./booking-service` if it is not already imported there (it is). Ensure `CreateBookingResult` is imported (it is, via the existing type import block).

- [ ] **Step 4: Create the admin preview action**

Create `src/features/booking/preview-quote-for-client.ts`:

```ts
"use server";

/**
 * Admin read-only quote preview for create-on-behalf. Computes against the
 * TARGET client's profile (their distance, debt) under ADMIN_POLICY, so the
 * returned BookingQuotePreview carries warn-don't-block warnings. Admin twin of
 * previewQuote. Never persists.
 */
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createSupabaseBookingRepository } from "./booking-repository";
import { computeBookingQuoteCore } from "./booking-service";
import { ADMIN_POLICY } from "./mutation-policy";
import type { PreviewResult } from "./booking-service";

export type PreviewForClientResult = { kind: "forbidden" } | PreviewResult;

export async function previewQuoteForClient(input: {
  clientId: string;
  serviceSlug: string;
  startsAt: Date;
  endsAt: Date;
  quantities: Record<string, unknown>;
  petIds?: string[];
  recurringRule: {
    freq: "daily" | "weekly" | "monthly";
    interval: number;
    count?: number;
    until?: Date;
  } | null;
}): Promise<PreviewForClientResult> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { kind: "forbidden" };

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { kind: "forbidden" };

  const repo = createSupabaseBookingRepository(serviceClient);
  return computeBookingQuoteCore(
    { repo, now: new Date() },
    {
      userId: input.clientId,
      serviceSlug: input.serviceSlug,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      quantities: input.quantities,
      petIds: input.petIds,
      recurringRule: input.recurringRule,
    },
    ADMIN_POLICY,
  );
}
```

- [ ] **Step 5: Verify typecheck + build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/booking/actions.ts src/features/booking/preview-quote-for-client.ts
git commit -m "feat: add admin create-on-behalf and preview actions"
```

---

## Task 5: Extend `EditBookingClient` with admin mode + admin edit route

**Files:**

- Modify: `src/app/(account)/account/bookings/[id]/edit/_components/edit-booking-client.tsx`
- Create: `src/app/(admin)/admin/clients/[clientId]/bookings/[bookingId]/edit/page.tsx`

- [ ] **Step 1: Add the `admin` prop to EditBookingClient**

In `edit-booking-client.tsx`, add to `EditBookingClientProps`:

```ts
  /** When set, the surface runs in admin (on-behalf) mode. */
  admin?: {
    clientName: string;
    /** paidCents > 0 → price-affecting controls (pets/quantities) disabled. */
    paidLock: boolean;
  };
```

Destructure `admin` in the component params.

- [ ] **Step 2: Add force-confirm state + identity header**

Inside the component, after the existing state hooks, add:

```ts
const [forceConfirm, setForceConfirm] = useState(false);
```

At the top of the returned JSX (before the `{/* 1. Calendar */}` section), add the admin identity header:

```tsx
{
  admin && (
    <header className="mb-2">
      <p className="text-brand-strong text-xs font-semibold tracking-wide uppercase">
        Admin · editing on behalf
      </p>
      <p className="text-muted-foreground text-sm">
        for{" "}
        <span className="text-foreground font-medium">{admin.clientName}</span>
      </p>
    </header>
  );
}
```

- [ ] **Step 3: Disable price-affecting controls under paid-lock**

Wrap the pet + quantity sections so they are visually locked when `admin?.paidLock`. For the PetAssignment section, when `admin?.paidLock` is true render a read-only note instead of the editable control:

```tsx
{
  petAware && (
    <section aria-labelledby="pets-heading">
      <h2
        id="pets-heading"
        className="text-brand-strong mb-3 text-xs font-semibold tracking-wide uppercase"
      >
        {step2Label}. Which pets?
      </h2>
      {admin?.paidLock ? (
        <p className="text-muted-foreground border-border bg-muted/30 rounded-lg border p-3 text-sm">
          🔒 This booking is paid — pets and price can’t change here. Manage
          price in Payments (coming soon).
        </p>
      ) : (
        <PetAssignment
          pets={pets}
          allowedSpecies={allowedSpecies}
          selected={selectedPetIds}
          onChange={(ids) => {
            setSelectedPetIds(ids);
            requestPreview();
          }}
          onPetAdded={handlePetAdded}
        />
      )}
    </section>
  );
}
```

For the Details (QuantityForm) section, similarly render the QuantityForm only when not paid-locked; when paid-locked, omit it (time + comments stay editable):

```tsx
{
  !admin?.paidLock && (
    <section aria-labelledby="qty-heading">
      <h2
        id="qty-heading"
        className="text-brand-strong mb-3 text-xs font-semibold tracking-wide uppercase"
      >
        {step3Label}. Details
      </h2>
      <QuantityForm
        state={quantities}
        onChange={(s) => {
          setQuantities(s);
          requestPreview();
        }}
      />
    </section>
  );
}
```

- [ ] **Step 4: Pass warnings + force-confirm to QuotePanel; thread force-confirm to save**

Replace the `<QuotePanel ... />` usage with:

```tsx
<QuotePanel
  preview={quote}
  priorFinalCents={priorFinalCents}
  approvalWillReReview={approvalWillReReview && !forceConfirm}
  warnings={admin ? quote.warnings : undefined}
  footer={
    admin ? (
      <label className="border-border bg-background flex items-start gap-2 rounded-md border p-2.5 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={forceConfirm}
          onChange={(e) => setForceConfirm(e.target.checked)}
        />
        <span>
          <span className="font-medium">Confirm immediately</span> — skip
          pending approval
        </span>
      </label>
    ) : undefined
  }
  onBook={handleSave}
  bookLabel={isSubmitting ? "Saving…" : "Save changes"}
  bookDisabled={saveDisabled}
  showBook
/>
```

In `handleSave`, pass `forceConfirm`:

```ts
const result = await editBooking({ bookingId, patch, forceConfirm });
```

(`BookingQuotePreview` already carries `warnings`; client mode passes `undefined` so nothing renders.)

- [ ] **Step 5: Verify the client edit surface still builds**

Run: `npm run build`
Expected: PASS (client mode unchanged — `admin` undefined everywhere it’s used today).

- [ ] **Step 6: Create the admin edit route**

Create `src/app/(admin)/admin/clients/[clientId]/bookings/[bookingId]/edit/page.tsx`. It mirrors the client edit page loader but (a) verifies admin instead of ownership, (b) gates only on `EDITABLE_STATUSES`, (c) loads the TARGET client’s pets, (d) passes the `admin` bundle:

```tsx
/**
 * Admin edit route — edit ANY client's booking as the admin actor.
 * Guards: admin role → status editable. No ownership/clientCanEdit gate.
 */
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createSupabaseBookingRepository } from "@/features/booking/booking-repository";
import { loadBookingFormData } from "@/features/booking/booking-form-data";
import { quantityStateFromQuoteInputs } from "@/features/booking/quantity-state-from-quote-inputs";
import { EditBookingClient } from "@/app/(account)/account/bookings/[id]/edit/_components/edit-booking-client";
import type { ServiceDetail } from "@/features/booking/service-detail";
import type { AssignablePet } from "@/features/booking/_components/pet-assignment";
import type { PricingType } from "@/features/pricing/types";
import type { PetSpecies } from "@/features/booking/_components/pet-avatar";

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const EDITABLE_STATUSES = ["pending_approval", "confirmed"];

export default async function AdminEditBookingPage({
  params,
}: {
  params: Promise<{ clientId: string; bookingId: string }>;
}) {
  const { clientId, bookingId } = await params;

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();
  const { data: actor } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (actor?.role !== "admin") redirect("/admin");

  const repo = createSupabaseBookingRepository(svc);
  const booking = await repo.getBookingForEdit(bookingId);
  if (!booking || booking.client_id !== clientId) notFound();
  if (!EDITABLE_STATUSES.includes(booking.status))
    redirect(`/admin/clients/${clientId}`);

  const { data: clientRow } = await svc
    .from("profiles")
    .select("full_name, email")
    .eq("id", clientId)
    .single();
  const clientName =
    (clientRow?.full_name as string | null) ??
    (clientRow?.email as string | null) ??
    "client";

  const { data: serviceRow } = await svc
    .from("services")
    .select("id, slug, name, description, pricing_type, default_duration_min")
    .eq("slug", booking.service_slug)
    .single();
  if (!serviceRow) redirect(`/admin/clients/${clientId}`);

  const service: ServiceDetail = {
    slug: serviceRow.slug as string,
    name: serviceRow.name as string,
    description:
      typeof serviceRow.description === "string"
        ? serviceRow.description
        : null,
    pricingType: serviceRow.pricing_type as PricingType,
    defaultDurationMin:
      typeof serviceRow.default_duration_min === "number"
        ? serviceRow.default_duration_min
        : null,
  };

  const { data: feeRow } = await svc
    .from("bookings")
    .select("final_cents")
    .eq("id", bookingId)
    .single();
  const priorFinalCents: number = (feeRow?.final_cents as number | null) ?? 0;

  const loaded = await loadBookingFormData(booking.service_slug);
  if (!loaded.ok) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-destructive">
          Could not load booking settings. Please try again later.
        </p>
      </main>
    );
  }
  const { rules, initialBusy } = loaded.data;

  const { data: petRows } = await svc
    .from("pets")
    .select("id, name, species, breed, notes, photo_url")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  const pets: AssignablePet[] = await Promise.all(
    (petRows ?? []).map(async (p) => {
      let photoUrl: string | null = null;
      if (p.photo_url) {
        const { data } = await svc.storage
          .from("pet-photos")
          .createSignedUrl(p.photo_url as string, SIGNED_URL_TTL_SECONDS);
        photoUrl = data?.signedUrl ?? null;
      }
      return {
        id: p.id as string,
        name: p.name as string,
        species: p.species as PetSpecies,
        breed: typeof p.breed === "string" ? p.breed : null,
        notes: typeof p.notes === "string" ? p.notes : null,
        photoUrl,
      };
    }),
  );

  const initial = {
    startsAtIso: booking.startsAt.toISOString(),
    endsAtIso: booking.endsAt.toISOString(),
    petIds: booking.petIds,
    quantities: quantityStateFromQuoteInputs(
      service.pricingType,
      booking.quote_inputs,
    ),
    comments: booking.comments ?? "",
    wasConfirmed: booking.status === "confirmed",
    isSeriesOccurrence: booking.series_id !== null,
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href={`/admin/clients/${clientId}`}
        className="text-muted-foreground hover:text-foreground mb-6 inline-block text-sm"
      >
        ← {clientName}
      </Link>
      <h1 className="mb-1 text-2xl font-semibold">Edit booking</h1>
      <p className="text-muted-foreground mb-8 text-sm">{service.name}</p>
      <EditBookingClient
        bookingId={bookingId}
        service={service}
        rules={rules}
        initialBusy={initialBusy}
        pets={pets}
        priorFinalCents={priorFinalCents}
        initial={initial}
        admin={{ clientName, paidLock: booking.paidCents > 0 }}
      />
    </main>
  );
}
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(account)/account/bookings/[id]/edit/_components/edit-booking-client.tsx" "src/app/(admin)/admin/clients/[clientId]/bookings/[bookingId]/edit/page.tsx"
git commit -m "feat: add admin booking edit surface"
```

---

## Task 6: Admin create route + `AdminCreateBookingClient`

**Files:**

- Create: `src/app/(admin)/admin/clients/[clientId]/book/_components/service-pick.tsx`
- Create: `src/app/(admin)/admin/clients/[clientId]/book/_components/admin-create-booking-client.tsx`
- Create: `src/app/(admin)/admin/clients/[clientId]/book/page.tsx`

- [ ] **Step 1: Service-pick leaf**

Create `service-pick.tsx`:

```tsx
"use client";

/** Service chooser for admin create-on-behalf. Client is already fixed. */

export interface PickableService {
  slug: string;
  name: string;
  description: string | null;
}

export function ServicePick({
  services,
  onPick,
}: {
  services: PickableService[];
  onPick: (slug: string) => void;
}) {
  return (
    <div>
      <p className="text-brand-strong mb-3 text-xs font-semibold tracking-wide uppercase">
        Which service?
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {services.map((s) => (
          <button
            key={s.slug}
            type="button"
            onClick={() => onPick(s.slug)}
            className="border-border bg-card hover:border-brand focus-visible:ring-ring rounded-xl border p-3 text-left focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="block text-sm font-semibold">{s.name}</span>
            {s.description ? (
              <span className="text-muted-foreground block text-xs">
                {s.description}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the create orchestrator by copying the client booking flow**

Copy `src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx` to `src/app/(admin)/admin/clients/[clientId]/book/_components/admin-create-booking-client.tsx`. Then apply the edits in Steps 3–8. The starting point gives you the proven week-slots/month-range mode logic, hooks, `<Scheduler>` bridge, quantity/pet wiring, debounced preview, and `RecurringControls`.

- [ ] **Step 3: Rename + retype the props**

Replace `ServiceBookingClientProps` / the export name with:

```ts
interface AdminCreateBookingClientProps {
  clientId: string;
  clientName: string;
  service: ServiceDetail;
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
  pets: AssignablePet[];
}

export function AdminCreateBookingClient({
  clientId,
  clientName,
  service,
  rules,
  initialBusy,
  pets,
}: AdminCreateBookingClientProps) {
```

Delete props `authState`, `initialSelection`, `myBookingDayKeys` and every reference to them.

- [ ] **Step 4: Swap the actions to the admin variants**

Replace the imports:

```ts
import { createBookingForClient } from "@/features/booking/actions";
import { previewQuoteForClient } from "@/features/booking/preview-quote-for-client";
```

(remove `import { previewQuote } from "@/features/booking/quote-action";` and `import { createBooking } from "@/features/booking/actions";`).

- [ ] **Step 5: Strip the deferred-auth gate + returnTo**

Remove all deferred-auth logic: the `buildReturnTo` import/usage, the `AuthState` handling, any `redirect to /login|/onboarding` branch, and the `initialSelection` rehydration. The admin route is already admin-gated and the client is fixed, so the flow goes straight to preview/create. Remove the now-unused `Link`, `buttonVariants`, `cn` imports if they’re only used by the auth-gate UI.

- [ ] **Step 6: Add force-confirm state + admin identity header**

Add near the other state:

```ts
const [forceConfirm, setForceConfirm] = useState(false);
```

At the top of the returned JSX add the same identity header as the edit surface:

```tsx
<header className="mb-2">
  <p className="text-brand-strong text-xs font-semibold tracking-wide uppercase">
    Admin · booking on behalf
  </p>
  <p className="text-muted-foreground text-sm">
    for <span className="text-foreground font-medium">{clientName}</span>
  </p>
</header>
```

- [ ] **Step 7: Point preview at the admin action**

Find where the original calls `previewQuote({ ...input })` and replace the call with `previewQuoteForClient`, supplying the fixed `clientId` and current selection (the existing code already assembles `serviceSlug`, `startsAt`, `endsAt`, `quantities`, `petIds`, `recurringRule`):

```ts
const result = await previewQuoteForClient({
  clientId,
  serviceSlug: service.slug,
  startsAt,
  endsAt,
  quantities: quantitiesToRecord(quantities),
  petIds: petAware ? selectedPetIds : undefined,
  recurringRule,
});
// result.kind === "forbidden" → show "admin session expired"; otherwise
// map exactly as the original mapped PreviewResult (success/refuse/...).
```

Keep the original PreviewResult mapping; add a `forbidden` branch that sets an error message. The `success` branch already reads `result.preview` (which now includes `warnings`).

- [ ] **Step 8: Point the submit at the admin create action + render warnings/force-confirm**

Replace the original `createBooking(...)` call in the submit handler with:

```ts
const result = await createBookingForClient({
  clientId,
  serviceSlug: service.slug,
  startsAt,
  endsAt,
  quantities: quantitiesToRecord(quantities),
  petIds: petAware ? selectedPetIds : undefined,
  recurringRule,
  forceConfirm,
});
if (result.kind === "success") {
  toast.add({
    title: "Booking created",
    description: result.warnings.length
      ? `${result.warnings.length} override(s) applied.`
      : undefined,
  });
  router.push(`/admin/clients/${clientId}`);
  router.refresh();
} else if (result.kind === "slot_taken") {
  setError("That time was just taken. Please pick another slot.");
} else {
  setError("Couldn't create the booking. Please check the details.");
}
```

(Adapt `setError`/message state to whatever the copied component already uses for inline errors.)

In the QuotePanel usage, pass the admin props (mirror Task 5 Step 4):

```tsx
            warnings={quote.warnings}
            footer={
              <label className="border-border bg-background flex items-start gap-2 rounded-md border p-2.5 text-sm">
                <input type="checkbox" className="mt-0.5" checked={forceConfirm} onChange={(e) => setForceConfirm(e.target.checked)} />
                <span><span className="font-medium">Confirm immediately</span> — skip pending approval</span>
              </label>
            }
```

- [ ] **Step 9: Create the admin create route/page**

Create `src/app/(admin)/admin/clients/[clientId]/book/page.tsx`:

```tsx
/**
 * Admin create-on-behalf route. Verifies admin, loads the fixed client + their
 * pets + services, renders a service-pick step then the create surface. Service
 * selection is held in client state via AdminCreateBookingFlow below.
 */
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminCreateBookingFlow } from "./_components/admin-create-booking-flow";
import type { PetSpecies } from "@/features/booking/_components/pet-avatar";
import type { AssignablePet } from "@/features/booking/_components/pet-assignment";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export default async function AdminCreateBookingPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();
  const { data: actor } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (actor?.role !== "admin") redirect("/admin");

  const { data: clientRow } = await svc
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", clientId)
    .single();
  if (!clientRow || clientRow.role !== "client") notFound();
  const clientName =
    (clientRow.full_name as string | null) ??
    (clientRow.email as string | null) ??
    "client";

  const { data: serviceRows } = await svc
    .from("services")
    .select("slug, name, description")
    .order("sort_order", { ascending: true });
  const services = (serviceRows ?? []).map((s) => ({
    slug: s.slug as string,
    name: s.name as string,
    description: typeof s.description === "string" ? s.description : null,
  }));

  const { data: petRows } = await svc
    .from("pets")
    .select("id, name, species, breed, notes, photo_url")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  const pets: AssignablePet[] = await Promise.all(
    (petRows ?? []).map(async (p) => {
      let photoUrl: string | null = null;
      if (p.photo_url) {
        const { data } = await svc.storage
          .from("pet-photos")
          .createSignedUrl(p.photo_url as string, SIGNED_URL_TTL_SECONDS);
        photoUrl = data?.signedUrl ?? null;
      }
      return {
        id: p.id as string,
        name: p.name as string,
        species: p.species as PetSpecies,
        breed: typeof p.breed === "string" ? p.breed : null,
        notes: typeof p.notes === "string" ? p.notes : null,
        photoUrl,
      };
    }),
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href={`/admin/clients/${clientId}`}
        className="text-muted-foreground hover:text-foreground mb-6 inline-block text-sm"
      >
        ← {clientName}
      </Link>
      <h1 className="mb-1 text-2xl font-semibold">New booking</h1>
      <p className="text-muted-foreground mb-8 text-sm">for {clientName}</p>
      <AdminCreateBookingFlow
        clientId={clientId}
        clientName={clientName}
        services={services}
        pets={pets}
      />
    </main>
  );
}
```

If `services` has no `sort_order` column, order by `name` instead (check the existing book index query and match it).

- [ ] **Step 10: Create the flow shell that wires service-pick → create surface**

Create `src/app/(admin)/admin/clients/[clientId]/book/_components/admin-create-booking-flow.tsx` — a small client island holding the chosen service + lazily loading per-service rules/busy. Because rules/busy depend on the chosen service slug, fetch them via `loadBookingFormData` on the server is not possible after a client pick; instead load them through a tiny server action OR pass all services and use the existing `useAvailability`/`useBusyRanges` hooks (which already fetch per-service client-side). The create orchestrator already uses `useAvailability`/`useBusyRanges` (client hooks) — so the flow only needs `rules` (booking-rule settings, service-independent) which can be loaded once on the page and passed down.

Add to the page loader (Step 9) a single rules load and pass it:

```ts
import { loadBookingFormData } from "@/features/booking/booking-form-data";
// ...after services:
const loaded = await loadBookingFormData(services[0]?.slug ?? "meet-greet");
const rules = loaded.ok ? loaded.data.rules : null;
```

Pass `rules` to `AdminCreateBookingFlow`. Then:

```tsx
"use client";

import { useState } from "react";
import { ServicePick, type PickableService } from "./service-pick";
import { AdminCreateBookingClient } from "./admin-create-booking-client";
import { useBusyRanges } from "@/features/booking/use-busy-ranges";
import type { AssignablePet } from "@/features/booking/_components/pet-assignment";
import type { BookingRuleSettings } from "@/features/booking/availability";
import type { ServiceDetail } from "@/features/booking/service-detail";
import type { PricingType } from "@/features/pricing/types";

interface FlowService extends PickableService {
  pricingType: PricingType;
  defaultDurationMin: number | null;
}

export function AdminCreateBookingFlow({
  clientId,
  clientName,
  services,
  pets,
  rules,
}: {
  clientId: string;
  clientName: string;
  services: FlowService[];
  pets: AssignablePet[];
  rules: BookingRuleSettings;
}) {
  const [picked, setPicked] = useState<FlowService | null>(null);

  if (!picked) {
    return (
      <ServicePick
        services={services}
        onPick={(slug) =>
          setPicked(services.find((s) => s.slug === slug) ?? null)
        }
      />
    );
  }

  const service: ServiceDetail = {
    slug: picked.slug,
    name: picked.name,
    description: picked.description,
    pricingType: picked.pricingType,
    defaultDurationMin: picked.defaultDurationMin,
  };

  return (
    <AdminCreateBookingClient
      clientId={clientId}
      clientName={clientName}
      service={service}
      rules={rules}
      initialBusy={[]}
      pets={pets}
    />
  );
}
```

`useBusyRanges(service.slug, [])` inside `AdminCreateBookingClient` fetches the chosen service’s busy ranges client-side (it already does this in the copied component), so passing `initialBusy={[]}` is correct. Extend the page’s `services` mapping (Step 9) to also select `pricing_type, default_duration_min` and include `pricingType` / `defaultDurationMin` on each `FlowService`.

- [ ] **Step 11: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add "src/app/(admin)/admin/clients/[clientId]/book"
git commit -m "feat: add admin create-on-behalf booking surface"
```

---

## Task 7: Entry affordances — client detail + calendar

**Files:**

- Modify: `src/app/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx`
- Modify: `src/app/(admin)/admin/bookings/_components/bookings-calendar-client.tsx`

- [ ] **Step 1: Add an editable-status helper + Edit link to client-detail rows**

In `client-detail-client.tsx`, add near the top (after imports):

```ts
import Link from "next/link";

const EDITABLE = new Set(["pending_approval", "confirmed"]);
```

In the Bookings `<section>`, inside each booking row’s `<span className="ml-auto flex gap-2">`, BEFORE the existing approve/cancel buttons, add the Edit affordance:

```tsx
{
  EDITABLE.has(booking.status) ? (
    <Link
      href={`/admin/clients/${client.id}/bookings/${booking.id}/edit`}
      className="border-border hover:bg-accent inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium"
    >
      Edit
    </Link>
  ) : null;
}
```

- [ ] **Step 2: Add the "New booking" button**

At the end of the Bookings `<section>` (after the `</ul>`/empty-state, before `</section>`), add:

```tsx
<Link
  href={`/admin/clients/${client.id}/book`}
  className="bg-brand text-brand-foreground mt-1 inline-flex w-fit items-center rounded-md px-3 py-1.5 text-sm font-semibold"
>
  + New booking for {client.full_name ?? "this client"}
</Link>
```

- [ ] **Step 3: Add the Edit link to the calendar day-list**

In `bookings-calendar-client.tsx`, add `import Link from "next/link";` (already imported). In the day-list row’s `<span className="ml-auto flex gap-2">`, BEFORE the approve/decline buttons, add:

```tsx
{
  booking.status === "pending_approval" || booking.status === "confirmed" ? (
    <Link
      href={`/admin/clients/${booking.client_id}/bookings/${booking.id}/edit`}
      className="border-border hover:bg-accent inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium"
    >
      Edit
    </Link>
  ) : null;
}
```

(`BookingCalendarRow` already carries `client_id` and `id`.)

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx" "src/app/(admin)/admin/bookings/_components/bookings-calendar-client.tsx"
git commit -m "feat: add admin booking create and edit entry points"
```

---

## Task 8: Integration coverage + final verification

**Files:**

- Create: `src/features/booking/admin-create-booking.integration.test.ts`

(Self-cleaning, like `edit-booking.integration.test.ts`. Needs `npx supabase db reset` before running.)

- [ ] **Step 1: Reset the local DB**

Run: `npx supabase db reset`
Expected: migrations + seed applied cleanly.

- [ ] **Step 2: Write the integration test**

Model it on `src/features/booking/edit-booking.integration.test.ts` (same harness/setup helpers). Cover:

```ts
// Build deps with a real service-role repo + a seeded client whose profile is
// far away / has debt, to exercise warn-don't-block.

it("admin create-on-behalf succeeds outside windows with warnings", async () => {
  const result = await createBookingCore(deps, onBehalfInput, ADMIN_POLICY);
  expect(result.kind).toBe("success");
  if (result.kind === "success") {
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.bookingIds.length).toBe(1);
  }
});

it("admin force-confirm inserts a confirmed booking", async () => {
  const result = await createBookingCore(deps, onBehalfInput, {
    ...ADMIN_POLICY,
    forceStatus: "confirmed",
  });
  // read the row back; assert status === "confirmed"
});

it("admin edit of another client's booking succeeds", async () => {
  // seed a booking for client A; call editBookingCore with ADMIN_POLICY and a
  // different actorUserId; expect success (ownership bypassed).
});

it("paid booking: price-affecting admin edit is price_locked, time-only succeeds", async () => {
  // seed a paid booking; petIds/quantities patch → price_locked;
  // startsAt-only patch → success.
});
```

Use `createBookingCore` / `editBookingCore` directly with a service-role repo (the actions’ auth layer is not exercised here — that’s manual/QA).

- [ ] **Step 3: Run the integration test**

Run: `npx vitest run src/features/booking/admin-create-booking.integration.test.ts`
Expected: PASS.

- [ ] **Step 4: Full verification gate**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all PASS.

- [ ] **Step 5: Manual mobile-parity check (acceptance criterion)**

In a browser at narrow + desktop widths, verify: the create service-pick grid, the create + edit surfaces (header, scheduler, warnings block, force-confirm, Save), the client-detail Edit/New affordances, and the calendar Edit link all render and work. No hover-only affordances.

- [ ] **Step 6: Commit**

```bash
git add src/features/booking/admin-create-booking.integration.test.ts
git commit -m "test: cover admin create-on-behalf and edit paths"
```

---

## Self-Review Notes

- **Spec coverage:** Q1 entry points → Task 7. Q2 extend EditBookingClient → Task 5. Q3 create orchestrator + policy-aware core → Tasks 3, 4, 6. Q4 recurring → reused `RecurringControls` (Task 6 copy). Q5 meet-greet → service-pick includes all services (Task 6) + admin policy skips onboarding gate (existing). Q6 force-confirm default off → Tasks 4, 5, 6. Q7 warnings amber above CTA → Tasks 1, 2, 5, 6. D6 paid lock → Task 5 Step 3 + integration Task 8. Q8 nested routes → Tasks 5, 6, 7. `--warning` token → Task 1. Testing → Tasks 3, 8.
- **Type consistency:** `createBookingForClient` / `previewQuoteForClient` / `editBooking` share the same `recurringRule` shape and `forceConfirm` semantics; `CreateBookingResult.success.warnings` is added in Task 3 and consumed in Task 6; `EditBookingClient` `admin` prop defined in Task 5 Step 1 and supplied in Task 5 Step 6.
- **Open verification during execution:** confirm the `services` ordering column (`sort_order` vs `name`) against the existing book index query (Task 6 Step 9); confirm the existing `createBookingCore` success assertions in `booking-service.test.ts` are updated for the new `warnings` field (Task 3 Step 8).

---

_Last reviewed: 2026-06-10_
