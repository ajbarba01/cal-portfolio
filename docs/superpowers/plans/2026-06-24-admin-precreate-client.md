# Admin Pre-Created (Unclaimed) Clients — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Cal (admin) create a client record before that person signs up — to approve them, fill forms, and book on their behalf — and give existing offline clients a one-click migration into a real account via a copy-able claim link.

**Architecture:** "Unclaimed shadow account." A `createUnclaimedClient` admin action mints a real `auth.users` row (no password) via the Supabase admin API; the existing profile-insert trigger creates the `profiles` row, flagged `unclaimed = true`. Every existing flow (on-behalf booking, on-behalf forms, approval dropdown, RLS, exclusion constraint) is reused untouched. Cal later generates a one-time claim link (`generateLink` invite); the client sets a password at `/claim`, which clears the flag; the existing `onboarding_status` middleware then routes them. Automated emails are suppressed while `unclaimed`.

**Tech Stack:** Next.js App Router (RSC + server actions), TypeScript strict, Supabase (Postgres + Auth + RLS), Vitest, Zod, Tailwind + shadcn/ui.

## Global Constraints

- **TypeScript `strict`, no `any`.** Parse external/DB data with Zod at the edge.
- **Core logic pure + tested; IO at the edges.** Mirror the `*Core(deps, …)` + thin `"use server"` wrapper pattern in `src/features/admin/clients-actions.ts` and `onbehalf-actions.ts`.
- **Admin actions are service-role AFTER an admin check.** `assertActorIsAdmin(serviceClient, actorUserId)` fires BEFORE any read/write; identity from `getActorOrRedirect()` / verified session, never the payload.
- **Design tokens are law.** Semantic tokens only; **no new drop shadows** (Alex's standing rule). Run the `frontend-design` skill before building the new UI surfaces.
- **Mobile parity** — every new UI surface is as intentional on mobile as desktop.
- **Money = integer cents** (not touched here, but the rule stands).
- **Single `main` branch; commit only after verification.** **Commit messages: Conventional Commits, subject line only — no body, no `Co-Authored-By`, no "Generated with" footer.** No project-internal identifiers (phase/plan/ticket) in subjects.
- **Same-commit doc rule** — a code change that adds/moves/deletes files updates the relevant doc in the same commit (`docs/DESIGN.md` here).
- **PowerShell UTF-8 caveat** — edit source via the Edit/Write tools only; PS 5.1 mojibakes UTF-8.
- **Handoff test gate (per repo policy):** gate each task on its own unit tests (`npx vitest run <file>`), NOT a full `vitest run` — integration tests need the local Supabase stack (`npx supabase start` + `npx supabase db reset`).

---

## File Structure

**New files:**

- `supabase/migrations/20260624120000_profiles_unclaimed.sql` — adds `unclaimed`, `claimed_at`, `invited_at` to `profiles`.
- `src/features/notifications/should-notify.ts` — pure `shouldNotify` predicate.
- `src/features/notifications/should-notify.test.ts` — unit tests.
- `src/features/admin/create-client-actions.ts` — `createUnclaimedClientCore` + `generateClaimLinkCore` + `"use server"` wrappers.
- `src/features/admin/create-client-actions.test.ts` — unit tests (validation + collision mapping + invite stamping with stubbed deps).
- `src/features/admin/create-client.integration.test.ts` — integration (real local Supabase): mint user, flagged profile, RLS column guard.
- `src/app/(site)/(admin)/admin/clients/new/page.tsx` — "New client" form page.
- `src/app/(site)/(admin)/admin/clients/new/_components/new-client-form.tsx` — the client-component form.
- `src/app/(site)/(admin)/admin/clients/[clientId]/_components/account-claim-panel.tsx` — claim-link panel on the detail page.
- `src/app/(auth)/claim/page.tsx` — claim landing (set password).
- `src/app/(auth)/claim/_components/claim-form.tsx` — set-password client component.
- `src/features/accounts/claim-actions.ts` — `claimAccount` server action (set password + stamp flags).
- `src/features/accounts/claim-actions.test.ts` — unit tests (stubbed deps).

**Modified files:**

- `src/features/admin/clients-actions.ts` — add `unclaimed` to `ClientListRow` + `listClientsCore` select; add `unclaimed`/`invited_at`/`claimed_at` to `ClientDetailView` + `getClientDetailCore` select.
- `src/features/admin/index.ts` — export the new actions/types.
- `src/features/notifications/index.ts` — export `shouldNotify`.
- `src/features/notifications/reminder-cron.ts` — fetch `profiles(email, unclaimed)`, skip when `!shouldNotify`.
- `src/features/admin/approval-actions.ts` — fetch `profiles(email, unclaimed)`, skip confirmation email when `!shouldNotify`.
- `src/app/(auth)/auth/callback/route.ts` — honor a whitelisted `next` param (`/claim`).
- `src/app/(site)/(admin)/admin/clients/page.tsx` — "New client" button.
- `src/app/(site)/(admin)/admin/clients/_components/clients-index-client.tsx` — "Unclaimed" badge.
- `src/app/(site)/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx` — render `<AccountClaimPanel>`.
- `scripts/db-seed/factories.ts` — `createUnclaimedClientUser` factory.
- `scripts/db-seed/scenarios.ts` — add an unclaimed client to the `admin-demo` scenario.
- `docs/DESIGN.md` — schema columns, routes, suppression note, unclaimed-clients subsection.

---

### Task 1: Migration — `profiles.unclaimed` / `claimed_at` / `invited_at`

**Files:**

- Create: `supabase/migrations/20260624120000_profiles_unclaimed.sql`
- Modify: `docs/DESIGN.md`

**Interfaces:**

- Produces: three new columns on `profiles` — `unclaimed boolean not null default false`, `claimed_at timestamptz null`, `invited_at timestamptz null`. **No RLS grant change** — the existing `grant update (full_name, email, phone, avatar_url, address, zip) on profiles to authenticated` enumerates allowed columns, so new columns are non-client-writable automatically.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260624120000_profiles_unclaimed.sql
-- Pre-created ("unclaimed") clients: Cal mints a real auth user with no
-- password and manages it on the client's behalf until they claim it.
--
-- `unclaimed` defaults FALSE so every existing signup/OAuth path is unaffected
-- (those rows are born claimed). Only the admin create-client action flips a
-- row to TRUE. These columns are intentionally absent from the profiles client
-- UPDATE column grant, so RLS makes them admin/service-role-write-only with no
-- policy change required.

alter table profiles
  add column if not exists unclaimed boolean not null default false,
  add column if not exists claimed_at timestamptz,
  add column if not exists invited_at timestamptz;

comment on column profiles.unclaimed is
  'True = Cal-created shadow account not yet claimed by the client. No password; password-login impossible. Notifications suppressed.';
comment on column profiles.claimed_at is
  'When the client claimed the account (set a password). Null while unclaimed.';
comment on column profiles.invited_at is
  'When Cal last generated a claim link. Drives the "invite generated" admin UI.';
```

- [ ] **Step 2: Apply locally and verify the columns exist**

Run (requires Docker + local stack):

```bash
npx supabase db reset
```

Expected: reset completes with no migration error. Then verify:

```bash
npx supabase db diff --schema public | grep -i unclaimed || echo "no drift (expected — column is committed in migration)"
```

Expected: no drift reported (the migration is the source of truth).

- [ ] **Step 3: Update `docs/DESIGN.md` (same-commit doc rule)**

In the `profiles` bullet under **Data model**, append after `created_at`:

```
· `unclaimed` (bool, default false — Cal-created shadow account not yet claimed; password-login impossible, notifications suppressed) · `claimed_at` (when the client set a password) · `invited_at` (when Cal last generated a claim link)
```

In the **Column-level guard** bullet, add `unclaimed`, `claimed_at`, `invited_at` to the list of system/admin-set-never-client-writable columns (note: enforced by the allow-list grant, no policy change).
Add `/admin/clients/new` (admin) and `/claim` (auth, public) rows to the **Route map**.
Bump the `_Last reviewed_` footer with a one-line note: "added unclaimed/claimed_at/invited_at to profiles; /admin/clients/new + /claim routes; notifications suppressed while unclaimed."

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260624120000_profiles_unclaimed.sql docs/DESIGN.md
git commit -m "feat(db): add unclaimed/claimed_at/invited_at to profiles"
```

---

### Task 2: `shouldNotify` pure predicate

**Files:**

- Create: `src/features/notifications/should-notify.ts`
- Test: `src/features/notifications/should-notify.test.ts`
- Modify: `src/features/notifications/index.ts`

**Interfaces:**

- Produces: `export function shouldNotify(recipient: { unclaimed: boolean | null }): boolean` — returns `false` for an unclaimed recipient, `true` otherwise. Treats `null`/`undefined` unclaimed as claimed (true) so legacy rows notify normally.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/notifications/should-notify.test.ts
import { describe, it, expect } from "vitest";
import { shouldNotify } from "./should-notify";

describe("shouldNotify", () => {
  it("suppresses an unclaimed recipient", () => {
    expect(shouldNotify({ unclaimed: true })).toBe(false);
  });
  it("notifies a claimed recipient", () => {
    expect(shouldNotify({ unclaimed: false })).toBe(true);
  });
  it("treats null unclaimed as claimed (legacy rows notify)", () => {
    expect(shouldNotify({ unclaimed: null })).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/features/notifications/should-notify.test.ts`
Expected: FAIL — `shouldNotify` is not defined / module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/notifications/should-notify.ts
/**
 * Whether automated emails (confirmations, reminders) may be sent to this
 * recipient. Unclaimed shadow accounts (Cal-created, not yet claimed) are
 * suppressed — Cal handles their comms manually until they claim. A null/absent
 * flag is treated as claimed so legacy rows notify normally.
 */
export function shouldNotify(recipient: {
  unclaimed: boolean | null;
}): boolean {
  return recipient.unclaimed !== true;
}
```

- [ ] **Step 4: Export it**

In `src/features/notifications/index.ts`, add:

```ts
export { shouldNotify } from "./should-notify";
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx vitest run src/features/notifications/should-notify.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/notifications/should-notify.ts src/features/notifications/should-notify.test.ts src/features/notifications/index.ts
git commit -m "feat(notifications): add shouldNotify suppression predicate"
```

---

### Task 3: Suppress reminders to unclaimed clients

**Files:**

- Modify: `src/features/notifications/reminder-cron.ts`

**Interfaces:**

- Consumes: `shouldNotify` from Task 2.

- [ ] **Step 1: Extend the row schema to carry `unclaimed`**

In `src/features/notifications/reminder-cron.ts`, change the `profiles` shape in `reminderBookingRowSchema`:

```ts
  profiles: z
    .object({
      email: z.string(),
      unclaimed: z.boolean().nullable(),
    })
    .nullable(),
```

- [ ] **Step 2: Select the column in the query**

In `runReminderCron`, change the `.select(...)` to fetch `unclaimed`:

```ts
    .select(
      "id, starts_at, ends_at, reminder_sent_at, status, profiles(email, unclaimed), services(name)",
    )
```

- [ ] **Step 3: Skip suppressed recipients in the loop**

Add the import at the top:

```ts
import { shouldNotify } from "./should-notify";
```

In the loop, right after the `if (!clientEmail || !serviceName) { … }` guard, add:

```ts
// Suppress automated email for unclaimed (Cal-created, not yet claimed)
// clients — Cal handles their comms manually until they claim.
if (row.profiles && !shouldNotify(row.profiles)) continue;
```

- [ ] **Step 4: Typecheck + run the existing reminder-cron tests**

Run: `npx vitest run src/features/notifications/reminder-cron.test.ts`
Expected: PASS. (If the existing test builds `profiles` rows without `unclaimed`, the `.nullable()` makes the field optional-by-value but Zod still requires the key — update those test fixtures to include `unclaimed: false`. Show the diff: add `unclaimed: false` to each `profiles: { email: … }` literal in the test.)

Then: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/notifications/reminder-cron.ts src/features/notifications/reminder-cron.test.ts
git commit -m "feat(notifications): suppress reminders to unclaimed clients"
```

---

### Task 4: Suppress approval-confirmation email to unclaimed clients

**Files:**

- Modify: `src/features/admin/approval-actions.ts`

**Interfaces:**

- Consumes: `shouldNotify` from Task 2.

- [ ] **Step 1: Extend `approvalConfirmationRowSchema`**

In `src/features/admin/approval-actions.ts`, change the `profiles` shape:

```ts
  profiles: z
    .object({ email: z.string(), unclaimed: z.boolean().nullable() })
    .nullable(),
```

- [ ] **Step 2: Select the column**

In `approveBooking`'s deferred `after(...)` block, change the booking read:

```ts
          .select(
            "starts_at, ends_at, final_cents, profiles(email, unclaimed), services(name)",
          )
```

- [ ] **Step 3: Gate the send on `shouldNotify`**

Add the import:

```ts
import { shouldNotify } from "@/features/notifications";
```

In the `if (parsed.success)` block, change the send condition. Replace:

```ts
          const clientEmail = row.profiles?.email;
          const serviceName = row.services?.name ?? "Booking";
          if (clientEmail) {
```

with:

```ts
          const clientEmail = row.profiles?.email;
          const serviceName = row.services?.name ?? "Booking";
          // Suppress confirmation email for unclaimed clients (Cal-created,
          // not yet claimed) — Cal handles their comms manually until claim.
          const mayNotify = row.profiles ? shouldNotify(row.profiles) : true;
          if (clientEmail && mayNotify) {
```

- [ ] **Step 4: Typecheck + run admin tests**

Run: `npx vitest run src/features/admin/admin.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/approval-actions.ts
git commit -m "feat(admin): suppress approval email to unclaimed clients"
```

---

### Task 5: `createUnclaimedClient` action

**Files:**

- Create: `src/features/admin/create-client-actions.ts`
- Test: `src/features/admin/create-client-actions.test.ts`
- Modify: `src/features/admin/index.ts`

**Interfaces:**

- Consumes: `assertActorIsAdmin` (`@/lib/admin-guard`), `getActorOrRedirect` (`@/lib/admin-session`), `createServiceClient` (`@/lib/supabase/service`), `defaultGeocoder`/`Geocoder` (`@/features/pricing`), `onboardingStatusSchema` (`@/features/booking`).
- Produces:
  - `createClientInputSchema` (Zod) — `{ email: string; fullName: string; phone?: string; address?: string; zip?: string; onboardingStatus: OnboardingStatus }`.
  - `type CreateClientInput = z.infer<typeof createClientInputSchema>`.
  - `type CreateClientResult = { kind: "success"; clientId: string } | { kind: "forbidden" } | { kind: "validation_error"; message: string } | { kind: "email_exists"; clientId: string | null } | { kind: "error"; message: string }`.
  - `createUnclaimedClientCore(deps: { serviceClient: SupabaseClient; actorUserId: string; geocoder?: Geocoder }, input: CreateClientInput): Promise<CreateClientResult>`.
  - `createUnclaimedClient(input: CreateClientInput): Promise<CreateClientResult>` — `"use server"` wrapper.

- [ ] **Step 1: Write the failing test (validation + collision mapping with stubbed deps)**

```ts
// src/features/admin/create-client-actions.test.ts
import { describe, it, expect, vi } from "vitest";
import { createUnclaimedClientCore } from "./create-client-actions";

// Minimal fake Supabase admin client. Only the methods the core touches.
function makeDeps(opts: {
  isAdmin?: boolean;
  createUserError?: { message: string; status?: number } | null;
  createdUserId?: string;
  existingClientId?: string | null;
}) {
  const {
    isAdmin = true,
    createUserError = null,
    createdUserId = "11111111-1111-1111-1111-111111111111",
    existingClientId = null,
  } = opts;

  const profileUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  const serviceClient = {
    // assertActorIsAdmin reads profiles(role); emulate via from().select().eq().single()
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { role: isAdmin ? "admin" : "client" },
                error: null,
              }),
              // collision lookup: find existing profile by email
              maybeSingle: vi.fn().mockResolvedValue({
                data: existingClientId ? { id: existingClientId } : null,
                error: null,
              }),
            })),
          })),
          update: profileUpdate,
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
    auth: {
      admin: {
        createUser: vi
          .fn()
          .mockResolvedValue(
            createUserError
              ? { data: { user: null }, error: createUserError }
              : { data: { user: { id: createdUserId } }, error: null },
          ),
      },
    },
  } as unknown as Parameters<
    typeof createUnclaimedClientCore
  >[0]["serviceClient"];

  return { serviceClient, profileUpdate };
}

const validInput = {
  email: "new@client.test",
  fullName: "New Client",
  onboardingStatus: "approved" as const,
};

describe("createUnclaimedClientCore", () => {
  it("returns forbidden for a non-admin actor", async () => {
    const { serviceClient } = makeDeps({ isAdmin: false });
    const r = await createUnclaimedClientCore(
      { serviceClient, actorUserId: "actor" },
      validInput,
    );
    expect(r.kind).toBe("forbidden");
  });

  it("rejects an invalid email", async () => {
    const { serviceClient } = makeDeps({});
    const r = await createUnclaimedClientCore(
      { serviceClient, actorUserId: "actor" },
      { ...validInput, email: "not-an-email" },
    );
    expect(r.kind).toBe("validation_error");
  });

  it("maps a duplicate-email auth error to email_exists with the existing id", async () => {
    const { serviceClient } = makeDeps({
      createUserError: {
        message: "A user with this email address has already been registered",
        status: 422,
      },
      existingClientId: "existing-id",
    });
    const r = await createUnclaimedClientCore(
      { serviceClient, actorUserId: "actor" },
      validInput,
    );
    expect(r).toEqual({ kind: "email_exists", clientId: "existing-id" });
  });

  it("creates the user, flags unclaimed, returns the new id", async () => {
    const { serviceClient, profileUpdate } = makeDeps({});
    const r = await createUnclaimedClientCore(
      {
        serviceClient,
        actorUserId: "actor",
        geocoder: { geocode: async () => null },
      },
      validInput,
    );
    expect(r).toEqual({
      kind: "success",
      clientId: "11111111-1111-1111-1111-111111111111",
    });
    // Profile update must set unclaimed: true.
    expect(profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        unclaimed: true,
        onboarding_status: "approved",
      }),
    );
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/features/admin/create-client-actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/admin/create-client-actions.ts
"use server";

/**
 * Admin "pre-create client" + "generate claim link" actions.
 *
 * createUnclaimedClient mints a real auth.users row with NO password (a shadow
 * account), then flags its profile `unclaimed = true`. The client can be
 * approved / form-filled / booked-for via the existing on-behalf flows. Later,
 * Cal generates a one-time claim link the client uses to set a password.
 *
 * SECURITY: assertActorIsAdmin fires before any read/write; the service client
 * (RLS bypass) is used only after that check. Identity from the session.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "@/lib/admin-guard";
import { getActorOrRedirect } from "@/lib/admin-session";
import { defaultGeocoder, type Geocoder } from "@/features/pricing";
import { onboardingStatusSchema } from "@/features/booking";
import { FIELD_LIMITS } from "@/lib/field-limits";

export const createClientInputSchema = z.object({
  email: z
    .string()
    .email("A valid email is required")
    .max(FIELD_LIMITS.email ?? 320),
  fullName: z.string().min(1, "Name is required").max(FIELD_LIMITS.name),
  phone: z
    .string()
    .max(FIELD_LIMITS.shortText)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  address: z
    .string()
    .max(FIELD_LIMITS.shortText)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  zip: z
    .string()
    .max(16)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  onboardingStatus: onboardingStatusSchema,
});

export type CreateClientInput = z.infer<typeof createClientInputSchema>;

export type CreateClientResult =
  | { kind: "success"; clientId: string }
  | { kind: "forbidden" }
  | { kind: "validation_error"; message: string }
  | { kind: "email_exists"; clientId: string | null }
  | { kind: "error"; message: string };

export interface CreateClientDeps {
  serviceClient: SupabaseClient;
  actorUserId: string;
  geocoder?: Geocoder;
}

/** True if a Supabase admin createUser error means the email is already taken. */
function isDuplicateEmailError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("already been registered") ||
    m.includes("already registered") ||
    m.includes("duplicate")
  );
}

export async function createUnclaimedClientCore(
  deps: CreateClientDeps,
  rawInput: CreateClientInput,
): Promise<CreateClientResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }

  const parsed = createClientInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      kind: "validation_error",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  const input = parsed.data;
  const { serviceClient, geocoder = defaultGeocoder } = deps;

  // 1. Mint the auth user with NO password (email pre-confirmed). The
  //    handle_new_user trigger creates the profile row.
  const { data: created, error: createErr } =
    await serviceClient.auth.admin.createUser({
      email: input.email,
      email_confirm: true,
    });

  if (createErr || !created.user) {
    const msg = createErr?.message ?? "Could not create the account.";
    if (createErr && isDuplicateEmailError(msg)) {
      // Surface the existing client so the UI can link to them.
      const { data: existing } = await serviceClient
        .from("profiles")
        .select("id")
        .eq("email", input.email)
        .maybeSingle();
      return {
        kind: "email_exists",
        clientId: (existing?.id as string | undefined) ?? null,
      };
    }
    return { kind: "error", message: msg };
  }

  const clientId = created.user.id;

  // 2. Geocode the ZIP once (best-effort — unknown ZIP must not block).
  const latLng = input.zip ? await geocoder.geocode(input.zip) : null;

  // 3. Fill the profile + flag unclaimed (service role bypasses the column grant).
  const { error: profileErr } = await serviceClient
    .from("profiles")
    .update({
      full_name: input.fullName,
      phone: input.phone ?? null,
      address: input.address ?? null,
      zip: input.zip ?? null,
      lat: latLng?.lat ?? null,
      lng: latLng?.lng ?? null,
      onboarding_status: input.onboardingStatus,
      unclaimed: true,
    })
    .eq("id", clientId);

  if (profileErr) {
    return { kind: "error", message: profileErr.message };
  }

  return { kind: "success", clientId };
}

export async function createUnclaimedClient(
  input: CreateClientInput,
): Promise<CreateClientResult> {
  const actorUserId = await getActorOrRedirect();
  const result = await createUnclaimedClientCore(
    { serviceClient: createServiceClient(), actorUserId },
    input,
  );
  if (result.kind === "success") revalidatePath("/admin/clients");
  return result;
}
```

Note for implementer: if `FIELD_LIMITS.email` does not exist, use a literal `320`; check `src/lib/field-limits.ts` and match an existing key (`shortText` is known to exist). Do not invent keys.

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/features/admin/create-client-actions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Export from the admin barrel**

In `src/features/admin/index.ts`, add (match existing export style):

```ts
export { createUnclaimedClient } from "./create-client-actions";
export type {
  CreateClientInput,
  CreateClientResult,
} from "./create-client-actions";
```

Note: do NOT re-export the `*Core` from a `"use server"` file via a `"use server"` barrel if the barrel itself is `"use server"` — check `index.ts`. If `index.ts` is a plain module, type re-exports are fine. Verify with `npx tsc --noEmit`.

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/features/admin/create-client-actions.ts src/features/admin/create-client-actions.test.ts src/features/admin/index.ts
git commit -m "feat(admin): add createUnclaimedClient action"
```

---

### Task 6: `/admin/clients/new` page + form

**Files:**

- Create: `src/app/(site)/(admin)/admin/clients/new/page.tsx`
- Create: `src/app/(site)/(admin)/admin/clients/new/_components/new-client-form.tsx`
- Modify: `src/app/(site)/(admin)/admin/clients/page.tsx`

**Interfaces:**

- Consumes: `createUnclaimedClient`, `CreateClientResult` (Task 5); `OnboardingStatus` (`@/features/booking`).

- [ ] **Step 1: Add the "New client" button on the directory page**

In `src/app/(site)/(admin)/admin/clients/page.tsx`, import `Button` and `Link`, and render an action in the header. Replace the `<PageHeader … />` line with:

```tsx
<PageHeader title="Clients" subtitle="Everyone with a client account.">
  <Button asChild>
    <Link href="/admin/clients/new">New client</Link>
  </Button>
</PageHeader>
```

Note for implementer: confirm `PageHeader` accepts `children` as an actions slot (check `src/components/layout/page-header.tsx`). If it does not, render the button in a flex row above `<ClientsIndexClient>` instead. Use the existing `Button` from `@/components/ui/button` and `Link` from `next/link`.

- [ ] **Step 2: Write the form client-component**

```tsx
// src/app/(site)/(admin)/admin/clients/new/_components/new-client-form.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Surface } from "@/components/ui/surface";
import { useToast } from "@/components/feedback/toast";
import { createUnclaimedClient } from "@/features/admin";
import type { OnboardingStatus } from "@/features/booking";

const STATUS_OPTIONS: { value: OnboardingStatus; label: string }[] = [
  { value: "approved", label: "Approved (skip onboarding)" },
  { value: "info_pending", label: "Needs onboarding info" },
  { value: "meet_greet_pending", label: "Needs meet & greet" },
  { value: "declined", label: "Declined" },
];

export function NewClientForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<OnboardingStatus>("approved");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    start(async () => {
      const result = await createUnclaimedClient({
        email: String(form.get("email") ?? ""),
        fullName: String(form.get("fullName") ?? ""),
        phone: String(form.get("phone") ?? ""),
        address: String(form.get("address") ?? ""),
        zip: String(form.get("zip") ?? ""),
        onboardingStatus: status,
      });
      switch (result.kind) {
        case "success":
          toast.add({ type: "success", title: "Client created" });
          router.push(`/admin/clients/${result.clientId}`);
          router.refresh();
          break;
        case "email_exists":
          setError(
            result.clientId
              ? "A client with this email already exists. Open their existing profile instead."
              : "A client with this email already exists.",
          );
          break;
        case "validation_error":
          setError(result.message);
          break;
        case "forbidden":
          setError("Your admin session expired — refresh and try again.");
          break;
        case "error":
          setError(result.message);
          break;
      }
    });
  }

  return (
    <Surface variant="plain" className="max-w-xl p-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" required maxLength={120} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
          <p className="text-muted-foreground text-xs">
            Used as the account identity. The client claims it later via a link
            you generate — no email is sent now.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input id="phone" name="phone" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="zip">ZIP (optional)</Label>
            <Input id="zip" name="zip" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address">Address (optional)</Label>
          <Input id="address" name="address" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Initial onboarding status</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as OnboardingStatus)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create client"}
          </Button>
          <Button asChild variant="ghost">
            <Link href="/admin/clients">Cancel</Link>
          </Button>
        </div>
      </form>
    </Surface>
  );
}
```

Note for implementer: confirm the exact import paths/props of `Input`, `Label`, `Select`, `Surface`, `Button`, and `useToast` against the COMPONENT_SYSTEM registry / existing admin forms (e.g. `settings` form). Match their real APIs; the structure above is the target.

- [ ] **Step 3: Write the page**

```tsx
// src/app/(site)/(admin)/admin/clients/new/page.tsx
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

import { NewClientForm } from "./_components/new-client-form";

export default function NewClientPage() {
  return (
    <PageContainer width="app">
      <PageHeader
        title="New client"
        subtitle="Create a record for an offline client. They claim the account later."
      />
      <NewClientForm />
    </PageContainer>
  );
}
```

- [ ] **Step 4: Run the frontend-design skill, then verify the page builds**

Invoke the `frontend-design` skill for this surface; reconcile spacing/tokens with the admin design system (no new shadows, semantic tokens). Then:
Run: `npx tsc --noEmit`
Expected: no errors.
Manually verify (local dev): `/admin/clients` shows "New client"; the form submits and redirects to the new detail page.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(site)/(admin)/admin/clients/new" "src/app/(site)/(admin)/admin/clients/page.tsx"
git commit -m "feat(admin): add new-client creation page"
```

---

### Task 7: `generateClaimLink` action

**Files:**

- Modify: `src/features/admin/create-client-actions.ts`
- Modify: `src/features/admin/create-client-actions.test.ts`
- Modify: `src/features/admin/index.ts`

**Interfaces:**

- Produces:
  - `type GenerateClaimLinkResult = { kind: "success"; url: string } | { kind: "forbidden" } | { kind: "not_unclaimed" } | { kind: "error"; message: string }`.
  - `generateClaimLinkCore(deps: { serviceClient: SupabaseClient; actorUserId: string; origin: string }, clientId: string): Promise<GenerateClaimLinkResult>`.
  - `generateClaimLink(clientId: string): Promise<GenerateClaimLinkResult>` — `"use server"` wrapper; reads the request origin from `headers()`.

- [ ] **Step 1: Add the failing test**

Append to `src/features/admin/create-client-actions.test.ts`:

```ts
import { generateClaimLinkCore } from "./create-client-actions";

function makeLinkDeps(opts: {
  isAdmin?: boolean;
  unclaimed?: boolean;
  actionLink?: string;
  generateError?: { message: string } | null;
}) {
  const {
    isAdmin = true,
    unclaimed = true,
    actionLink = "https://supabase.example/auth/v1/verify?token=abc&type=invite",
    generateError = null,
  } = opts;
  const update = vi
    .fn()
    .mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const serviceClient = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi
            .fn()
            .mockResolvedValue({
              data: { role: isAdmin ? "admin" : "client" },
              error: null,
            }),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { email: "x@y.test", unclaimed },
            error: null,
          }),
        })),
      })),
      update,
    })),
    auth: {
      admin: {
        generateLink: vi
          .fn()
          .mockResolvedValue(
            generateError
              ? { data: { properties: null }, error: generateError }
              : {
                  data: { properties: { action_link: actionLink } },
                  error: null,
                },
          ),
      },
    },
  } as unknown as Parameters<typeof generateClaimLinkCore>[0]["serviceClient"];
  return { serviceClient, update };
}

describe("generateClaimLinkCore", () => {
  it("forbids non-admins", async () => {
    const { serviceClient } = makeLinkDeps({ isAdmin: false });
    const r = await generateClaimLinkCore(
      { serviceClient, actorUserId: "a", origin: "https://app.test" },
      "cid",
    );
    expect(r.kind).toBe("forbidden");
  });
  it("refuses an already-claimed client", async () => {
    const { serviceClient } = makeLinkDeps({ unclaimed: false });
    const r = await generateClaimLinkCore(
      { serviceClient, actorUserId: "a", origin: "https://app.test" },
      "cid",
    );
    expect(r.kind).toBe("not_unclaimed");
  });
  it("returns the action_link and stamps invited_at", async () => {
    const { serviceClient, update } = makeLinkDeps({});
    const r = await generateClaimLinkCore(
      { serviceClient, actorUserId: "a", origin: "https://app.test" },
      "cid",
    );
    expect(r).toEqual({
      kind: "success",
      url: "https://supabase.example/auth/v1/verify?token=abc&type=invite",
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ invited_at: expect.any(String) }),
    );
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/features/admin/create-client-actions.test.ts`
Expected: FAIL — `generateClaimLinkCore` not defined.

- [ ] **Step 3: Implement `generateClaimLinkCore` + wrapper**

Append to `src/features/admin/create-client-actions.ts` (add `headers` import at top):

```ts
import { headers } from "next/headers";
```

```ts
export type GenerateClaimLinkResult =
  | { kind: "success"; url: string }
  | { kind: "forbidden" }
  | { kind: "not_unclaimed" }
  | { kind: "error"; message: string };

export interface GenerateClaimLinkDeps {
  serviceClient: SupabaseClient;
  actorUserId: string;
  /** Site origin (e.g. https://calbarba.com) used to build the redirect target. */
  origin: string;
}

export async function generateClaimLinkCore(
  deps: GenerateClaimLinkDeps,
  clientId: string,
): Promise<GenerateClaimLinkResult> {
  const { serviceClient, actorUserId, origin } = deps;
  if (!(await assertActorIsAdmin(serviceClient, actorUserId))) {
    return { kind: "forbidden" };
  }

  const { data: profile, error: readErr } = await serviceClient
    .from("profiles")
    .select("email, unclaimed")
    .eq("id", clientId)
    .maybeSingle();
  if (readErr) return { kind: "error", message: readErr.message };
  if (!profile?.email)
    return { kind: "error", message: "Client has no email." };
  if (profile.unclaimed !== true) return { kind: "not_unclaimed" };

  // Invite link → set-password landing. redirectTo routes through the existing
  // /auth/callback (code exchange) with next=/claim so the claim page runs with
  // an authenticated session.
  const redirectTo = `${origin}/auth/callback?next=/claim`;
  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: "invite",
    email: profile.email as string,
    options: { redirectTo },
  });
  if (error || !data.properties?.action_link) {
    return {
      kind: "error",
      message: error?.message ?? "Could not generate a link.",
    };
  }

  await serviceClient
    .from("profiles")
    .update({ invited_at: new Date().toISOString() })
    .eq("id", clientId);

  return { kind: "success", url: data.properties.action_link };
}

export async function generateClaimLink(
  clientId: string,
): Promise<GenerateClaimLinkResult> {
  const actorUserId = await getActorOrRedirect();
  const hdrs = await headers();
  const origin =
    hdrs.get("origin") ??
    (hdrs.get("host") ? `https://${hdrs.get("host")}` : "");
  const result = await generateClaimLinkCore(
    { serviceClient: createServiceClient(), actorUserId, origin },
    clientId,
  );
  if (result.kind === "success") revalidatePath(`/admin/clients/${clientId}`);
  return result;
}
```

Note for implementer: verify `generateLink`'s option shape against the installed `@supabase/supabase-js` version (`type: "invite"`, `email`, `options.redirectTo`). If the type-checker rejects `type: "invite"` without a password, use the version's documented signature — the intent is "invite link to the existing email, redirecting through our callback."

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/features/admin/create-client-actions.test.ts`
Expected: PASS (all create + link tests).

- [ ] **Step 5: Export + typecheck**

In `src/features/admin/index.ts` add:

```ts
export { generateClaimLink } from "./create-client-actions";
export type { GenerateClaimLinkResult } from "./create-client-actions";
```

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/create-client-actions.ts src/features/admin/create-client-actions.test.ts src/features/admin/index.ts
git commit -m "feat(admin): add generateClaimLink action"
```

---

### Task 8: Claim landing page + `claimAccount` action + callback `next`

**Files:**

- Modify: `src/app/(auth)/auth/callback/route.ts`
- Create: `src/features/accounts/claim-actions.ts`
- Test: `src/features/accounts/claim-actions.test.ts`
- Create: `src/app/(auth)/claim/page.tsx`
- Create: `src/app/(auth)/claim/_components/claim-form.tsx`

**Interfaces:**

- Consumes: `createClient` (`@/lib/supabase/server`), `createServiceClient` (`@/lib/supabase/service`).
- Produces:
  - `type ClaimResult = { kind: "success" } | { kind: "unauthenticated" } | { kind: "already_claimed" } | { kind: "validation_error"; message: string } | { kind: "error"; message: string }`.
  - `claimAccount(newPassword: string): Promise<ClaimResult>` — `"use server"`: requires an active (invite) session, sets the password via `auth.updateUser`, stamps `unclaimed=false`, `claimed_at=now()` via service role.

- [ ] **Step 1: Honor a whitelisted `next` in the auth callback**

In `src/app/(auth)/auth/callback/route.ts`, after a successful `exchangeCodeForSession`, replace the hardcoded redirect with a whitelisted-`next` redirect:

```ts
if (!error) {
  // Only allow a known internal next target (claim flow). Everything else
  // falls back to the onboarding gate, which routes by onboarding_status.
  const next = searchParams.get("next");
  const dest = next === "/claim" ? "/claim" : "/onboarding?verified=1";
  return NextResponse.redirect(`${origin}${dest}`);
}
```

- [ ] **Step 2: Write the failing test for `claimAccount`**

```ts
// src/features/accounts/claim-actions.test.ts
import { describe, it, expect, vi } from "vitest";
import { claimAccountCore } from "./claim-actions";

function makeDeps(opts: {
  userId?: string | null;
  updateUserError?: { message: string } | null;
  profileError?: { message: string } | null;
}) {
  const {
    userId = "user-1",
    updateUserError = null,
    profileError = null,
  } = opts;
  const sessionClient = {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({
          data: { user: userId ? { id: userId } : null },
          error: null,
        }),
      updateUser: vi.fn().mockResolvedValue({ error: updateUserError }),
    },
  };
  const profileUpdate = vi
    .fn()
    .mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: profileError }),
    });
  const serviceClient = { from: vi.fn(() => ({ update: profileUpdate })) };
  return {
    sessionClient: sessionClient as never,
    serviceClient: serviceClient as never,
    profileUpdate,
  };
}

describe("claimAccountCore", () => {
  it("rejects when not authenticated", async () => {
    const d = makeDeps({ userId: null });
    const r = await claimAccountCore(
      { sessionClient: d.sessionClient, serviceClient: d.serviceClient },
      "longenoughpw",
    );
    expect(r.kind).toBe("unauthenticated");
  });
  it("rejects a too-short password", async () => {
    const d = makeDeps({});
    const r = await claimAccountCore(
      { sessionClient: d.sessionClient, serviceClient: d.serviceClient },
      "short",
    );
    expect(r.kind).toBe("validation_error");
  });
  it("sets the password and stamps unclaimed=false + claimed_at", async () => {
    const d = makeDeps({});
    const r = await claimAccountCore(
      { sessionClient: d.sessionClient, serviceClient: d.serviceClient },
      "longenoughpw",
    );
    expect(r.kind).toBe("success");
    expect(d.profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        unclaimed: false,
        claimed_at: expect.any(String),
      }),
    );
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `npx vitest run src/features/accounts/claim-actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `claim-actions.ts`**

```ts
// src/features/accounts/claim-actions.ts
"use server";

/**
 * Claim flow: a Cal-created (unclaimed) account sets a password and becomes a
 * normal self-owned account. Runs under the invite session established by the
 * claim link (routed through /auth/callback). Clearing `unclaimed` hands routing
 * back to the onboarding-status middleware.
 */

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { FIELD_LIMITS } from "@/lib/field-limits";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(FIELD_LIMITS.password, "Password is too long");

export type ClaimResult =
  | { kind: "success" }
  | { kind: "unauthenticated" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

export interface ClaimDeps {
  sessionClient: SupabaseClient;
  serviceClient: SupabaseClient;
}

export async function claimAccountCore(
  deps: ClaimDeps,
  newPassword: string,
): Promise<ClaimResult> {
  const { sessionClient, serviceClient } = deps;

  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) return { kind: "unauthenticated" };

  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) {
    return {
      kind: "validation_error",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const { error: pwErr } = await sessionClient.auth.updateUser({
    password: parsed.data,
  });
  if (pwErr) return { kind: "error", message: pwErr.message };

  const { error: flagErr } = await serviceClient
    .from("profiles")
    .update({ unclaimed: false, claimed_at: new Date().toISOString() })
    .eq("id", user.id);
  if (flagErr) return { kind: "error", message: flagErr.message };

  return { kind: "success" };
}

export async function claimAccount(newPassword: string): Promise<ClaimResult> {
  const sessionClient = await createClient();
  const serviceClient = createServiceClient();
  return claimAccountCore({ sessionClient, serviceClient }, newPassword);
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx vitest run src/features/accounts/claim-actions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the claim form client-component**

```tsx
// src/app/(auth)/claim/_components/claim-form.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { claimAccount } from "@/features/accounts/claim-actions";

export function ClaimForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const pw = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (pw !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    start(async () => {
      const result = await claimAccount(pw);
      switch (result.kind) {
        case "success":
          // Onboarding middleware routes by onboarding_status from here.
          router.push("/account");
          router.refresh();
          break;
        case "unauthenticated":
          setError("This claim link has expired. Ask Cal to send a new one.");
          break;
        case "validation_error":
          setError(result.message);
          break;
        case "error":
          setError(result.message);
          break;
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Choose a password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
        />
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Setting up…" : "Claim my account"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 7: Write the claim page (guards unauthenticated + already-claimed)**

```tsx
// src/app/(auth)/claim/page.tsx
import { redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

import { ClaimForm } from "./_components/claim-form";

export default async function ClaimPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No invite session → the link was invalid/expired or opened directly.
  if (!user) redirect("/login?error=claim_expired");

  // Already-claimed account opening an old link → send to normal app.
  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("unclaimed")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.unclaimed !== true) redirect("/account");

  return (
    <PageContainer width="prose">
      <PageHeader
        title="Claim your account"
        subtitle="Cal set up your profile. Choose a password to take it over."
      />
      <ClaimForm />
    </PageContainer>
  );
}
```

Note for implementer: confirm `PageContainer` `width` accepts `"prose"`/`"app"` (check the component); match the auth pages' container usage in `src/app/(auth)/login/page.tsx`.

- [ ] **Step 8: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx vitest run src/features/accounts/claim-actions.test.ts`
Expected: PASS.

```bash
git add "src/app/(auth)/auth/callback/route.ts" "src/app/(auth)/claim" src/features/accounts/claim-actions.ts src/features/accounts/claim-actions.test.ts
git commit -m "feat(auth): add account claim flow for unclaimed clients"
```

---

### Task 9: Admin UI — directory badge + detail claim panel

**Files:**

- Modify: `src/features/admin/clients-actions.ts`
- Create: `src/app/(site)/(admin)/admin/clients/[clientId]/_components/account-claim-panel.tsx`
- Modify: `src/app/(site)/(admin)/admin/clients/_components/clients-index-client.tsx`
- Modify: `src/app/(site)/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx`

**Interfaces:**

- Consumes: `generateClaimLink`, `GenerateClaimLinkResult` (Task 7).
- Produces: `ClientListRow.unclaimed: boolean`; `ClientDetailView.unclaimed: boolean`, `.invited_at: string | null`, `.claimed_at: string | null`.

- [ ] **Step 1: Surface `unclaimed` on the list row**

In `src/features/admin/clients-actions.ts`:

- Add `unclaimed: boolean;` to `interface ClientListRow`.
- Add `unclaimed` to the `listClientsCore` profiles select string: `"id, full_name, email, phone, onboarding_status, unclaimed, created_at, pets(count), bookings(count), client_debits(amount_cents, settled_at)"`.
- Add `unclaimed: boolean | null;` to `interface ProfileWithAggregates`.
- In the `.map(...)`, add: `unclaimed: profile.unclaimed ?? false,`.

- [ ] **Step 2: Surface claim fields on the detail view**

In the same file, in `getClientDetailCore`:

- Add `unclaimed`, `invited_at`, `claimed_at` to the profile select: `"id, full_name, email, phone, address, zip, avatar_url, onboarding_status, unclaimed, invited_at, claimed_at, created_at, role"`.
- Add to `interface ClientDetailView`: `unclaimed: boolean;`, `invited_at: string | null;`, `claimed_at: string | null;`.
- In the `client` object, add:

```ts
    unclaimed: (profile.unclaimed as boolean | null) ?? false,
    invited_at: (profile.invited_at as string | null) ?? null,
    claimed_at: (profile.claimed_at as string | null) ?? null,
```

- [ ] **Step 3: Typecheck (catches every consumer of these types)**

Run: `npx tsc --noEmit`
Expected: errors ONLY where `ClientListRow`/`ClientDetailView` literals are built in tests/fixtures missing the new fields. Fix each by adding `unclaimed: false` (and `invited_at: null`, `claimed_at: null` for detail) to those literals. Re-run until clean.

- [ ] **Step 4: Add the "Unclaimed" badge to the directory**

In `clients-index-client.tsx`, in BOTH the desktop name cell and the mobile card, render a badge when `client.unclaimed`. Desktop — inside the name `<td>`, after the `<Link>`:

```tsx
{
  client.unclaimed ? (
    <Badge variant="secondary" className="ml-2 align-middle">
      Unclaimed
    </Badge>
  ) : null;
}
```

Mobile — inside the `<div className="mt-1 flex flex-wrap gap-2 text-xs">`, add:

```tsx
{
  client.unclaimed ? <Badge variant="secondary">Unclaimed</Badge> : null;
}
```

Note: use whatever neutral `Badge` variant exists (check `src/components/ui/badge.tsx` for valid variant names; if `"secondary"` is absent use the default `<Badge>`). Do not introduce a new color token.

- [ ] **Step 5: Write the Account-claim panel**

```tsx
// src/app/(site)/(admin)/admin/clients/[clientId]/_components/account-claim-panel.tsx
"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/ui/surface";
import { useToast } from "@/components/feedback/toast";
import { generateClaimLink } from "@/features/admin";

export function AccountClaimPanel({
  clientId,
  invitedAt,
}: {
  clientId: string;
  invitedAt: string | null;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [url, setUrl] = useState<string | null>(null);

  function handleGenerate() {
    start(async () => {
      const result = await generateClaimLink(clientId);
      if (result.kind === "success") {
        setUrl(result.url);
      } else if (result.kind === "not_unclaimed") {
        toast.add({
          type: "error",
          title: "Already claimed",
          description: "This client has taken over their account.",
        });
      } else {
        toast.add({
          type: "error",
          title: "Couldn't generate a link",
          description: "Please try again.",
        });
      }
    });
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.add({ type: "success", title: "Link copied" });
  }

  return (
    <Surface variant="plain" className="p-4">
      <h3 className="font-medium">Account claim</h3>
      <p className="text-muted-foreground mt-1 text-sm">
        This is a Cal-created account. Generate a one-time link and send it to
        the client so they can set a password and take it over.
        {invitedAt
          ? ` Last link generated ${new Date(invitedAt).toLocaleString()}.`
          : ""}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">
        Treat this link like a password — anyone with it can take over the
        account.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={handleGenerate} disabled={pending}>
          {pending
            ? "Generating…"
            : invitedAt
              ? "Regenerate claim link"
              : "Generate claim link"}
        </Button>
      </div>
      {url ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            readOnly
            value={url}
            className="min-w-0 flex-1"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button variant="secondary" onClick={copy}>
            Copy
          </Button>
        </div>
      ) : null}
    </Surface>
  );
}
```

- [ ] **Step 6: Render the panel on the detail page (only when unclaimed)**

In `client-detail-client.tsx`, import the panel and render it near the top of the detail layout, gated on `client.unclaimed`:

```tsx
import { AccountClaimPanel } from "./account-claim-panel";
```

```tsx
{
  client.unclaimed ? (
    <AccountClaimPanel clientId={client.id} invitedAt={client.invited_at} />
  ) : null;
}
```

Note for implementer: place it where it reads naturally in the existing detail layout (e.g. just under the profile header card). Match the surrounding spacing tokens.

- [ ] **Step 7: Run the frontend-design skill, typecheck, manual check**

Invoke `frontend-design` for the panel + badge (no new shadows, token-driven, mobile parity).
Run: `npx tsc --noEmit`
Expected: no errors.
Manual (local): an unclaimed seed client shows the badge + panel; generate → copy works; an approved/claimed client shows neither.

- [ ] **Step 8: Commit**

```bash
git add src/features/admin/clients-actions.ts "src/app/(site)/(admin)/admin/clients"
git commit -m "feat(admin): show unclaimed badge and claim-link panel"
```

---

### Task 10: Seed scenario for unclaimed clients

**Files:**

- Modify: `scripts/db-seed/factories.ts`
- Modify: `scripts/db-seed/scenarios.ts`

**Interfaces:**

- Consumes: existing `createAuthUser`, `Ctx`, `createClientUser` patterns in `factories.ts`.
- Produces: `createUnclaimedClientUser(ctx, opts)` factory.

- [ ] **Step 1: Add the factory**

In `scripts/db-seed/factories.ts`, after `createClientUser`, add:

```ts
export async function createUnclaimedClientUser(
  ctx: Ctx,
  opts: {
    email: string;
    fullName: string;
    onboarding: "info_pending" | "meet_greet_pending" | "approved" | "declined";
    invited?: boolean;
  },
): Promise<string> {
  const id = await createAuthUser(ctx.db, opts.email);
  const { error } = await ctx.db
    .from("profiles")
    .update({
      full_name: opts.fullName,
      onboarding_status: opts.onboarding,
      unclaimed: true,
      invited_at: opts.invited ? ctx.now.toISOString() : null,
      phone: "555-0100",
      address: "123 Local St, Boulder, CO",
    })
    .eq("id", id);
  if (error)
    throw new Error(`create unclaimed client ${opts.email}: ${error.message}`);
  ctx.users.set(opts.email, id);
  return id;
}
```

Note for implementer: match the exact tail of `createClientUser` (it sets `ctx.users` and returns the id — confirm `lat`/`lng`/`zip` columns it sets and mirror them; the snippet above mirrors the visible fields, add any others `createClientUser` sets).

- [ ] **Step 2: Use it in the `admin-demo` scenario**

In `scripts/db-seed/scenarios.ts`, import `createUnclaimedClientUser`, and within the `admin-demo` scenario's client step add:

```ts
await createUnclaimedClientUser(ctx, {
  email: "offline-approved@local.test",
  fullName: "Offline Approved",
  onboarding: "approved",
  invited: true,
});
await createUnclaimedClientUser(ctx, {
  email: "offline-pending@local.test",
  fullName: "Offline Pending",
  onboarding: "info_pending",
});
```

Note for implementer: find the `admin-demo` scenario's client-creation `Step` and add these inside its `run(ctx)`. If `admin-demo` composes other scenarios' steps, add a small dedicated step and include it in the `admin-demo` step list.

- [ ] **Step 3: Run the seed + the seeder tests**

Run: `npx vitest run scripts/db-seed/scenarios.test.ts`
Expected: PASS (adjust the test if it asserts an exact client count for `admin-demo` — update the expected count to include the two new clients).
Then (local stack): `npm run db:seed -- admin-demo`
Expected: completes; `/admin/clients` shows the two unclaimed clients with badges.

- [ ] **Step 4: Commit**

```bash
git add scripts/db-seed/factories.ts scripts/db-seed/scenarios.ts scripts/db-seed/scenarios.test.ts
git commit -m "feat(seed): add unclaimed clients to admin-demo scenario"
```

---

### Task 11: Integration test — end-to-end against local Supabase

**Files:**

- Create: `src/features/admin/create-client.integration.test.ts`

**Interfaces:**

- Consumes: `createUnclaimedClientCore`, `generateClaimLinkCore` (Tasks 5, 7); the local service-role client + an anon/authenticated client builder used by sibling integration tests (copy the harness from `src/features/booking/admin-create-booking.integration.test.ts`).

- [ ] **Step 1: Write the integration test**

Mirror the setup of `src/features/booking/admin-create-booking.integration.test.ts` (same skip-if-no-local-stack guard, same service-role + admin-user bootstrap). Assert:

```
1. createUnclaimedClientCore with an admin actor + fresh email →
   kind:"success"; a profiles row exists with unclaimed=true and the chosen
   onboarding_status; a matching auth.users row exists with no usable password.
2. createUnclaimedClientCore with the SAME email again → kind:"email_exists"
   and clientId equals the first client's id.
3. RLS column guard: signed in AS that client's session (or any non-admin
   authenticated user) an UPDATE of profiles.unclaimed = false is rejected /
   affects 0 rows — the flag is not client-writable.
4. generateClaimLinkCore for the unclaimed client → kind:"success" with a
   non-empty url; profiles.invited_at is now set.
5. generateClaimLinkCore for an already-claimed client (flip unclaimed=false
   via service role first) → kind:"not_unclaimed".
```

Note for implementer: follow the existing integration harness exactly for client construction and the `describe.skipIf(!process.env.<localFlag>)` pattern those tests use. Do not invent a new harness.

- [ ] **Step 2: Run it against the local stack**

Run (local stack up): `npx vitest run src/features/admin/create-client.integration.test.ts`
Expected: PASS (or SKIPPED if the local-stack env flag is unset — matching sibling integration tests).

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/create-client.integration.test.ts
git commit -m "test(admin): integration coverage for unclaimed client creation"
```

---

## Self-Review

**Spec coverage:**

- Data model (`unclaimed`/`claimed_at`/`invited_at`, RLS guard) → Task 1 (+ guard verified in Task 11).
- Create flow (`/admin/clients/new`, `createUnclaimedClient`, email collision) → Tasks 5, 6.
- Claim flow (`generateLink`, `/claim`, set password, flag clear, callback `next`) → Tasks 7, 8.
- Notification suppression (`shouldNotify` at every dispatch boundary) → Tasks 2, 3, 4. (Create-path confirmation needs no gate: admin on-behalf `createBookingForClient` calls `createBookingCore` directly and sends no email; the self-serve `createBookingMutation` can't target an unclaimed client because they can't log in.)
- Admin UI (directory badge, detail claim panel) → Task 9.
- Testing (pure/unit + integration) → Tasks 2,5,7,8 (unit) + Task 11 (integration).
- Seeding → Task 10.
- Docs (DESIGN.md same-commit) → Task 1.

**Placeholder scan:** No "TBD"/"handle errors"/"similar to" — every code step shows real code. "Note for implementer" lines flag where the implementer must confirm an existing API name against the repo (intentional verification points, not deferred work).

**Type consistency:** `CreateClientResult`/`CreateClientInput`/`GenerateClaimLinkResult`/`ClaimResult` used identically across producer and consumer tasks. `shouldNotify({ unclaimed })` signature matches the schema shape `{ email, unclaimed }` selected in Tasks 3/4. `ClientListRow.unclaimed`/`ClientDetailView.unclaimed|invited_at|claimed_at` added in Task 9 and consumed in the same task's UI.
