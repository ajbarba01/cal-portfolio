# Onboarding + Admin Patch Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the onboarding form's NEXT_REDIRECT bug + error UX, lock the account sidebar during onboarding (and fix nested-route highlighting), live-refresh the post-booking onboarding card, embed the meet-and-greet scheduler in onboarding (off the public services page), and replace the admin onboarding-status button maze with a dropdown.

**Architecture:** Five independent clusters, each independently shippable and committed on its own. Pure logic is extracted into testable helpers (form parsing, active-nav matching, hourly scheduler data, meet-greet-upcoming derivation); UI changes reuse existing primitives (`FormField`, `Select`, `<Scheduler>`, `useConfirm`). The meet-and-greet booking gate in `booking-service` is unchanged — it remains the authoritative guard.

**Tech Stack:** Next.js App Router (React 19 `useActionState`), TypeScript strict, Tailwind + base-ui/shadcn, Supabase, lucide-react, Vitest.

**Spec:** [docs/superpowers/specs/2026-06-09-onboarding-admin-batch-design.md](../specs/2026-06-09-onboarding-admin-batch-design.md)

---

## File Structure

**Cluster A — onboarding form (#1, #2)**

- Modify: `src/features/accounts/onboarding-action.ts` — add `parseOnboardingForm` (pure) + convert `completeOnboarding` to `(prevState, formData)` action; keep `runOnboarding` core.
- Create: `src/features/accounts/onboarding-form.test.ts` — unit test for `parseOnboardingForm`.
- Rewrite: `src/app/(account)/onboarding/_components/info-step.tsx` — `useActionState` + `FormField` inline errors.
- Modify: `src/app/(account)/onboarding/page.tsx` — read `searchParams.returnTo`, pass to `InfoStep`.

**Cluster B — sidebar (#3, #3b)**

- Modify: `src/components/layout/is-active-nav.ts` — add `activeNavHref` (longest-match) pure helper.
- Modify: `src/components/layout/is-active-nav.test.ts` (or create) — tests for `activeNavHref`.
- Rewrite: `src/components/layout/app-sidebar.tsx` — longest-match active highlight + locked state + "Onboarding" entry.
- Modify: `src/components/layout/app-shell.tsx` — thread `locked` through.
- Modify: `src/app/(account)/layout.tsx` — read `onboarding_status`, pass `locked`.

**Cluster C — de-list meet-greet (#5a)**

- Modify: `src/features/booking/services-repo.ts` — exclude `pricing_type = 'meet_greet'`.
- Modify/Create: `src/features/booking/services-repo.test.ts` — assert exclusion.

**Cluster D — embedded meet-greet + poll + retire route (#5b, #4)**

- Create: `src/features/booking/hourly-scheduler-data.ts` — pure `hourlySchedulerData(...)`.
- Create: `src/features/booking/hourly-scheduler-data.test.ts`.
- Modify: `src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx` — use the pure helper (DRY).
- Create: `src/features/booking/booking-form-data.ts` — shared server loader (rules + initial busy).
- Modify: `src/app/(marketing)/book/[serviceSlug]/page.tsx` — use the loader; redirect `meet-greet` → `/onboarding`.
- Create: `src/features/accounts/_components/meet-greet-scheduler.tsx` — slim scheduler client component.
- Create: `src/components/util/refresh-on-interval.tsx` — `RefreshOnInterval`.
- Create: `src/app/(account)/onboarding/_components/meet-greet-step.tsx` — two-state (pick/booked) client component.
- Modify: `src/app/(account)/onboarding/page.tsx` — load rules+busy, render `MeetGreetStep`; widen to "app".

**Cluster E — admin dropdown (#6)**

- Create: `src/features/admin/meet-greet-upcoming.ts` — pure `deriveMeetGreetUpcoming(...)`.
- Create: `src/features/admin/meet-greet-upcoming.test.ts`.
- Modify: `src/features/admin/clients-actions.ts` — add `meetGreetUpcoming` to `ClientListRow` + `listClientsCore`.
- Create: `src/features/admin/_components/onboarding-status-select.tsx` — reusable status dropdown.
- Modify: `src/app/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx` — replace button clusters.
- Modify: `src/app/(admin)/admin/clients/_components/clients-index-client.tsx` — inline status select.

**Cluster F — docs**

- Modify: `docs/DESIGN.md` — meet-greet not publicly listed / scheduled in onboarding; `/book/meet-greet` retired; admin status dropdown.

---

## Cluster A — Onboarding form submission + errors (#1, #2)

### Task A1: Pure form-parsing helper + test

**Files:**

- Modify: `src/features/accounts/onboarding-action.ts`
- Test: `src/features/accounts/onboarding-form.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/accounts/onboarding-form.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseOnboardingForm } from "./onboarding-action";

function fd(values: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

const valid = {
  full_name: "Test User",
  phone: "303-555-0100",
  address: "123 Main St",
  zip: "80301",
  contact_name: "Jane Doe",
  contact_phone: "303-555-0101",
  contact_relationship: "Spouse",
  vet_name: "Boulder Vet",
  vet_phone: "303-555-0102",
};

describe("parseOnboardingForm", () => {
  it("returns ok with parsed input for valid data", () => {
    const r = parseOnboardingForm(fd(valid));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.profile.full_name).toBe("Test User");
      expect(r.input.emergency.contact_name).toBe("Jane Doe");
    }
  });

  it("returns per-field errors for empty required fields", () => {
    const r = parseOnboardingForm(fd({ ...valid, full_name: "", zip: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors.full_name).toBeTruthy();
      expect(r.fieldErrors.zip).toBeTruthy();
      expect(r.fieldErrors.phone).toBeUndefined();
    }
  });

  it("returns the zip format message for a malformed zip", () => {
    const r = parseOnboardingForm(fd({ ...valid, zip: "abcde" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.zip).toMatch(/valid 5-digit ZIP/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/accounts/onboarding-form.test.ts`
Expected: FAIL — `parseOnboardingForm` is not exported.

- [ ] **Step 3: Add the pure helper + form state type to `onboarding-action.ts`**

Add these exports near the top of `src/features/accounts/onboarding-action.ts` (after the existing imports; `profileSchema` and `emergencySchema` are already imported):

```ts
/** Result state returned to the onboarding form via useActionState. */
export type OnboardingFormState =
  | { status: "idle" }
  | { status: "error"; fieldErrors: Record<string, string> };

/**
 * Pure: read + validate the onboarding form fields. Returns either the parsed
 * OnboardingInput or per-field error messages (first message per field). No IO,
 * no auth — unit-tested directly.
 */
export function parseOnboardingForm(
  formData: FormData,
):
  | { ok: true; input: OnboardingInput }
  | { ok: false; fieldErrors: Record<string, string> } {
  const str = (k: string) => String(formData.get(k) ?? "");

  const profile = profileSchema.safeParse({
    full_name: str("full_name"),
    phone: str("phone"),
    address: str("address"),
    zip: str("zip"),
  });
  const emergency = emergencySchema.safeParse({
    contact_name: str("contact_name"),
    contact_phone: str("contact_phone"),
    contact_relationship: str("contact_relationship"),
    vet_name: str("vet_name"),
    vet_phone: str("vet_phone"),
  });

  if (profile.success && emergency.success) {
    return {
      ok: true,
      input: { profile: profile.data, emergency: emergency.data },
    };
  }

  const fieldErrors: Record<string, string> = {};
  const collect = (errs: Record<string, string[] | undefined>) => {
    for (const [k, msgs] of Object.entries(errs)) {
      if (msgs && msgs[0]) fieldErrors[k] = msgs[0];
    }
  };
  if (!profile.success) collect(profile.error.flatten().fieldErrors);
  if (!emergency.success) collect(emergency.error.flatten().fieldErrors);
  return { ok: false, fieldErrors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/accounts/onboarding-form.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/onboarding-action.ts src/features/accounts/onboarding-form.test.ts
git commit -m "feat: pure onboarding form parser with per-field errors"
```

### Task A2: Convert `completeOnboarding` to a form action

**Files:**

- Modify: `src/features/accounts/onboarding-action.ts:116-137`

- [ ] **Step 1: Replace the `completeOnboarding` signature**

Replace the existing `completeOnboarding` function (currently `(input, returnTo?)`) with the action-state form:

```ts
/**
 * Server action bound via useActionState. Authenticates, validates the form,
 * runs onboarding, then redirects on success. On validation failure it returns
 * field errors as state (NO throw), so the client never try/catches a redirect.
 */
export async function completeOnboarding(
  _prevState: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const parsed = parseOnboardingForm(formData);
  if (!parsed.ok) {
    return { status: "error", fieldErrors: parsed.fieldErrors };
  }

  const serviceClient = createServiceClient();
  await runOnboarding(
    { serviceClient, userId: user.id, geocoder: defaultGeocoder },
    parsed.input,
  );

  const returnTo = formData.get("returnTo");
  redirect(
    safeReturnTo(typeof returnTo === "string" ? returnTo : undefined) ??
      "/account",
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no callers of the old 2-arg signature remain after Task A3; if tsc flags `info-step.tsx`, proceed to A3 then re-run).

- [ ] **Step 3: Commit** (after A3 typechecks clean)

Deferred to A3's commit (these two files must compile together).

### Task A3: Rewrite `InfoStep` with `useActionState` + inline errors

**Files:**

- Rewrite: `src/app/(account)/onboarding/_components/info-step.tsx`
- Modify: `src/app/(account)/onboarding/page.tsx`

- [ ] **Step 1: Rewrite `info-step.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import {
  completeOnboarding,
  type OnboardingFormState,
} from "@/features/accounts/onboarding-action";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";

const INITIAL: OnboardingFormState = { status: "idle" };

/**
 * Step 1 — profile + emergency info form. Bound to completeOnboarding via
 * useActionState: validation errors come back as state and render inline under
 * each field; on success the action redirects (framework-handled, no try/catch).
 */
export function InfoStep({ returnTo }: { returnTo?: string }) {
  const [state, formAction, isPending] = useActionState(
    completeOnboarding,
    INITIAL,
  );
  const errors = state.status === "error" ? state.fieldErrors : {};

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {returnTo ? (
        <input type="hidden" name="returnTo" value={returnTo} />
      ) : null}

      <fieldset className="bg-card border-border flex flex-col gap-4 rounded-xl border p-5">
        <legend className="text-brand-strong mb-1 text-xs font-semibold tracking-wide uppercase">
          Your profile
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Full name"
            name="full_name"
            type="text"
            autoComplete="name"
            error={errors.full_name}
            required
          />
          <FormField
            label="Phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            error={errors.phone}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Street address"
            name="address"
            type="text"
            autoComplete="street-address"
            error={errors.address}
            required
          />
          <FormField
            label="ZIP code"
            name="zip"
            type="text"
            autoComplete="postal-code"
            inputMode="numeric"
            maxLength={10}
            error={errors.zip}
            required
          />
        </div>
      </fieldset>

      <fieldset className="bg-card border-border flex flex-col gap-4 rounded-xl border p-5">
        <legend className="text-brand-strong mb-1 text-xs font-semibold tracking-wide uppercase">
          Emergency contact
        </legend>
        <FormField
          label="Contact name"
          name="contact_name"
          type="text"
          error={errors.contact_name}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Contact phone"
            name="contact_phone"
            type="tel"
            error={errors.contact_phone}
            required
          />
          <FormField
            label="Relationship"
            name="contact_relationship"
            type="text"
            placeholder="e.g. Parent, Spouse, Friend"
            error={errors.contact_relationship}
            required
          />
        </div>
      </fieldset>

      <fieldset className="bg-card border-border flex flex-col gap-4 rounded-xl border p-5">
        <legend className="text-brand-strong mb-1 text-xs font-semibold tracking-wide uppercase">
          Veterinarian
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Vet name or clinic"
            name="vet_name"
            type="text"
            error={errors.vet_name}
            required
          />
          <FormField
            label="Vet phone"
            name="vet_phone"
            type="tel"
            error={errors.vet_phone}
            required
          />
        </div>
      </fieldset>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Saving…" : "Continue →"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Pass `returnTo` from the server page**

In `src/app/(account)/onboarding/page.tsx`, update the signature to accept `searchParams` and pass `returnTo` to `InfoStep`. Change the function declaration:

```tsx
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const returnToParam = sp.returnTo;
  const returnTo =
    typeof returnToParam === "string" ? returnToParam : undefined;
```

…and in the `info_pending` branch render `<InfoStep returnTo={returnTo} />` instead of `<InfoStep />`.

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/app/(account)/onboarding src/features/accounts/onboarding-action.ts`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Visit `/onboarding` as an `info_pending` user. (a) Submit empty → inline errors appear under the invalid fields, no banner, no NEXT_REDIRECT. (b) Submit valid → advances to step 2 on the **first** click with no error flash.

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/onboarding-action.ts src/app/(account)/onboarding/_components/info-step.tsx src/app/(account)/onboarding/page.tsx
git commit -m "fix: onboarding form action removes NEXT_REDIRECT and shows inline errors"
```

---

## Cluster B — Sidebar locked + nested highlight (#3, #3b)

### Task B1: `activeNavHref` longest-match helper + test

**Files:**

- Modify: `src/components/layout/is-active-nav.ts`
- Test: `src/components/layout/is-active-nav.test.ts`

- [ ] **Step 1: Write the failing test**

Append to (or create) `src/components/layout/is-active-nav.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { activeNavHref } from "./is-active-nav";

const ACCOUNT = [
  "/account",
  "/account/pets",
  "/account/forms",
  "/account/bookings",
];
const ADMIN = ["/admin", "/admin/clients", "/admin/bookings"];

describe("activeNavHref", () => {
  it("picks the most specific (longest) matching href", () => {
    expect(activeNavHref("/account/pets", ACCOUNT)).toBe("/account/pets");
  });
  it("matches the index route exactly", () => {
    expect(activeNavHref("/account", ACCOUNT)).toBe("/account");
  });
  it("stays active on a nested detail route", () => {
    expect(activeNavHref("/admin/clients/abc-123", ADMIN)).toBe(
      "/admin/clients",
    );
  });
  it("returns null when nothing matches", () => {
    expect(activeNavHref("/services", ACCOUNT)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/is-active-nav.test.ts`
Expected: FAIL — `activeNavHref` not exported.

- [ ] **Step 3: Add `activeNavHref` to `is-active-nav.ts`**

```ts
/**
 * Returns the href that should be highlighted for `pathname`, choosing the most
 * specific (longest) matching section so `/account/pets` highlights Pets, not
 * Profile. Returns null if no item matches.
 */
export function activeNavHref(
  pathname: string,
  hrefs: string[],
): string | null {
  const matches = hrefs.filter((h) => isActiveSection(pathname, h));
  if (matches.length === 0) return null;
  return matches.reduce((best, h) => (h.length > best.length ? h : best));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/layout/is-active-nav.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/is-active-nav.ts src/components/layout/is-active-nav.test.ts
git commit -m "feat: longest-match active-nav helper"
```

### Task B2: Locked sidebar + Onboarding entry + nested highlight

**Files:**

- Rewrite: `src/components/layout/app-sidebar.tsx`
- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/app/(account)/layout.tsx`

- [ ] **Step 1: Rewrite `app-sidebar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { activeNavHref } from "./is-active-nav";
import type { ZoneNav } from "./nav-config";
import { Lock, LogOut } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";

const ONBOARDING_HREF = "/onboarding";

export function AppSidebar({
  nav,
  identity,
  locked = false,
}: {
  nav: ZoneNav;
  identity: string;
  /** When true (account zone, onboarding incomplete), real tabs are disabled and an active "Onboarding" entry is shown. */
  locked?: boolean;
}) {
  const pathname = usePathname();

  const hrefs = nav.items.map((i) => i.href);
  const activeHref = activeNavHref(
    pathname,
    locked ? [ONBOARDING_HREF, ...hrefs] : hrefs,
  );

  const itemBase =
    "flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm transition-colors duration-200 ease-out focus-visible:outline-2 focus-visible:-outline-offset-2 md:min-h-9";
  const activeCls = "bg-sidebar-active text-brand-strong font-semibold";
  const idleCls = "text-foreground hover:bg-sidebar-accent";

  return (
    <div className="flex h-full flex-col">
      <p className="text-muted-foreground px-4 pt-3 pb-1 text-xs font-medium tracking-wide uppercase">
        {nav.zoneLabel}
      </p>
      <nav
        aria-label={`${nav.zoneLabel} sections`}
        className="flex flex-col px-2"
      >
        {locked ? (
          <Link
            href={ONBOARDING_HREF}
            aria-current={activeHref === ONBOARDING_HREF ? "page" : undefined}
            className={cn(
              itemBase,
              activeHref === ONBOARDING_HREF ? activeCls : idleCls,
            )}
          >
            Onboarding
          </Link>
        ) : null}

        {nav.items.map(({ href, label }) =>
          locked ? (
            <span
              key={href}
              aria-disabled="true"
              title="Available after onboarding"
              className={cn(
                itemBase,
                "text-muted-foreground/60 cursor-not-allowed",
              )}
            >
              <Lock className="size-3.5" aria-hidden="true" />
              {label}
            </span>
          ) : (
            <Link
              key={href}
              href={href}
              aria-current={activeHref === href ? "page" : undefined}
              className={cn(
                itemBase,
                activeHref === href ? activeCls : idleCls,
              )}
            >
              {label}
            </Link>
          ),
        )}
      </nav>
      <div className="border-border mt-auto flex flex-col gap-2 border-t p-4">
        <span className="text-muted-foreground text-xs">{identity}</span>
        <SignOutButton className="bg-destructive-warm/10 text-destructive-warm hover:bg-destructive-warm/20 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2">
          <LogOut className="size-4" /> Sign out
        </SignOutButton>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Thread `locked` through `app-shell.tsx`**

In `src/components/layout/app-shell.tsx`, add `locked` to props and pass it down:

```tsx
export function AppShell({
  nav,
  identity,
  locked = false,
  children,
}: {
  nav: ZoneNav;
  identity: string;
  locked?: boolean;
  children: React.ReactNode;
}) {
```

…and `<AppSidebar nav={nav} identity={identity} locked={locked} />`.

- [ ] **Step 3: Pass `locked` from the account layout**

In `src/app/(account)/layout.tsx`, extend the profile select to include `onboarding_status` and compute `locked`:

```tsx
const { data: profile } = await supabase
  .from("profiles")
  .select("full_name, onboarding_status")
  .eq("id", user.id)
  .single();
const identity = profile?.full_name ?? user.email ?? "Signed in";
const locked = profile?.onboarding_status !== "approved";

return (
  <PageShell zoneNav={accountNav}>
    <AppShell nav={accountNav} identity={identity} locked={locked}>
      {children}
    </AppShell>
  </PageShell>
);
```

(The admin layout passes no `locked` prop → defaults `false`; admins are always approved.)

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/components/layout "src/app/(account)/layout.tsx"`
Expected: PASS.

- [ ] **Step 5: Manual verification**

`npm run dev`. (a) As an un-approved user on `/onboarding`: sidebar shows an active **Onboarding** entry; Profile/Pets/Forms/Bookings are grayed with a lock icon, not clickable, `aria-disabled`. (b) As an approved user: normal links, no Onboarding entry. (c) Visit `/admin/clients/<id>`: the **Clients** admin tab stays highlighted.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/app-sidebar.tsx src/components/layout/app-shell.tsx "src/app/(account)/layout.tsx"
git commit -m "feat: lock account sidebar during onboarding and fix nested-route highlight"
```

---

## Cluster C — Remove meet-greet from the services page (#5a)

### Task C1: Exclude `meet_greet` from `listActiveServices`

**Files:**

- Modify: `src/features/booking/services-repo.ts:49-60`
- Test: `src/features/booking/services-repo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/booking/services-repo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { listActiveServices } from "./services-repo";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Minimal fake: records the chained query and returns canned rows. */
function fakeClient(rows: unknown[], capture: { neq?: [string, string] }) {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.neq = (col: string, val: string) => {
    capture.neq = [col, val];
    return builder;
  };
  builder.order = () => Promise.resolve({ data: rows, error: null });
  return { from: () => builder } as unknown as SupabaseClient;
}

const walkRow = {
  slug: "walk",
  name: "Dog Walk",
  description: "A walk",
  pricing_type: "walk",
  pricing_config: { perVisitCents: 2000 },
  concurrency: "exclusive",
  default_duration_min: 30,
  max_pets: 1,
};

describe("listActiveServices", () => {
  it("filters out the meet_greet pricing type at the query level", async () => {
    const capture: { neq?: [string, string] } = {};
    await listActiveServices(fakeClient([walkRow], capture));
    expect(capture.neq).toEqual(["pricing_type", "meet_greet"]);
  });
});
```

(If `walkRow.pricing_config` fails `parsePricingConfig`, the row is skipped but the `.neq` assertion still holds — the test asserts the query filter, which is the contract.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/services-repo.test.ts`
Expected: FAIL — `capture.neq` is undefined (no `.neq` call yet).

- [ ] **Step 3: Add the filter**

In `src/features/booking/services-repo.ts`, add `.neq("pricing_type", "meet_greet")` to the query chain and update the doc comment:

```ts
const { data, error } = await supabase
  .from("services")
  .select(
    "slug, name, description, pricing_type, pricing_config, concurrency, default_duration_min, max_pets",
  )
  .eq("active", true)
  // Meet-and-greet is scheduled only within onboarding (see DESIGN.md), never
  // listed as a public bookable service.
  .neq("pricing_type", "meet_greet")
  .order("sort_order");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/booking/services-repo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/services-repo.ts src/features/booking/services-repo.test.ts
git commit -m "feat: exclude meet-greet from the public services list"
```

---

## Cluster D — Embed meet-greet in onboarding + poll + retire route (#5b, #4)

### Task D1: Extract pure `hourlySchedulerData` + test

**Files:**

- Create: `src/features/booking/hourly-scheduler-data.ts`
- Test: `src/features/booking/hourly-scheduler-data.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/booking/hourly-scheduler-data.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hourlySchedulerData } from "./hourly-scheduler-data";
import type { BookingRuleSettings } from "./availability";

const rules: BookingRuleSettings = {
  bookingOpenMinute: 9 * 60,
  bookingCloseMinute: 17 * 60,
  minLeadTimeHours: 1,
  hardMaxAdvanceDays: 14,
};

describe("hourlySchedulerData", () => {
  it("returns the week-slots SchedulerData shape with empty busyResident", () => {
    const now = new Date("2026-06-10T12:00:00Z");
    const data = hourlySchedulerData({
      now,
      openWindows: [],
      busy: [],
      durationMin: 30,
      rules,
      myBookings: new Set<string>(),
    });
    expect(Array.isArray(data.overnightNights)).toBe(true);
    expect(data.busyResident).toEqual([]); // hourly days are never whole-day busy
    expect(data.rules).toBe(rules);
    expect(data.now).toBe(now);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/hourly-scheduler-data.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure helper**

Create `src/features/booking/hourly-scheduler-data.ts`. This lifts the week-slots derivation out of `service-booking-client.tsx` verbatim (the `availableDayKeys` + `schedulerData` logic):

```ts
import { denverMidnight, denverDayKey } from "./availability";
import { hourlyAvailableDayKeys } from "./calendar-model";
import type { BookingRuleSettings, TimeRange } from "./availability";
import type { SchedulerData, BusyBlock } from "./_components/scheduler";

export interface HourlySchedulerDataInput {
  now: Date;
  openWindows: TimeRange[];
  busy: BusyBlock[];
  durationMin: number;
  rules: BookingRuleSettings;
  myBookings: Set<string>;
}

/**
 * Pure: builds the week-slots SchedulerData for an hourly (time-slot) service.
 * A day is "available" only if it has >= 1 open start for the chosen duration
 * after busy-filtering, so changing duration re-derives availability.
 * Extracted from ServiceBookingClient so the onboarding meet-greet scheduler
 * and the booking page share one derivation.
 */
export function hourlySchedulerData({
  now,
  openWindows,
  busy,
  durationMin,
  rules,
  myBookings,
}: HourlySchedulerDataInput): SchedulerData {
  const days: Date[] = [];
  const seen = new Set<string>();
  for (let i = 0; i <= rules.hardMaxAdvanceDays; i++) {
    const key = denverDayKey(new Date(now.getTime() + i * 86_400_000));
    if (seen.has(key)) continue;
    seen.add(key);
    days.push(denverMidnight(key));
  }

  const overnightNights = hourlyAvailableDayKeys({
    days,
    windows: openWindows,
    busy,
    durationMin,
    granularityMin: 15,
  });

  return {
    overnightNights,
    windows: openWindows,
    busy,
    busyResident: [], // hourly days are never whole-day busy; busy only blocks slots
    myBookings,
    rules,
    now,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/booking/hourly-scheduler-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/hourly-scheduler-data.ts src/features/booking/hourly-scheduler-data.test.ts
git commit -m "feat: extract pure hourly scheduler-data builder"
```

### Task D2: Use `hourlySchedulerData` in `ServiceBookingClient` (DRY)

**Files:**

- Modify: `src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx:255-307`

- [ ] **Step 1: Replace the inline `availableDayKeys` + `schedulerData` memos**

Import the helper at the top:

```tsx
import { hourlySchedulerData } from "@/features/booking/hourly-scheduler-data";
```

Replace the `availableDayKeys` and `schedulerData` `useMemo` blocks (the week-slots branch) so the week-slots case delegates to the helper while month-range keeps its existing shape:

```tsx
const schedulerData = useMemo<SchedulerData>(() => {
  if (mode === "week-slots") {
    return hourlySchedulerData({
      now,
      openWindows,
      busy: busyRanges,
      durationMin,
      rules,
      myBookings,
    });
  }
  return {
    overnightNights,
    windows: openWindows,
    busy: busyRanges,
    busyResident: busyRanges,
    myBookings,
    rules,
    now,
  };
}, [
  mode,
  overnightNights,
  openWindows,
  busyRanges,
  durationMin,
  rules,
  myBookings,
  now,
]);
```

Delete the now-unused `availableDayKeys` memo and the `hourlyAvailableDayKeys` / `denverMidnight` imports if no longer referenced (let `tsc`/eslint flag unused).

- [ ] **Step 2: Typecheck + run booking tests**

Run: `npx tsc --noEmit && npx vitest run src/features/booking`
Expected: PASS — behavior unchanged (pure extraction).

- [ ] **Step 3: Manual smoke**

`npm run dev`, open `/book/walk`, confirm the month grid + day timeline still mark available days and times correctly.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx"
git commit -m "refactor: book client reuses shared hourly scheduler-data builder"
```

### Task D3: Shared `booking-form-data` server loader

**Files:**

- Create: `src/features/booking/booking-form-data.ts`
- Modify: `src/app/(marketing)/book/[serviceSlug]/page.tsx:72-98`

- [ ] **Step 1: Create the loader**

Create `src/features/booking/booking-form-data.ts`:

```ts
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { getPublicBusyRanges } from "./busy-ranges";
import type { BookingRuleSettings } from "./availability";
import type { PublicBusyRange } from "./busy-ranges";

export interface BookingFormData {
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
}

export type LoadBookingFormDataResult =
  | { ok: true; data: BookingFormData }
  | { ok: false };

/**
 * Loads the booking-rule settings + initial public busy ranges for a service's
 * class. Shared by the /book page and the onboarding meet-greet scheduler so the
 * settings query isn't duplicated.
 */
export async function loadBookingFormData(
  serviceSlug: string,
): Promise<LoadBookingFormDataResult> {
  const svc = createServiceClient();

  const { data: settingsData, error } = await svc
    .from("settings")
    .select(
      "booking_open_minute, booking_close_minute, min_lead_time_hours, hard_max_advance_days",
    )
    .limit(1)
    .single();

  if (error || !settingsData) return { ok: false };

  const rules: BookingRuleSettings = {
    bookingOpenMinute: settingsData.booking_open_minute as number,
    bookingCloseMinute: settingsData.booking_close_minute as number,
    minLeadTimeHours: settingsData.min_lead_time_hours as number,
    hardMaxAdvanceDays: settingsData.hard_max_advance_days as number,
  };

  const initialBusy = await getPublicBusyRanges(serviceSlug);
  return { ok: true, data: { rules, initialBusy } };
}
```

- [ ] **Step 2: Use it in the book page**

In `src/app/(marketing)/book/[serviceSlug]/page.tsx`, replace the inline `settings` query + `getPublicBusyRanges` call (lines ~72-98) with:

```tsx
const loaded = await loadBookingFormData(serviceSlug);
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
```

Add the import `import { loadBookingFormData } from "@/features/booking/booking-form-data";` and remove the now-unused `getPublicBusyRanges` import if unreferenced.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/booking/booking-form-data.ts "src/app/(marketing)/book/[serviceSlug]/page.tsx"
git commit -m "refactor: shared booking form-data loader for book page and onboarding"
```

### Task D4: `MeetGreetScheduler` component

**Files:**

- Create: `src/features/accounts/_components/meet-greet-scheduler.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvailability } from "@/features/booking/use-availability";
import { useBusyRanges } from "@/features/booking/use-busy-ranges";
import { hourlySchedulerData } from "@/features/booking/hourly-scheduler-data";
import { denverMidnight } from "@/features/booking/availability";
import { createBooking } from "@/features/booking/actions";
import { Scheduler } from "@/features/booking/_components/scheduler";
import { BOOK_WALK_CAPABILITIES } from "@/features/booking/schedule-capabilities";
import { ErrorState } from "@/components/feedback/error-state";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/feedback/toast";
import type {
  SchedulerData,
  BusyBlock,
} from "@/features/booking/_components/scheduler";
import type { ScheduleSelectionState } from "@/features/booking/schedule-selection";
import type { BookingRuleSettings } from "@/features/booking/availability";
import type { PublicBusyRange } from "@/features/booking/busy-ranges";

const MEET_GREET_SLUG = "meet-greet";

export function MeetGreetScheduler({
  rules,
  initialBusy,
  durationMin = 30,
  onBooked,
}: {
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
  durationMin?: number;
  /** Called after a successful booking (parent re-renders into booked state). */
  onBooked?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const now = useMemo(() => new Date(), []);
  const durationMs = durationMin * 60_000;

  const { openWindows, loading, error } = useAvailability({
    durationMs,
    rules,
  });
  const { busy, refresh: refreshBusy } = useBusyRanges(
    MEET_GREET_SLUG,
    initialBusy,
  );

  const busyRanges = useMemo<BusyBlock[]>(
    () =>
      busy.map((b) => ({
        startsAt: new Date(b.startsAt),
        endsAt: new Date(b.endsAt),
        id: `pub-${b.startsAt}-${b.endsAt}`,
      })),
    [busy],
  );

  const data = useMemo<SchedulerData>(
    () =>
      hourlySchedulerData({
        now,
        openWindows,
        busy: busyRanges,
        durationMin,
        rules,
        myBookings: new Set<string>(),
      }),
    [now, openWindows, busyRanges, durationMin, rules],
  );

  const capabilities = useMemo(
    () => ({
      ...BOOK_WALK_CAPABILITIES,
      weekNavigable: false,
      intervalMinutes: durationMin,
    }),
    [durationMin],
  );

  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [isSubmitting, startSubmitting] = useTransition();

  const onSelectionChange = useCallback((state: ScheduleSelectionState) => {
    if (state.gridDraft.size === 0) {
      setSelectedStart(null);
      return;
    }
    const [cell] = state.gridDraft;
    const atIdx = cell.indexOf("@");
    if (atIdx === -1) return;
    const dayKey = cell.slice(0, atIdx);
    const minute = parseInt(cell.slice(atIdx + 1), 10);
    if (isNaN(minute)) return;
    setSelectedStart(
      new Date(denverMidnight(dayKey).getTime() + minute * 60_000),
    );
  }, []);

  function handleConfirm() {
    if (!selectedStart) return;
    const startsAt = selectedStart;
    const endsAt = new Date(startsAt.getTime() + durationMs);
    startSubmitting(async () => {
      const result = await createBooking({
        serviceSlug: MEET_GREET_SLUG,
        startsAt,
        endsAt,
        quantities: {},
      });
      if (result.kind === "success") {
        toast.add({ title: "Meet & greet booked" });
        void refreshBusy();
        onBooked?.();
        router.refresh();
      } else {
        toast.add({
          title: "Couldn't book",
          description: `Please try another time (${result.kind}).`,
          type: "error",
        });
      }
    });
  }

  if (error) {
    return <ErrorState title="Couldn't load availability" message={error} />;
  }
  if (loading) {
    return (
      <p className="text-muted-foreground text-sm">Loading availability…</p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Scheduler
        capabilities={capabilities}
        data={data}
        onSelectionChange={onSelectionChange}
      >
        <Scheduler.MonthGrid />
        <Scheduler.Legend className="mt-5" />
        <div className="mt-6">
          <Scheduler.DayTimeline />
        </div>
        <Scheduler.BookingDetailsPanel />
      </Scheduler>
      <Button
        onClick={handleConfirm}
        disabled={!selectedStart || isSubmitting}
        className="w-full sm:w-auto"
      >
        {isSubmitting ? "Booking…" : "Confirm meet & greet"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (`createBooking` accepts `quantities: {}` — `parseQuantities` accepts an empty object for `meet_greet`, confirmed in `booking-service.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/features/accounts/_components/meet-greet-scheduler.tsx
git commit -m "feat: slim meet-greet scheduler component"
```

### Task D5: `RefreshOnInterval` utility

**Files:**

- Create: `src/components/util/refresh-on-interval.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Mounts a timer that calls router.refresh() every `ms`. Used on the onboarding
 * booked-state card so that when Cal approves, the next refresh re-runs the
 * server component and hits its approved -> /account redirect. Clears on unmount.
 */
export function RefreshOnInterval({ ms = 15_000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), ms);
    return () => clearInterval(id);
  }, [router, ms]);
  return null;
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add src/components/util/refresh-on-interval.tsx
git commit -m "feat: RefreshOnInterval polling helper"
```

### Task D6: `MeetGreetStep` two-state client + onboarding page wiring

**Files:**

- Create: `src/app/(account)/onboarding/_components/meet-greet-step.tsx`
- Modify: `src/app/(account)/onboarding/page.tsx`

- [ ] **Step 1: Create `meet-greet-step.tsx`**

```tsx
"use client";

import { useState } from "react";
import { PawPrint, CalendarCheck, Clock } from "lucide-react";
import { MeetGreetScheduler } from "@/features/accounts/_components/meet-greet-scheduler";
import { RefreshOnInterval } from "@/components/util/refresh-on-interval";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BookingRuleSettings } from "@/features/booking/availability";
import type { PublicBusyRange } from "@/features/booking/busy-ranges";

/** Format a UTC ISO string to a human-friendly date+time in America/Denver. */
function formatDenver(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function MeetGreetStep({
  rules,
  initialBusy,
  bookingStartsAt,
}: {
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
  /** ISO start of the active meet-greet booking, or null if none yet. */
  bookingStartsAt: string | null;
}) {
  // When a booking exists we show the collapsed status card; "View / reschedule"
  // re-opens the scheduler inline. No booking => scheduler is shown directly.
  const [rescheduling, setRescheduling] = useState(false);
  const showScheduler = bookingStartsAt === null || rescheduling;

  return (
    <div className="bg-card border-border flex flex-col gap-5 rounded-xl border p-6">
      {/* Intro */}
      <div className="border-border/60 flex items-center gap-3 border-b pb-4">
        <div
          aria-hidden="true"
          className="bg-section-alt text-brand flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
        >
          <PawPrint className="size-6" />
        </div>
        <p className="text-foreground text-sm leading-relaxed">
          A free, ~30-minute in-person visit so Cal can meet you and your pets
          before your first booking.
        </p>
      </div>

      {bookingStartsAt !== null && !rescheduling ? (
        <>
          <RefreshOnInterval />
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="bg-status-available text-status-available-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            >
              <CalendarCheck className="size-5" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                Meet &amp; greet booked
              </p>
              <p className="font-heading text-foreground text-lg font-semibold">
                {formatDenver(bookingStartsAt)}
              </p>
            </div>
          </div>
          <div>
            <Badge variant="pending">
              <Clock className="size-3.5" aria-hidden="true" /> Awaiting
              Cal&apos;s confirmation
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            After your visit, Cal will confirm you and your booking opens up.
            We&apos;ll email you.
          </p>
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => setRescheduling(true)}
          >
            View / reschedule
          </Button>
        </>
      ) : null}

      {showScheduler ? (
        <MeetGreetScheduler
          rules={rules}
          initialBusy={initialBusy}
          onBooked={() => setRescheduling(false)}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Wire the onboarding page**

In `src/app/(account)/onboarding/page.tsx`:

- Add imports:
  ```tsx
  import { MeetGreetStep } from "./_components/meet-greet-step";
  import { loadBookingFormData } from "@/features/booking/booking-form-data";
  ```
- In the `meet_greet_pending` block, load the form data once (after computing `activeBookingStartsAt`):
  ```tsx
  let meetGreetFormData = null as Awaited<
    ReturnType<typeof loadBookingFormData>
  > | null;
  if (status === "meet_greet_pending") {
    meetGreetFormData = await loadBookingFormData("meet-greet");
  }
  ```
- Replace **both** `meet_greet_pending` render branches (the "no booking" CTA card and the "has booking" status card) with a single branch using `MeetGreetStep`, widened to `width="app"`:
  ```tsx
  if (status === "meet_greet_pending") {
    if (!meetGreetFormData || !meetGreetFormData.ok) {
      return (
        <PageContainer width="app" className="py-10">
          <StepBar step={2} />
          <p className="text-destructive">
            Could not load scheduling. Please try again later.
          </p>
        </PageContainer>
      );
    }
    return (
      <PageContainer width="app" className="py-10">
        <StepBar step={2} />
        <PageHeader
          title="Schedule your meet &amp; greet"
          subtitle="Before your first booking, Cal comes by to meet you and your pets in person."
        />
        <MeetGreetStep
          rules={meetGreetFormData.data.rules}
          initialBusy={meetGreetFormData.data.initialBusy}
          bookingStartsAt={activeBookingStartsAt}
        />
      </PageContainer>
    );
  }
  ```
- Remove the now-unused `Link`, `buttonVariants`, `cn` imports if no other branch uses them (the declined branch still uses `buttonVariants`/`cn`/`Link` — keep them; let eslint confirm). Remove the old `formatDenver` from the page **only if** unused after the change (the declined branch does not use it; `MeetGreetStep` has its own copy) — let eslint flag it.

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint "src/app/(account)/onboarding"`
Expected: PASS.

- [ ] **Step 4: Manual verification**

`npm run dev`, as a `meet_greet_pending` user with **no** booking: the embedded scheduler shows (month grid + times). Pick a slot → Confirm → the card collapses to the booked status card with "Awaiting Cal's confirmation". Click **View / reschedule** → the scheduler re-opens. In another browser, approve the client in admin; within ~15s the booked card auto-redirects to `/account`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(account)/onboarding/_components/meet-greet-step.tsx" "src/app/(account)/onboarding/page.tsx"
git commit -m "feat: embed meet-greet scheduler in onboarding with collapse and live refresh"
```

### Task D7: Retire `/book/meet-greet`

**Files:**

- Modify: `src/app/(marketing)/book/[serviceSlug]/page.tsx`

- [ ] **Step 1: Redirect the meet-greet slug**

At the top of `ServiceBookingPage`, right after `const { serviceSlug } = await params;`, add:

```tsx
// Meet-and-greet is scheduled only within onboarding (see DESIGN.md).
if (serviceSlug === "meet-greet") {
  redirect("/onboarding");
}
```

Add `import { redirect } from "next/navigation";` (the file currently imports `notFound` from the same module — extend that import).

- [ ] **Step 2: Typecheck + manual**

Run: `npx tsc --noEmit`. Then `npm run dev`, visit `/book/meet-greet` → redirects to `/onboarding`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(marketing)/book/[serviceSlug]/page.tsx"
git commit -m "feat: retire /book/meet-greet in favor of onboarding scheduling"
```

---

## Cluster E — Admin onboarding-status dropdown (#6)

### Task E1: Pure `deriveMeetGreetUpcoming` + test

**Files:**

- Create: `src/features/admin/meet-greet-upcoming.ts`
- Test: `src/features/admin/meet-greet-upcoming.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/admin/meet-greet-upcoming.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveMeetGreetUpcoming } from "./meet-greet-upcoming";

const now = new Date("2026-06-10T12:00:00Z");

describe("deriveMeetGreetUpcoming", () => {
  it("flags clients with a future non-terminal meet-greet booking", () => {
    const set = deriveMeetGreetUpcoming(
      [
        {
          client_id: "c1",
          starts_at: "2026-06-12T16:00:00Z",
          status: "confirmed",
        },
        {
          client_id: "c2",
          starts_at: "2026-06-01T16:00:00Z",
          status: "confirmed",
        }, // past
        {
          client_id: "c3",
          starts_at: "2026-06-20T16:00:00Z",
          status: "cancelled",
        }, // terminal
      ],
      now,
    );
    expect(set.has("c1")).toBe(true);
    expect(set.has("c2")).toBe(false);
    expect(set.has("c3")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/admin/meet-greet-upcoming.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/admin/meet-greet-upcoming.ts`:

```ts
const NON_TERMINAL = new Set(["pending_approval", "confirmed"]);

export interface MeetGreetBookingRow {
  client_id: string;
  starts_at: string;
  status: string;
}

/**
 * Pure: returns the set of client ids that have an upcoming (future, non-terminal)
 * meet-and-greet booking. Used to decide whether the admin's "Approve" needs the
 * pre-visit confirmation.
 */
export function deriveMeetGreetUpcoming(
  rows: MeetGreetBookingRow[],
  now: Date,
): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    if (NON_TERMINAL.has(r.status) && new Date(r.starts_at) > now) {
      out.add(r.client_id);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/admin/meet-greet-upcoming.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/meet-greet-upcoming.ts src/features/admin/meet-greet-upcoming.test.ts
git commit -m "feat: derive clients with an upcoming meet-greet"
```

### Task E2: Add `meetGreetUpcoming` to `ClientListRow` + `listClientsCore`

**Files:**

- Modify: `src/features/admin/clients-actions.ts:30-39,46-120`

- [ ] **Step 1: Extend the `ClientListRow` interface**

Add the field:

```ts
export interface ClientListRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  petCount: number;
  bookingCount: number;
  outstandingCents: number;
  onboardingStatus: OnboardingStatus;
  /** Has a future, non-terminal meet-greet booking (drives the pre-visit approve confirm). */
  meetGreetUpcoming: boolean;
}
```

- [ ] **Step 2: Query + derive in `listClientsCore`**

Add the import at the top of the file:

```ts
import { deriveMeetGreetUpcoming } from "./meet-greet-upcoming";
```

After the existing `debits` query block in `listClientsCore`, add a meet-greet bookings query and derive the set:

```ts
const { data: mgBookings, error: mgError } = await serviceClient
  .from("bookings")
  .select("client_id, starts_at, status, services!inner(slug)")
  .eq("services.slug", "meet-greet")
  .in("status", ["pending_approval", "confirmed"]);
if (mgError) return { kind: "error", message: mgError.message };

const meetGreetUpcoming = deriveMeetGreetUpcoming(
  (mgBookings ?? []).map((b) => ({
    client_id: b.client_id as string,
    starts_at: b.starts_at as string,
    status: b.status as string,
  })),
  new Date(),
);
```

Then add `meetGreetUpcoming: meetGreetUpcoming.has(profile.id as string),` to the `clients` mapping object.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/clients-actions.ts
git commit -m "feat: list clients expose upcoming meet-greet flag"
```

### Task E3: `OnboardingStatusSelect` reusable component

**Files:**

- Create: `src/features/admin/_components/onboarding-status-select.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/feedback/confirm-dialog";
import { useToast } from "@/components/feedback/toast";
import { setOnboardingStatus } from "@/features/admin/clients-actions";
import { onboardingStatusLabel } from "@/features/admin/onboarding-badge";
import { cn } from "@/lib/utils";
import type { OnboardingStatus } from "@/features/booking/booking-repository";

/** The three admin-settable statuses (info_pending is client-driven, not settable). */
const SETTABLE = [
  { value: "meet_greet_pending", label: "Pending", dot: "bg-status-pending" },
  { value: "approved", label: "Approved", dot: "bg-status-available" },
  { value: "declined", label: "Declined", dot: "bg-destructive" },
] as const;

function dotFor(status: OnboardingStatus): string {
  return SETTABLE.find((s) => s.value === status)?.dot ?? "bg-muted-foreground";
}

export function OnboardingStatusSelect({
  clientId,
  status,
  meetGreetUpcoming,
  className,
}: {
  clientId: string;
  status: OnboardingStatus;
  meetGreetUpcoming: boolean;
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [isPending, startTransition] = useTransition();

  // info_pending is set by the client finishing their forms — not admin-settable.
  if (status === "info_pending") {
    return (
      <span
        className={cn(
          "text-muted-foreground inline-flex items-center gap-2 text-sm",
          className,
        )}
      >
        <span
          className="bg-muted-foreground size-2 rounded-full"
          aria-hidden="true"
        />
        Profile pending
      </span>
    );
  }

  async function onChange(next: string) {
    if (next === status) return;
    if (next === "approved" && meetGreetUpcoming) {
      const ok = await confirm({
        title: "Approve before the visit?",
        description:
          "This client's meet & greet hasn't happened yet. Approve anyway?",
        confirmLabel: "Approve anyway",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const result = await setOnboardingStatus(clientId, next);
      if (result.kind === "success") {
        toast.add({ title: "Onboarding status updated" });
        router.refresh();
      } else {
        toast.add({
          title: "Couldn't update status",
          description: result.kind,
          type: "error",
        });
      }
    });
  }

  return (
    <>
      {dialog}
      <Select value={status} onValueChange={onChange} disabled={isPending}>
        <SelectTrigger
          className={cn("w-[11rem]", className)}
          aria-label="Onboarding status"
        >
          <span className="flex items-center gap-2">
            <span
              className={cn("size-2 rounded-full", dotFor(status))}
              aria-hidden="true"
            />
            <SelectValue>{onboardingStatusLabel(status)}</SelectValue>
          </span>
        </SelectTrigger>
        <SelectContent>
          {SETTABLE.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              <span className="flex items-center gap-2">
                <span
                  className={cn("size-2 rounded-full", opt.dot)}
                  aria-hidden="true"
                />
                {opt.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
```

- [ ] **Step 2: Verify the `Select` `value`/`onValueChange` API**

Open `src/components/ui/select.tsx` — `Select` is `SelectPrimitive.Root` (base-ui). Confirm base-ui's Select Root prop names are `value` + `onValueChange`. If base-ui uses `defaultValue`/`onValueChange` differently, adjust to its controlled-value props (grep an existing `<Select` usage in the repo, e.g. recurring controls or settings, for the exact prop names and mirror them).

Run: `npx tsc --noEmit`
Expected: PASS (types will surface a wrong prop name).

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/_components/onboarding-status-select.tsx
git commit -m "feat: reusable onboarding status select"
```

### Task E4: Use the select in client detail (replace button clusters)

**Files:**

- Modify: `src/app/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx:152-223`

- [ ] **Step 1: Add `meetGreetUpcoming` to `ClientDetailView`**

In `src/features/admin/clients-actions.ts`, add `meetGreetUpcoming: boolean;` to `ClientDetailView` and set it in `getClientDetailCore` from the loaded `bookings` (a meet-greet booking with `status` in `pending_approval|confirmed` and `starts_at > now`). Add after the `bookings` mapping:

```ts
const meetGreetUpcoming = (bookings ?? []).some((b) => {
  const join = b.services as { name: string } | { name: string }[] | null;
  const name = Array.isArray(join) ? join[0]?.name : join?.name;
  return (
    name === "Meet & Greet" &&
    (b.status === "pending_approval" || b.status === "confirmed") &&
    new Date(b.starts_at as string) > new Date()
  );
});
```

…and include `meetGreetUpcoming,` in the returned `client` object.

- [ ] **Step 2: Replace the Onboarding section's button clusters**

In `client-detail-client.tsx`, import the select:

```tsx
import { OnboardingStatusSelect } from "@/features/admin/_components/onboarding-status-select";
```

Replace the entire status-button block (the four `client.onboarding_status === ...` conditionals rendering Buttons, lines ~170-222) with a single control, keeping the badge + meet-greet line above it:

```tsx
<div className="flex items-center gap-2 text-sm">
  <Badge variant={onboardingStatusBadgeVariant(client.onboarding_status)}>
    {onboardingStatusLabel(client.onboarding_status)}
  </Badge>
</div>;
{
  meetGreetBooking ? (
    <p className="text-muted-foreground text-sm">
      Meet &amp; greet:{" "}
      <span className="text-foreground font-medium">
        {denver(meetGreetBooking.starts_at)}
      </span>{" "}
      &middot; {meetGreetBooking.status}
    </p>
  ) : null;
}
{
  client.onboarding_status === "info_pending" ? (
    <p className="text-muted-foreground text-sm">
      Awaiting profile/forms from client.
    </p>
  ) : null;
}
<OnboardingStatusSelect
  clientId={client.id}
  status={client.onboarding_status}
  meetGreetUpcoming={client.meetGreetUpcoming}
/>;
```

Remove the now-unused `onApprove` handler and the `setOnboardingStatus` import from this file if no longer referenced (the select owns those now). The `meetGreetBooking` const stays (used for the date line).

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint "src/app/(admin)/admin/clients"`
Expected: PASS.

- [ ] **Step 4: Manual verification**

`npm run dev`, open a `meet_greet_pending` client's detail page. The status dropdown shows "Pending"; choosing "Approved" while the visit is in the future raises the confirm dialog; choosing "Declined" sets declined and the page refreshes.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/clients-actions.ts "src/app/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx"
git commit -m "feat: admin client detail uses onboarding status dropdown"
```

### Task E5: Inline status select in the clients list

**Files:**

- Modify: `src/app/(admin)/admin/clients/_components/clients-index-client.tsx`

- [ ] **Step 1: Swap the Onboarding badge for the select (table + mobile)**

Import the select:

```tsx
import { OnboardingStatusSelect } from "@/features/admin/_components/onboarding-status-select";
```

In the **desktop table** Onboarding cell (currently the `<Badge>`), replace with:

```tsx
<td className="py-2">
  <OnboardingStatusSelect
    clientId={client.id}
    status={client.onboardingStatus}
    meetGreetUpcoming={client.meetGreetUpcoming}
  />
</td>
```

In the **mobile card** block, replace the onboarding `<Badge>` with the same `<OnboardingStatusSelect ... />` (keep the pets/bookings/owed badges).

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint "src/app/(admin)/admin/clients"`
Expected: PASS. (`onboardingStatusLabel`/`onboardingStatusBadgeVariant` may become unused in this file — remove those imports if eslint flags them.)

- [ ] **Step 3: Manual verification**

`npm run dev`, open `/admin/clients`. Each non-`info_pending` row shows an editable status dropdown; `info_pending` rows show "Profile pending". Changing a row's status persists and the list refreshes.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/admin/clients/_components/clients-index-client.tsx"
git commit -m "feat: inline onboarding status dropdown in clients list"
```

---

## Cluster F — Docs (same-commit rule)

### Task F1: Update DESIGN.md

**Files:**

- Modify: `docs/DESIGN.md`

- [ ] **Step 1: Update the relevant sections**

In `docs/DESIGN.md`, update:

- The services/pricing section: note the meet-and-greet is **not** a publicly listed service — it is scheduled only within the onboarding wizard.
- The route map: `/book/meet-greet` is retired (redirects to `/onboarding`); `/onboarding` step 2 embeds the scheduler.
- The `/admin/clients` section: onboarding status is set via a dropdown (Pending/Approved/Declined; "Profile pending" is read-only), available in both the list and the detail view.

Keep edits prose-level (no function signatures / path dumps per repo doc rules). Update the doc's `_Last reviewed:_` footer to `2026-06-09`.

- [ ] **Step 2: Move the DEV_NOTES items to done**

In `docs/DEV_NOTES.md`, after all clusters ship, remove the seven items from the "In progress" section (and remove the now-empty section if appropriate).

- [ ] **Step 3: Commit**

```bash
git add docs/DESIGN.md docs/DEV_NOTES.md
git commit -m "docs: meet-greet onboarding scheduling and admin status dropdown"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `npx vitest run`
Expected: PASS (existing suites + new: `onboarding-form`, `is-active-nav`, `services-repo`, `hourly-scheduler-data`, `meet-greet-upcoming`).

- [ ] **Typecheck + lint the whole repo**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **End-to-end manual pass**

1. New signup → onboarding step 1 → submit empty (inline errors) → submit valid (advances cleanly, no NEXT_REDIRECT).
2. Step 2 → sidebar locked + Onboarding active → embed scheduler → book → collapses → reschedule re-opens.
3. Admin → clients list + detail → set status via dropdown (pre-visit confirm on approve).
4. Client's onboarding tab auto-redirects to `/account` within ~15s of approval.
5. `/services` no longer lists meet-greet; `/book/meet-greet` redirects to `/onboarding`.

---

## Handoff

**Split handoff (maintainer directive 2026-06-09): Codex implements the non-UX
foundation; Claude (senior-designer) implements the UX-design surfaces.**

### Codex scope — implement these tasks only

Order: **B1 → C1 → D1 → D2 → D3 → D5 → E1 → E2.** Each is logic/data/refactor
with no visual-design decision, and each keeps the build green on its own commit
(new helpers/fields stay unconsumed until Claude's UX tasks wire them in).

- **B1** — `activeNavHref` pure helper + test
- **C1** — exclude `meet_greet` from `listActiveServices` + test
- **D1** — pure `hourlySchedulerData` + test
- **D2** — refactor `service-booking-client.tsx` to use `hourlySchedulerData`
- **D3** — `booking-form-data` loader; use it in the book page
- **D5** — `RefreshOnInterval` utility
- **E1** — pure `deriveMeetGreetUpcoming` + test
- **E2** — add `meetGreetUpcoming` to `ClientListRow` + `listClientsCore`
  (also do the `ClientDetailView` / `getClientDetailCore` `meetGreetUpcoming`
  data change described in E4 Step 1 — it is data, not UI)

**Gates (run before each commit; the next reader may not expose the same skills):**
`npm run typecheck` · `npm run lint` · and the **task's own test file(s)** via
`npx vitest run <path>` (e.g. `npx vitest run src/components/layout/is-active-nav.test.ts`).

> **Do NOT gate on the full `npx vitest run` suite.** Several existing suites
> (`admin.test.ts`, `onboarding-action.test.ts`, and other `*.test.ts` whose
> header says "Prerequisites: local Supabase stack running") are **integration
> tests** that connect to a local Supabase instance via `.env.test`. Without that
> stack they fail (e.g. `listServicesCore` non-success, `submitInquiryCore`
> "Phone is required") — independent of any change in Codex's scope, which only
> adds pure unit tests + pure refactors. The full integration suite is a separate
> release gate, run by the maintainer/CI where the stack is up; it is **out of
> scope for these foundation tasks.**

Use the exact per-task commit messages already written in each task. Do **not**
start any task outside the list above — those are reserved for Claude's UX pass
and several depend on your helpers.

### Reserved for Claude (do NOT implement)

A (onboarding form UI), B2 (sidebar locked visual), D4 (MeetGreetScheduler),
D6 (MeetGreetStep card), D7 (retire `/book/meet-greet` — lands with D6),
E3–E5 (status dropdown UI + wiring), F (docs). These need design judgment and/or
land the user-facing surfaces; Claude picks them up after Codex's foundation.

### Escalation

If a spec/plan detail is ambiguous, contradicts the codebase, a gate cannot pass,
or scope creep appears: **stop, append an entry to `## Handoff log` below, commit,
and stop.** Do not improvise. The maintainer relays criticals back to Claude.

## Handoff log

### ESCALATION - blocking

Finding: B1 targeted test passed after adding `activeNavHref`, but the required pre-commit full gate `npx vitest run` fails in existing `src/features/admin/admin.test.ts`: `listServicesCore` setup returns non-success, and `submitInquiryCore` rejects the fixture with "Phone is required". `npm run typecheck` passed; `npm run lint` returned 0 errors and one existing warning in `src/features/pricing/quote.ts`.
Options: (a) maintainer fixes or updates the existing admin integration fixtures, then Codex resumes B1 commit and remaining scope; (b) maintainer explicitly narrows the gate for this Codex batch. Recommend (a). Awaiting maintainer.

### RESOLUTION — designer (Claude), 2026-06-09

Root cause = **my plan named the wrong gate**, not a code problem. `admin.test.ts`
(and `onboarding-action.test.ts`, etc.) are **integration tests** requiring a
running local Supabase stack via `.env.test` ("Prerequisites: local Supabase stack
running" in their headers). The `listServicesCore` / `submitInquiryCore` failures
are that live-DB suite failing with no stack — unrelated to B1 (a pure
`is-active-nav` helper). Chose option (b): the gate is now narrowed.

**Gate change (see `## Handoff` → Gates):** for every Codex task, gate on
`npm run typecheck` · `npm run lint` · `npx vitest run <the task's own test file>`
— NOT the full suite. The integration suite is a separate release gate the
maintainer/CI runs where the stack is up.

**Codex: resume.** Commit B1 (its targeted test already passed), then continue
C1 → D1 → D2 → D3 → D5 → E1 → E2 under the narrowed gate.

---

## Self-Review Notes

- **Spec coverage:** #1+#2 → Cluster A; #3 → B2; #3b → B1/B2; #4 → D5/D6; #5 (de-list) → C1, (embed) → D1–D6, (modularize) → D1–D3, (retire route) → D7; #6 → E1–E5; no-emoji → D6 (PawPrint/CalendarCheck/Clock) + B2 (Lock); tokens → status dots in E3, semantic classes throughout; DESIGN.md → F1. All covered.
- **Type consistency:** `OnboardingFormState`, `parseOnboardingForm`, `activeNavHref`, `hourlySchedulerData`, `loadBookingFormData`, `deriveMeetGreetUpcoming`, `meetGreetUpcoming` (on both `ClientListRow` and `ClientDetailView`), and `OnboardingStatusSelect` props are named consistently across the tasks that define and consume them.
- **Open verification points flagged inline:** base-ui `Select` controlled prop names (E3 Step 2); React 19 `useActionState` availability (A3 — standard in current Next App Router).

---

_Last reviewed: 2026-06-09_
