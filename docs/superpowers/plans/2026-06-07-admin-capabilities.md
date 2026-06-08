# Admin Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Cal four in-app admin capabilities — a clients directory (index + detail with Kiche/debit/booking mutations), a booking calendar, an `/admin` dashboard, and an inquiries flow (public `/contact` form → admin queue with email/SMS reply handoff).

**Architecture:** Follows the established repo split: pure logic in `features/*` (DI cores returning discriminated `{ kind }` / `{ ok }` unions), thin `"use server"` wrappers (`getActorOrRedirect()` + `createServiceClient()` + `revalidatePath`), Zod parse at the DB edge, identity-gated reads/writes via `assertActorIsAdmin` + service-role client (mirrors `features/admin/admin-busy.ts`). UI composes the existing shell (`PageContainer`/`PageHeader`), component kit (`ui/*`), and feedback kit (`useToast`, `useConfirm`, `EmptyState`, `ErrorState`). Inquiries adds one new table + RLS. No Scheduler internals touched; the booking calendar is a new read-only month component.

**Tech Stack:** Next.js App Router (RSC + server actions), TypeScript strict, Supabase (Postgres + RLS + service role), `@base-ui/react` kit, Tailwind v4 semantic tokens, Zod, Vitest.

---

## Spec

`docs/superpowers/specs/2026-06-07-admin-capabilities-phase4a-design.md`. Read it first.

## Verification baseline (confirm green before relying on it)

```bash
npx vitest run        # ~587 tests / 38 files
npx tsc --noEmit
npx eslint "src/**/*.{ts,tsx}"
npx next build
```

Repo bans (eslint): no `setState` in an effect body; no read/write of `ref.current` during render. Use the latest-ref pattern + `key={…}` remounts. Commit messages: **Conventional Commits, subject line only, no body, no trailers, no phase numbers / codenames / ticket IDs** (AGENTS.md constitution). Stage files **by name** (never `git add -A`). **Do NOT push** (`main` auto-deploys to prod; the maintainer batches the push). Visual / 390px / keyboard walks are the maintainer's browser loop — not headless.

## File structure

Pure logic (unit-tested, no IO):

- Create `src/features/admin/client-balance.ts` — outstanding-balance sum.
- Create `src/features/admin/client-search.ts` — client search predicate.
- Create `src/features/inquiries/reply-draft.ts` — reply subject/body + `mailto:`/`sms:` URL builders.
- Create `src/features/admin/client-balance.test.ts`, `client-search.test.ts`, `src/features/inquiries/reply-draft.test.ts`.

Data + actions:

- Create `supabase/migrations/20260607150000_inquiries.sql`.
- Create `src/features/inquiries/inquiry-schema.ts`, `src/features/inquiries/inquiry-actions.ts`.
- Create `src/features/admin/clients-actions.ts`, `src/features/admin/bookings-calendar-actions.ts`.

UI:

- Modify `src/components/layout/nav-config.ts` (add Clients + Inquiries to `adminNav`).
- Modify `src/components/site-header.tsx` (add Contact to marketing `navLinks`).
- Create `src/app/(marketing)/contact/page.tsx` + `_components/contact-form.tsx`.
- Create `src/app/(admin)/admin/clients/page.tsx` + `_components/clients-index-client.tsx`.
- Create `src/app/(admin)/admin/clients/[clientId]/page.tsx` + `_components/client-detail-client.tsx`.
- Create `src/app/(admin)/admin/inquiries/page.tsx` + `_components/inquiries-client.tsx`.
- Modify `src/app/(admin)/admin/bookings/page.tsx` + replace `_components/bookings-client.tsx` with `_components/bookings-calendar-client.tsx`.
- Modify `src/app/(admin)/admin/page.tsx` (redirect → dashboard).

Docs (same-commit rule):

- Modify `docs/DESIGN.md` (route map + `inquiries` table in data model).
- Modify `docs/FRONTEND.md` (new admin table + read-only month patterns).

---

## Task 1: Pure — outstanding-balance helper

**Files:**

- Create: `src/features/admin/client-balance.ts`
- Test: `src/features/admin/client-balance.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { outstandingBalanceCents, type DebitLike } from "./client-balance";

describe("outstandingBalanceCents", () => {
  it("sums only unsettled debits", () => {
    const debits: DebitLike[] = [
      { amount_cents: 1500, settled_at: null },
      { amount_cents: 3000, settled_at: "2026-06-01T00:00:00Z" },
      { amount_cents: 500, settled_at: null },
    ];
    expect(outstandingBalanceCents(debits)).toBe(2000);
  });

  it("returns 0 for no debits or all settled", () => {
    expect(outstandingBalanceCents([])).toBe(0);
    expect(
      outstandingBalanceCents([{ amount_cents: 100, settled_at: "x" }]),
    ).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/admin/client-balance.test.ts`
Expected: FAIL — cannot find module `./client-balance`.

- [ ] **Step 3: Write minimal implementation**

```ts
/** Outstanding-balance math for a client's debits. Pure (ENGINEERING #5). */

export interface DebitLike {
  amount_cents: number;
  settled_at: string | null;
}

/** Sum of unsettled debit amounts (cents). Unsettled = settled_at is null. */
export function outstandingBalanceCents(debits: DebitLike[]): number {
  return debits.reduce(
    (sum, d) => (d.settled_at === null ? sum + d.amount_cents : sum),
    0,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/admin/client-balance.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/client-balance.ts src/features/admin/client-balance.test.ts
git commit -m "feat: client outstanding-balance helper"
```

---

## Task 2: Pure — client search predicate

**Files:**

- Create: `src/features/admin/client-search.ts`
- Test: `src/features/admin/client-search.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { matchesClientQuery, type ClientSearchable } from "./client-search";

const c: ClientSearchable = {
  full_name: "Jamie Rivera",
  email: "jamie@example.com",
  phone: "720-555-0143",
};

describe("matchesClientQuery", () => {
  it("matches case-insensitively on name, email, or phone substring", () => {
    expect(matchesClientQuery(c, "rivera")).toBe(true);
    expect(matchesClientQuery(c, "JAMIE@")).toBe(true);
    expect(matchesClientQuery(c, "0143")).toBe(true);
  });

  it("empty/whitespace query matches everything", () => {
    expect(matchesClientQuery(c, "")).toBe(true);
    expect(matchesClientQuery(c, "   ")).toBe(true);
  });

  it("returns false on no match and tolerates null fields", () => {
    expect(matchesClientQuery(c, "zzz")).toBe(false);
    expect(
      matchesClientQuery({ full_name: null, email: null, phone: null }, "x"),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/admin/client-search.test.ts`
Expected: FAIL — cannot find module `./client-search`.

- [ ] **Step 3: Write minimal implementation**

```ts
/** Client-side search predicate for the admin clients index. Pure. */

export interface ClientSearchable {
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

/** True if query (trimmed, case-insensitive) is a substring of any field. */
export function matchesClientQuery(
  c: ClientSearchable,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return [c.full_name, c.email, c.phone].some(
    (f) => typeof f === "string" && f.toLowerCase().includes(q),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/admin/client-search.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/client-search.ts src/features/admin/client-search.test.ts
git commit -m "feat: admin client search predicate"
```

---

## Task 3: Pure — inquiry reply draft + handoff URLs

**Files:**

- Create: `src/features/inquiries/reply-draft.ts`
- Test: `src/features/inquiries/reply-draft.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  replySubject,
  replyBody,
  mailtoUrl,
  smsUrl,
  type InquiryLike,
} from "./reply-draft";

const inq: InquiryLike = {
  name: "Jamie Rivera",
  subject: "Weekend walks",
  message: "Do you cover weekends?",
};

describe("reply-draft", () => {
  it("prefixes the subject, falling back when absent", () => {
    expect(replySubject(inq)).toBe("Re: Weekend walks");
    expect(replySubject({ ...inq, subject: null })).toBe("Re: your inquiry");
  });

  it("greets by first name and leaves space for the real reply", () => {
    const body = replyBody(inq);
    expect(body.startsWith("Hi Jamie,")).toBe(true);
    expect(body).toContain("Thanks for reaching out");
  });

  it("greets 'there' when name is blank", () => {
    expect(replyBody({ ...inq, name: "  " }).startsWith("Hi there,")).toBe(
      true,
    );
  });

  it("builds an encoded mailto with subject + body, kept short", () => {
    const url = mailtoUrl(
      "jamie@example.com",
      "Re: Weekend walks",
      "Hi Jamie,",
    );
    expect(url.startsWith("mailto:jamie@example.com?")).toBe(true);
    expect(url).toContain("subject=Re");
    expect(url).toContain("body=Hi");
    expect(url.length).toBeLessThan(1500);
  });

  it("builds an sms url with an encoded body and no subject", () => {
    const url = smsUrl("7205550143", "Hi Jamie,");
    expect(url).toBe("sms:7205550143?&body=Hi%20Jamie%2C");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/inquiries/reply-draft.test.ts`
Expected: FAIL — cannot find module `./reply-draft`.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Inquiry reply-draft builders. Pure, string-only. The generated body is kept
 * deliberately short (greeting + lead-in) so the resulting mailto: URL stays
 * well under browser/OS URL-length limits — Cal writes the real reply in their
 * own mail/SMS client.
 */

export interface InquiryLike {
  name: string;
  subject: string | null;
  message: string;
}

export function replySubject(inq: InquiryLike): string {
  const s = inq.subject?.trim();
  return s ? `Re: ${s}` : "Re: your inquiry";
}

export function replyBody(inq: InquiryLike): string {
  const first = inq.name.trim().split(/\s+/)[0] || "there";
  return `Hi ${first},\n\nThanks for reaching out — `;
}

/** Encoded mailto: with subject + body query params. */
export function mailtoUrl(
  email: string,
  subject: string,
  body: string,
): string {
  const params = new URLSearchParams({ subject, body });
  return `mailto:${email}?${params.toString()}`;
}

/** sms: deep link with an encoded body (no subject — SMS has none). The `?&`
 * form is the cross-platform convention iOS/Android both accept. */
export function smsUrl(phone: string, body: string): string {
  return `sms:${phone}?&body=${encodeURIComponent(body)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/inquiries/reply-draft.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/inquiries/reply-draft.ts src/features/inquiries/reply-draft.test.ts
git commit -m "feat: inquiry reply-draft and handoff url builders"
```

---

## Task 4: Migration — `inquiries` table + RLS + doc

**Files:**

- Create: `supabase/migrations/20260607150000_inquiries.sql`
- Modify: `docs/DESIGN.md` (data model — add `inquiries`)

- [ ] **Step 1: Write the migration**

`supabase/migrations/20260607150000_inquiries.sql`:

```sql
-- Inquiries: public contact-form submissions feeding the admin inquiries queue.
-- Guests submit (client_id null) or signed-in clients (client_id set). Cal reads
-- + updates via the admin role. App-level honeypot + rate-limit guard the insert;
-- RLS keeps reads admin/owner-only.

create table inquiries (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references profiles(id) on delete set null,
  name        text not null,
  email       text not null,
  phone       text,
  subject     text,
  message     text not null,
  status      text not null default 'new' check (status in ('new', 'resolved')),
  replied_at  timestamptz,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create index inquiries_status_created_idx on inquiries (status, created_at desc);
create index inquiries_email_created_idx on inquiries (email, created_at desc);

alter table inquiries enable row level security;
revoke all on inquiries from anon, authenticated;

-- Anyone may submit (guest contact form). Defense-in-depth: the server action
-- also runs honeypot + per-email rate-limit before inserting.
grant insert on inquiries to anon, authenticated;
create policy "inquiries: anyone can submit"
  on inquiries for insert
  with check (true);

-- Signed-in clients may read their own; admin reads/updates all.
grant select on inquiries to authenticated;
create policy "inquiries: owner or admin can read"
  on inquiries for select
  using (client_id = auth.uid() or is_admin());

create policy "inquiries: admin can update"
  on inquiries for update
  using (is_admin())
  with check (is_admin());
```

- [ ] **Step 2: Apply the migration to the local stack**

Run: `npx supabase db reset` (or `npx supabase migration up` if the stack is already seeded).
Expected: migration applies clean; `inquiries` table present (`npx supabase db diff` shows no drift).

- [ ] **Step 3: Update DESIGN.md data model**

In `docs/DESIGN.md`, under **Data model → Tables**, add a bullet after `reviews`:

```md
- **`inquiries`** — public contact-form submissions. `id` · `client_id` (nullable
  FK→profiles; null = guest, set = signed-in submitter) · `name · email · phone`
  (nullable) `· subject` (nullable) `· message · status` ('new' | 'resolved') `·
replied_at` (nullable; stamped when Cal opens an email/SMS reply — a timestamp,
  not a state) `· resolved_at` (nullable) `· created_at`. RLS: anyone may insert
  (guest submit; app-level honeypot + per-email rate-limit guard it), owner/admin
  read, admin update.
```

Also update the route map: change the `/admin/clients` row note from `(optional) Client list` to `Client directory + detail`, the `/admin/bookings` row note to `Booking calendar + approvals`, and add two rows: `/contact` (marketing, public, "Inquiry / contact form") and `/admin/inquiries` (admin, "Inquiry queue + reply handoff"). Bump the `_Last reviewed_` footer note.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260607150000_inquiries.sql docs/DESIGN.md
git commit -m "feat: inquiries table with rls"
```

---

## Task 5: Inquiries — schema + server actions

**Files:**

- Create: `src/features/inquiries/inquiry-schema.ts`
- Create: `src/features/inquiries/inquiry-actions.ts`

- [ ] **Step 1: Write the Zod schema**

`src/features/inquiries/inquiry-schema.ts`:

```ts
import { z } from "zod";

/** Public contact-form input. `company` is a honeypot — real users leave it
 * empty; a filled value means a bot, and the action silently drops it. */
export const submitInquirySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email").max(200),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  subject: z.string().trim().max(200).optional().or(z.literal("")),
  message: z.string().trim().min(1, "Message is required").max(4000),
  company: z.string().optional(), // honeypot
});

export type SubmitInquiryInput = z.infer<typeof submitInquirySchema>;
```

- [ ] **Step 2: Write the actions (cores + wrappers)**

`src/features/inquiries/inquiry-actions.ts`:

```ts
"use server";

/**
 * Inquiry server actions.
 *
 * submitInquiry is PUBLIC (guest or signed-in). It uses the service-role client
 * so it can run the per-email rate-limit read (RLS hides inquiries from anon).
 * The honeypot + rate-limit + Zod validation are the guard; the RLS insert
 * policy is defense-in-depth. Admin actions (list/resolve/replied) are gated.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "@/features/admin/admin-guard";
import { getActorOrRedirect } from "@/features/admin/admin-session";
import { submitInquirySchema, type SubmitInquiryInput } from "./inquiry-schema";
import type { SupabaseClient } from "@supabase/supabase-js";

const RATE_LIMIT_WINDOW_MS = 60_000;

export type InquirySubmitResult = { ok: true } | { ok: false; error: string };

export interface InquiryRow {
  id: string;
  client_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: "new" | "resolved";
  replied_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

const inquiryRowSchema = z.object({
  id: z.string(),
  client_id: z.string().nullable(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  subject: z.string().nullable(),
  message: z.string(),
  status: z.enum(["new", "resolved"]),
  replied_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
  created_at: z.string(),
});

export type ListInquiriesResult =
  | { kind: "success"; inquiries: InquiryRow[] }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

export type InquiryMutationResult =
  | { kind: "success" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

export interface AdminDeps {
  serviceClient: SupabaseClient;
  actorUserId: string;
}

// ─── Submit (public) ──────────────────────────────────────────────────────────

export async function submitInquiryCore(
  serviceClient: SupabaseClient,
  userId: string | null,
  rawInput: SubmitInquiryInput,
): Promise<InquirySubmitResult> {
  const parsed = submitInquirySchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  const input = parsed.data;

  // Honeypot: silently accept (don't tip off the bot) without inserting.
  if (input.company && input.company.length > 0) return { ok: true };

  // Rate-limit: one submission per email per window.
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error: countErr } = await serviceClient
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq("email", input.email)
    .gte("created_at", cutoff);
  if (countErr) return { ok: false, error: countErr.message };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error:
        "You just sent a message — please wait a moment before sending another.",
    };
  }

  const { error } = await serviceClient.from("inquiries").insert({
    client_id: userId,
    name: input.name,
    email: input.email,
    phone: input.phone ? input.phone : null,
    subject: input.subject ? input.subject : null,
    message: input.message,
    status: "new" as const,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function submitInquiry(
  input: SubmitInquiryInput,
): Promise<InquirySubmitResult> {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  const serviceClient = createServiceClient();
  return submitInquiryCore(serviceClient, user?.id ?? null, input);
}

// ─── Admin: list / resolve / mark replied ──────────────────────────────────────

export async function listInquiriesCore(
  deps: AdminDeps,
): Promise<ListInquiriesResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId)))
    return { kind: "forbidden" };

  const { data, error } = await deps.serviceClient
    .from("inquiries")
    .select(
      "id, client_id, name, email, phone, subject, message, status, replied_at, resolved_at, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) return { kind: "error", message: error.message };

  const inquiries: InquiryRow[] = [];
  for (const row of data ?? []) {
    const parsed = inquiryRowSchema.safeParse(row);
    if (!parsed.success)
      return {
        kind: "error",
        message: `Bad inquiry row: ${parsed.error.message}`,
      };
    inquiries.push(parsed.data);
  }
  // New first, then newest-created.
  inquiries.sort((a, b) => {
    if (a.status !== b.status) return a.status === "new" ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });
  return { kind: "success", inquiries };
}

export async function markInquiryResolvedCore(
  deps: AdminDeps,
  inquiryId: string,
): Promise<InquiryMutationResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId)))
    return { kind: "forbidden" };
  const { error } = await deps.serviceClient
    .from("inquiries")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", inquiryId);
  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

export async function stampInquiryRepliedCore(
  deps: AdminDeps,
  inquiryId: string,
): Promise<InquiryMutationResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId)))
    return { kind: "forbidden" };
  const { error } = await deps.serviceClient
    .from("inquiries")
    .update({ replied_at: new Date().toISOString() })
    .eq("id", inquiryId);
  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

export async function listInquiries(): Promise<ListInquiriesResult> {
  const actorUserId = await getActorOrRedirect();
  return listInquiriesCore({
    serviceClient: createServiceClient(),
    actorUserId,
  });
}

export async function markInquiryResolved(
  inquiryId: string,
): Promise<InquiryMutationResult> {
  const actorUserId = await getActorOrRedirect();
  const result = await markInquiryResolvedCore(
    { serviceClient: createServiceClient(), actorUserId },
    inquiryId,
  );
  if (result.kind === "success") revalidatePath("/admin/inquiries");
  return result;
}

export async function stampInquiryReplied(
  inquiryId: string,
): Promise<InquiryMutationResult> {
  const actorUserId = await getActorOrRedirect();
  const result = await stampInquiryRepliedCore(
    { serviceClient: createServiceClient(), actorUserId },
    inquiryId,
  );
  if (result.kind === "success") revalidatePath("/admin/inquiries");
  return result;
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint "src/features/inquiries/**/*.ts"`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/inquiries/inquiry-schema.ts src/features/inquiries/inquiry-actions.ts
git commit -m "feat: inquiry submit and admin queue actions"
```

---

## Task 6: Clients — admin actions

**Files:**

- Create: `src/features/admin/clients-actions.ts`

Uses the Task 1 balance helper. Aggregates pets/bookings/debits in JS (Cal-scale dataset; keeps queries simple and the math testable). Pet photos signed exactly like `admin-busy.ts`.

- [ ] **Step 1: Write the actions**

`src/features/admin/clients-actions.ts`:

```ts
"use server";

/**
 * Admin clients directory: index aggregates + per-client detail, plus the two
 * documented admin mutations with no prior UI (Kiche eligibility, debit settle).
 * Service-role after admin check (mirrors admin-busy.ts).
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "./admin-guard";
import { getActorOrRedirect } from "./admin-session";
import { outstandingBalanceCents } from "./client-balance";
import type { SupabaseClient } from "@supabase/supabase-js";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export interface AdminDeps {
  serviceClient: SupabaseClient;
  actorUserId: string;
}

// ─── Index ──────────────────────────────────────────────────────────────────

export interface ClientListRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  petCount: number;
  bookingCount: number;
  outstandingCents: number;
  onboardingComplete: boolean;
}

export type ListClientsResult =
  | { kind: "success"; clients: ClientListRow[] }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

export async function listClientsCore(
  deps: AdminDeps,
): Promise<ListClientsResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId)))
    return { kind: "forbidden" };
  const svc = deps.serviceClient;

  const { data: profiles, error: pErr } = await svc
    .from("profiles")
    .select("id, full_name, email, phone, onboarding_complete")
    .eq("role", "client")
    .order("created_at", { ascending: false });
  if (pErr) return { kind: "error", message: pErr.message };

  const { data: pets, error: petErr } = await svc
    .from("pets")
    .select("client_id");
  if (petErr) return { kind: "error", message: petErr.message };

  const { data: bookings, error: bErr } = await svc
    .from("bookings")
    .select("client_id");
  if (bErr) return { kind: "error", message: bErr.message };

  const { data: debits, error: dErr } = await svc
    .from("client_debits")
    .select("client_id, amount_cents, settled_at");
  if (dErr) return { kind: "error", message: dErr.message };

  const countBy = (rows: { client_id: string }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.client_id, (m.get(r.client_id) ?? 0) + 1);
    return m;
  };
  const petCounts = countBy((pets ?? []) as { client_id: string }[]);
  const bookingCounts = countBy((bookings ?? []) as { client_id: string }[]);

  const debitsByClient = new Map<
    string,
    { amount_cents: number; settled_at: string | null }[]
  >();
  for (const d of (debits ?? []) as {
    client_id: string;
    amount_cents: number;
    settled_at: string | null;
  }[]) {
    const list = debitsByClient.get(d.client_id) ?? [];
    list.push({ amount_cents: d.amount_cents, settled_at: d.settled_at });
    debitsByClient.set(d.client_id, list);
  }

  const clients: ClientListRow[] = (profiles ?? []).map((p) => ({
    id: p.id as string,
    full_name: (p.full_name as string | null) ?? null,
    email: (p.email as string | null) ?? null,
    phone: (p.phone as string | null) ?? null,
    petCount: petCounts.get(p.id as string) ?? 0,
    bookingCount: bookingCounts.get(p.id as string) ?? 0,
    outstandingCents: outstandingBalanceCents(
      debitsByClient.get(p.id as string) ?? [],
    ),
    onboardingComplete: Boolean(p.onboarding_complete),
  }));

  return { kind: "success", clients };
}

// ─── Detail ───────────────────────────────────────────────────────────────────

export interface ClientPet {
  id: string;
  name: string;
  species: "dog" | "cat";
  breed: string | null;
  notes: string | null;
  photoUrl: string | null;
}
export interface ClientFormResponse {
  id: string;
  form_key: string;
  booking_id: string | null;
  data: unknown;
  submitted_at: string;
}
export interface ClientBookingRow {
  id: string;
  service_name: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  final_cents: number;
}
export interface ClientDebitRow {
  id: string;
  booking_id: string | null;
  amount_cents: number;
  reason: string;
  settled_at: string | null;
  created_at: string;
}
export interface ClientDetailView {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  zip: string | null;
  avatar_url: string | null;
  kiche_allowed: boolean;
  onboarding_complete: boolean;
  created_at: string;
  pets: ClientPet[];
  forms: ClientFormResponse[];
  bookings: ClientBookingRow[];
  debits: ClientDebitRow[];
  outstandingCents: number;
}

export type GetClientDetailResult =
  | { kind: "success"; client: ClientDetailView }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

export async function getClientDetailCore(
  deps: AdminDeps,
  clientId: string,
): Promise<GetClientDetailResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId)))
    return { kind: "forbidden" };
  const svc = deps.serviceClient;

  const { data: p, error: pErr } = await svc
    .from("profiles")
    .select(
      "id, full_name, email, phone, address, zip, avatar_url, kiche_allowed, onboarding_complete, created_at, role",
    )
    .eq("id", clientId)
    .single();
  if (pErr || !p) return { kind: "not_found" };

  const { data: pets } = await svc
    .from("pets")
    .select("id, name, species, breed, notes, photo_url")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  const signPhoto = async (path: string): Promise<string | null> => {
    const { data } = await svc.storage
      .from("pet-photos")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    return data?.signedUrl ?? null;
  };
  const petViews: ClientPet[] = await Promise.all(
    (pets ?? []).map(async (pet) => ({
      id: pet.id as string,
      name: pet.name as string,
      species: pet.species as "dog" | "cat",
      breed: (pet.breed as string | null) ?? null,
      notes: (pet.notes as string | null) ?? null,
      photoUrl: pet.photo_url ? await signPhoto(pet.photo_url as string) : null,
    })),
  );

  const { data: forms } = await svc
    .from("form_responses")
    .select("id, form_key, booking_id, data, submitted_at")
    .eq("client_id", clientId)
    .order("submitted_at", { ascending: false });

  const { data: bookings } = await svc
    .from("bookings")
    .select("id, status, starts_at, ends_at, final_cents, services(name)")
    .eq("client_id", clientId)
    .order("starts_at", { ascending: false });

  const { data: debits } = await svc
    .from("client_debits")
    .select("id, booking_id, amount_cents, reason, settled_at, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  const debitRows: ClientDebitRow[] = (debits ?? []).map((d) => ({
    id: d.id as string,
    booking_id: (d.booking_id as string | null) ?? null,
    amount_cents: d.amount_cents as number,
    reason: d.reason as string,
    settled_at: (d.settled_at as string | null) ?? null,
    created_at: d.created_at as string,
  }));

  const client: ClientDetailView = {
    id: p.id as string,
    full_name: (p.full_name as string | null) ?? null,
    email: (p.email as string | null) ?? null,
    phone: (p.phone as string | null) ?? null,
    address: (p.address as string | null) ?? null,
    zip: (p.zip as string | null) ?? null,
    avatar_url: (p.avatar_url as string | null) ?? null,
    kiche_allowed: Boolean(p.kiche_allowed),
    onboarding_complete: Boolean(p.onboarding_complete),
    created_at: p.created_at as string,
    pets: petViews,
    forms: (forms ?? []).map((f) => ({
      id: f.id as string,
      form_key: f.form_key as string,
      booking_id: (f.booking_id as string | null) ?? null,
      data: f.data,
      submitted_at: f.submitted_at as string,
    })),
    bookings: (bookings ?? []).map((b) => {
      const svcJoin = b.services as
        | { name: string }
        | { name: string }[]
        | null;
      const service_name = Array.isArray(svcJoin)
        ? (svcJoin[0]?.name ?? null)
        : (svcJoin?.name ?? null);
      return {
        id: b.id as string,
        service_name,
        status: b.status as string,
        starts_at: b.starts_at as string,
        ends_at: b.ends_at as string,
        final_cents: b.final_cents as number,
      };
    }),
    debits: debitRows,
    outstandingCents: outstandingBalanceCents(debitRows),
  };

  return { kind: "success", client };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export type ClientMutationResult =
  | { kind: "success" }
  | { kind: "forbidden" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

const uuid = z.string().uuid();

export async function setKicheAllowedCore(
  deps: AdminDeps,
  clientId: string,
  allowed: boolean,
): Promise<ClientMutationResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId)))
    return { kind: "forbidden" };
  if (!uuid.safeParse(clientId).success)
    return { kind: "validation_error", message: "Invalid client id" };
  const { error } = await deps.serviceClient
    .from("profiles")
    .update({ kiche_allowed: allowed })
    .eq("id", clientId)
    .eq("role", "client");
  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

export async function settleDebitCore(
  deps: AdminDeps,
  debitId: string,
): Promise<ClientMutationResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId)))
    return { kind: "forbidden" };
  if (!uuid.safeParse(debitId).success)
    return { kind: "validation_error", message: "Invalid debit id" };
  const { error } = await deps.serviceClient
    .from("client_debits")
    .update({ settled_at: new Date().toISOString() })
    .eq("id", debitId)
    .is("settled_at", null);
  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

// ─── Wrappers ─────────────────────────────────────────────────────────────────

export async function listClients(): Promise<ListClientsResult> {
  const actorUserId = await getActorOrRedirect();
  return listClientsCore({ serviceClient: createServiceClient(), actorUserId });
}

export async function getClientDetail(
  clientId: string,
): Promise<GetClientDetailResult> {
  const actorUserId = await getActorOrRedirect();
  return getClientDetailCore(
    { serviceClient: createServiceClient(), actorUserId },
    clientId,
  );
}

export async function setKicheAllowed(
  clientId: string,
  allowed: boolean,
): Promise<ClientMutationResult> {
  const actorUserId = await getActorOrRedirect();
  const result = await setKicheAllowedCore(
    { serviceClient: createServiceClient(), actorUserId },
    clientId,
    allowed,
  );
  if (result.kind === "success") revalidatePath(`/admin/clients/${clientId}`);
  return result;
}

export async function settleDebit(
  debitId: string,
  clientId: string,
): Promise<ClientMutationResult> {
  const actorUserId = await getActorOrRedirect();
  const result = await settleDebitCore(
    { serviceClient: createServiceClient(), actorUserId },
    debitId,
  );
  if (result.kind === "success") revalidatePath(`/admin/clients/${clientId}`);
  return result;
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint "src/features/admin/clients-actions.ts"`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/clients-actions.ts
git commit -m "feat: admin clients directory actions"
```

---

## Task 7: Booking calendar — admin range read

**Files:**

- Create: `src/features/admin/bookings-calendar-actions.ts`

Self-contained admin read with joins (mirrors `approval-actions` direct query). Chosen over extending the booking repository to avoid coupling the calendar to Scheduler Layer-1/2 — the existing `getActiveBusyRangesEnriched` is active-only/now-forward, while the calendar needs an arbitrary month window including completed/cancelled.

- [ ] **Step 1: Write the action**

`src/features/admin/bookings-calendar-actions.ts`:

```ts
"use server";

/** Admin booking-calendar read: all bookings whose start falls in a date range,
 * enriched with client + service names. Service-role after admin check. */

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "./admin-guard";
import { getActorOrRedirect } from "./admin-session";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface BookingCalendarRow {
  id: string;
  client_id: string;
  client_name: string | null;
  service_name: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  final_cents: number;
}

export type ListBookingsInRangeResult =
  | { kind: "success"; bookings: BookingCalendarRow[] }
  | { kind: "forbidden" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

export interface AdminDeps {
  serviceClient: SupabaseClient;
  actorUserId: string;
}

const rangeSchema = z.object({
  startIso: z.string().datetime(),
  endIso: z.string().datetime(),
});

function joinName(
  j: { name: string } | { name: string }[] | null,
): string | null {
  if (Array.isArray(j)) return j[0]?.name ?? null;
  return j?.name ?? null;
}

export async function listBookingsInRangeCore(
  deps: AdminDeps,
  range: { startIso: string; endIso: string },
): Promise<ListBookingsInRangeResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId)))
    return { kind: "forbidden" };
  const parsed = rangeSchema.safeParse(range);
  if (!parsed.success)
    return { kind: "validation_error", message: parsed.error.message };

  const { data, error } = await deps.serviceClient
    .from("bookings")
    .select(
      "id, client_id, status, starts_at, ends_at, final_cents, profiles(full_name), services(name)",
    )
    .gte("starts_at", parsed.data.startIso)
    .lt("starts_at", parsed.data.endIso)
    .order("starts_at", { ascending: true });
  if (error) return { kind: "error", message: error.message };

  const bookings: BookingCalendarRow[] = (data ?? []).map((b) => ({
    id: b.id as string,
    client_id: b.client_id as string,
    client_name: joinName(
      b.profiles as { name: string } | null,
    ) /* profiles join below */,
    service_name: joinName(b.services as { name: string } | null),
    status: b.status as string,
    starts_at: b.starts_at as string,
    ends_at: b.ends_at as string,
    final_cents: b.final_cents as number,
  }));
  return { kind: "success", bookings };
}

export async function listBookingsInRange(range: {
  startIso: string;
  endIso: string;
}): Promise<ListBookingsInRangeResult> {
  const actorUserId = await getActorOrRedirect();
  return listBookingsInRangeCore(
    { serviceClient: createServiceClient(), actorUserId },
    range,
  );
}
```

Note: the `profiles` join returns `{ full_name }`, not `{ name }`. Fix the `client_name` line to read `full_name`:

```ts
client_name: (() => {
  const j = b.profiles as { full_name: string } | { full_name: string }[] | null;
  return Array.isArray(j) ? (j[0]?.full_name ?? null) : (j?.full_name ?? null);
})(),
```

Apply that corrected `client_name` mapping (drop the `joinName` call for profiles; keep `joinName` for `services`).

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint "src/features/admin/bookings-calendar-actions.ts"`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/bookings-calendar-actions.ts
git commit -m "feat: admin booking calendar range read"
```

---

## Task 8: Nav wiring — admin sidebar + marketing Contact

**Files:**

- Modify: `src/components/layout/nav-config.ts`
- Modify: `src/components/site-header.tsx`

- [ ] **Step 1: Add Clients + Inquiries to `adminNav`**

In `src/components/layout/nav-config.ts`, replace the `adminNav.items` array with:

```ts
  items: [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/availability", label: "Availability" },
    { href: "/admin/bookings", label: "Bookings" },
    { href: "/admin/clients", label: "Clients" },
    { href: "/admin/services", label: "Services" },
    { href: "/admin/settings", label: "Settings" },
    { href: "/admin/reviews", label: "Reviews" },
    { href: "/admin/inquiries", label: "Inquiries" },
  ],
```

- [ ] **Step 2: Add Contact to the marketing tab row**

In `src/components/site-header.tsx`, add to the `navLinks` array after Resources:

```ts
  { href: "/contact", label: "Contact" },
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Pages for the new hrefs land in later tasks; nav links to not-yet-built routes are fine to commit alongside their pages — but to avoid a dead link window, this task is ordered immediately before the page tasks and they are committed in close succession.)

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/nav-config.ts src/components/site-header.tsx
git commit -m "feat: add clients, inquiries, contact to navigation"
```

---

## Task 9: `/contact` marketing page + form

**Files:**

- Create: `src/app/(marketing)/contact/page.tsx`
- Create: `src/app/(marketing)/contact/_components/contact-form.tsx`

- [ ] **Step 1: Write the page (server component)**

`src/app/(marketing)/contact/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ContactForm } from "./_components/contact-form";

export const metadata = { title: "Contact" };

export default async function ContactPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let defaults = { name: "", email: "" };
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    defaults = {
      name: profile?.full_name ?? "",
      email: profile?.email ?? user.email ?? "",
    };
  }

  return (
    <PageContainer>
      <PageHeader
        title="[[HEADER: Contact]]"
        subtitle="[[BODY: what the contact form is for]]"
      />
      <ContactForm defaultName={defaults.name} defaultEmail={defaults.email} />
    </PageContainer>
  );
}
```

> Verify the exact import paths/props for `PageContainer` / `PageHeader` against an existing marketing page (e.g. `src/app/(marketing)/resources/page.tsx`) and match them; adjust if the prop names differ.

- [ ] **Step 2: Write the form (client component)**

`src/app/(marketing)/contact/_components/contact-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/feedback/toast";
import { submitInquiry } from "@/features/inquiries/inquiry-actions";

export function ContactForm({
  defaultName,
  defaultEmail,
}: {
  defaultName: string;
  defaultEmail: string;
}) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const result = await submitInquiry({
        name: String(fd.get("name") ?? ""),
        email: String(fd.get("email") ?? ""),
        phone: String(fd.get("phone") ?? ""),
        subject: String(fd.get("subject") ?? ""),
        message: String(fd.get("message") ?? ""),
        company: String(fd.get("company") ?? ""), // honeypot
      });
      if (result.ok) {
        setDone(true);
        form.reset();
        toast.add({
          title: "Message sent",
          description: "Thanks — Cal will get back to you.",
        });
      } else {
        setError(result.error);
      }
    });
  }

  if (done) {
    return (
      <p className="text-foreground text-sm" role="status">
        Thanks — your message is on its way. Cal will reply soon.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={defaultName} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={defaultEmail}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input id="phone" name="phone" type="tel" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject">Subject (optional)</Label>
        <Input id="subject" name="subject" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="message">Message</Label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
      </div>
      {/* Honeypot: visually hidden, off-screen, not announced. Bots fill it. */}
      <div
        aria-hidden
        className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
      >
        <label htmlFor="company">Company</label>
        <input
          id="company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
```

> Confirm `useToast` is in scope — `ToastProvider` is mounted in the global `PageShell`; the marketing layout renders through it, so `toast.add` works here. If a runtime error says otherwise, check where `ToastProvider` wraps and adjust.

- [ ] **Step 3: Typecheck + lint + build**

Run: `npx tsc --noEmit && npx eslint "src/app/(marketing)/contact/**/*.tsx" && npx next build`
Expected: clean; `/contact` in the build route list.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(marketing)/contact/page.tsx" "src/app/(marketing)/contact/_components/contact-form.tsx"
git commit -m "feat: public contact inquiry form"
```

---

## Task 10: `/admin/inquiries` queue + reply handoff

**Files:**

- Create: `src/app/(admin)/admin/inquiries/page.tsx`
- Create: `src/app/(admin)/admin/inquiries/_components/inquiries-client.tsx`

- [ ] **Step 1: Write the page (server component)**

`src/app/(admin)/admin/inquiries/page.tsx`:

```tsx
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { listInquiries } from "@/features/inquiries/inquiry-actions";
import { InquiriesClient } from "./_components/inquiries-client";

export default async function AdminInquiriesPage() {
  const result = await listInquiries();
  if (result.kind !== "success") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Inquiries" />
        <ErrorState message="Could not load inquiries." />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Inquiries" subtitle="Contact-form messages." />
      <InquiriesClient initialInquiries={result.inquiries} />
    </div>
  );
}
```

> Match `PageHeader` / `ErrorState` import paths + props against an existing admin page (e.g. `src/app/(admin)/admin/settings/page.tsx`) and the `error-state.tsx` export.

- [ ] **Step 2: Write the client component**

`src/app/(admin)/admin/inquiries/_components/inquiries-client.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { useToast } from "@/components/feedback/toast";
import {
  markInquiryResolved,
  stampInquiryReplied,
  type InquiryRow,
} from "@/features/inquiries/inquiry-actions";
import {
  replySubject,
  replyBody,
  mailtoUrl,
  smsUrl,
} from "@/features/inquiries/reply-draft";

function denver(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/Denver" });
}

export function InquiriesClient({
  initialInquiries,
}: {
  initialInquiries: InquiryRow[];
}) {
  const toast = useToast();
  const [inquiries, setInquiries] = useState(initialInquiries);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function patch(id: string, fields: Partial<InquiryRow>) {
    setInquiries((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...fields } : i)),
    );
  }

  function onReply(inq: InquiryRow, channel: "email" | "sms") {
    const subject = replySubject(inq);
    const body = replyBody(inq);
    const href =
      channel === "email"
        ? mailtoUrl(inq.email, subject, body)
        : smsUrl(inq.phone ?? "", body);
    window.location.href = href;
    if (inq.replied_at) return;
    startTransition(async () => {
      const result = await stampInquiryReplied(inq.id);
      if (result.kind === "success")
        patch(inq.id, { replied_at: new Date().toISOString() });
    });
  }

  function onResolve(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await markInquiryResolved(id);
      if (result.kind === "success") {
        patch(id, {
          status: "resolved",
          resolved_at: new Date().toISOString(),
        });
        toast.add({ title: "Marked resolved" });
      } else {
        setError("Could not update the inquiry.");
      }
    });
  }

  if (inquiries.length === 0) {
    return <EmptyState title="No inquiries yet." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {inquiries.map((inq) => (
          <li
            key={inq.id}
            className="bg-card border-border flex flex-col gap-2 rounded-xl border p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-foreground font-semibold">{inq.name}</span>
              <Badge variant={inq.status === "new" ? "default" : "secondary"}>
                {inq.status}
              </Badge>
              {inq.replied_at && (
                <span className="text-muted-foreground text-xs">replied</span>
              )}
              <span className="text-muted-foreground ml-auto text-xs">
                {denver(inq.created_at)}
              </span>
            </div>
            {inq.subject && (
              <p className="text-foreground text-sm font-medium">
                {inq.subject}
              </p>
            )}
            <p className="text-foreground text-sm whitespace-pre-wrap">
              {inq.message}
            </p>
            <p className="text-muted-foreground text-xs">
              {inq.email}
              {inq.phone ? ` · ${inq.phone}` : ""}
              {inq.client_id && (
                <>
                  {" · "}
                  <Link
                    href={`/admin/clients/${inq.client_id}`}
                    className="underline"
                  >
                    view client
                  </Link>
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onReply(inq, "email")}>
                Email
              </Button>
              {inq.phone && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReply(inq, "sms")}
                >
                  Text
                </Button>
              )}
              {inq.status === "new" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => onResolve(inq.id)}
                >
                  Mark resolved
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

> Verify `Badge` `variant` names against `src/components/ui/badge.tsx`; `EmptyState`/`ErrorState` props against their files. Adjust prop names to match (don't invent variants).

- [ ] **Step 3: Typecheck + lint + build**

Run: `npx tsc --noEmit && npx eslint "src/app/(admin)/admin/inquiries/**/*.tsx" && npx next build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/admin/inquiries/page.tsx" "src/app/(admin)/admin/inquiries/_components/inquiries-client.tsx"
git commit -m "feat: admin inquiries queue with reply handoff"
```

---

## Task 11: `/admin/clients` index + search

**Files:**

- Create: `src/app/(admin)/admin/clients/page.tsx`
- Create: `src/app/(admin)/admin/clients/_components/clients-index-client.tsx`
- Modify: `docs/FRONTEND.md` (admin table pattern)

- [ ] **Step 1: Write the page (server component)**

`src/app/(admin)/admin/clients/page.tsx`:

```tsx
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { listClients } from "@/features/admin/clients-actions";
import { ClientsIndexClient } from "./_components/clients-index-client";

export default async function AdminClientsPage() {
  const result = await listClients();
  if (result.kind !== "success") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Clients" />
        <ErrorState message="Could not load clients." />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Clients" subtitle="Everyone with a client account." />
      <ClientsIndexClient clients={result.clients} />
    </div>
  );
}
```

- [ ] **Step 2: Write the client component (search + table)**

`src/app/(admin)/admin/clients/_components/clients-index-client.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { matchesClientQuery } from "@/features/admin/client-search";
import type { ClientListRow } from "@/features/admin/clients-actions";

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ClientsIndexClient({ clients }: { clients: ClientListRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => clients.filter((c) => matchesClientQuery(c, query)),
    [clients, query],
  );

  return (
    <div className="flex flex-col gap-4">
      <Input
        type="search"
        placeholder="Search name, email, or phone…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
        aria-label="Search clients"
      />
      {filtered.length === 0 ? (
        <EmptyState title="No clients match your search." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground border-border border-b text-left">
                <tr>
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Contact</th>
                  <th className="py-2 pr-4 font-medium">Pets</th>
                  <th className="py-2 pr-4 font-medium">Bookings</th>
                  <th className="py-2 pr-4 font-medium">Balance</th>
                  <th className="py-2 font-medium">Onboarded</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-border/60 border-b">
                    <td className="py-2 pr-4">
                      <Link
                        href={`/admin/clients/${c.id}`}
                        className="text-brand-strong font-medium underline-offset-2 hover:underline"
                      >
                        {c.full_name ?? "(no name)"}
                      </Link>
                    </td>
                    <td className="text-muted-foreground py-2 pr-4">
                      {c.email ?? "—"}
                      {c.phone ? (
                        <span className="block">{c.phone}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4">{c.petCount}</td>
                    <td className="py-2 pr-4">{c.bookingCount}</td>
                    <td className="py-2 pr-4">
                      {c.outstandingCents > 0 ? (
                        <span className="text-destructive font-medium">
                          {dollars(c.outstandingCents)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2">
                      {c.onboardingComplete ? "Yes" : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <ul className="flex flex-col gap-2 sm:hidden">
            {filtered.map((c) => (
              <li
                key={c.id}
                className="bg-card border-border rounded-xl border p-3"
              >
                <Link
                  href={`/admin/clients/${c.id}`}
                  className="text-brand-strong font-medium"
                >
                  {c.full_name ?? "(no name)"}
                </Link>
                <p className="text-muted-foreground text-xs">
                  {c.email ?? "—"}
                  {c.phone ? ` · ${c.phone}` : ""}
                </p>
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{c.petCount} pets</Badge>
                  <Badge variant="secondary">{c.bookingCount} bookings</Badge>
                  {c.outstandingCents > 0 && (
                    <Badge variant="destructive">
                      {dollars(c.outstandingCents)} owed
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
```

> Mobile parity: explicit table-on-desktop / cards-on-mobile pattern (Standard 7). Verify `Badge` variants exist (`secondary`, `destructive`); if not, swap to available variants.

- [ ] **Step 3: Document the pattern in FRONTEND.md**

Add a short note under the components/patterns section of `docs/FRONTEND.md`: the admin clients index uses a "responsive table → stacked cards" pattern (desktop `<table>`, mobile `<ul>` cards) for wide tabular admin data; reuse it for future admin tables rather than a horizontal-scroll table. Bump the `_Last reviewed_` footer.

- [ ] **Step 4: Typecheck + lint + build**

Run: `npx tsc --noEmit && npx eslint "src/app/(admin)/admin/clients/**/*.tsx" && npx next build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/admin/clients/page.tsx" "src/app/(admin)/admin/clients/_components/clients-index-client.tsx" docs/FRONTEND.md
git commit -m "feat: admin clients index with search"
```

---

## Task 12: `/admin/clients/[clientId]` detail + mutations

**Files:**

- Create: `src/app/(admin)/admin/clients/[clientId]/page.tsx`
- Create: `src/app/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx`

- [ ] **Step 1: Write the page (server component)**

`src/app/(admin)/admin/clients/[clientId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { getClientDetail } from "@/features/admin/clients-actions";
import { ClientDetailClient } from "./_components/client-detail-client";

export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const result = await getClientDetail(clientId);
  if (result.kind === "not_found") notFound();
  if (result.kind !== "success") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Client" />
        <p role="alert" className="text-destructive text-sm">
          Could not load this client.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={result.client.full_name ?? "Client"} />
      <ClientDetailClient client={result.client} />
    </div>
  );
}
```

> Next.js 15: `params` is a Promise (await it). Confirm against the existing `book/[serviceSlug]/page.tsx` signature and match.

- [ ] **Step 2: Write the client component (sections + mutations)**

`src/app/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PetAvatar } from "@/features/booking/_components/pet-avatar";
import { useConfirm } from "@/components/feedback/confirm-dialog";
import { useToast } from "@/components/feedback/toast";
import {
  setKicheAllowed,
  settleDebit,
  type ClientDetailView,
} from "@/features/admin/clients-actions";
import {
  approveBooking,
  declineBooking,
} from "@/features/admin/approval-actions";
import { cancelBooking, markNoShow } from "@/features/booking/actions";

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
function denver(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Denver",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const SECTION =
  "bg-card border-border flex flex-col gap-3 rounded-xl border p-4";
const LEGEND =
  "text-brand-strong text-xs font-semibold tracking-wide uppercase";

export function ClientDetailClient({ client }: { client: ClientDetailView }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kiche, setKiche] = useState(client.kiche_allowed);

  function run<T extends { kind: string }>(
    action: () => Promise<T>,
    onOk?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.kind === "success") {
        onOk?.();
        router.refresh();
      } else {
        setError(`Action failed: ${result.kind}`);
      }
    });
  }

  function toggleKiche() {
    const next = !kiche;
    setKiche(next); // optimistic
    run(
      () => setKicheAllowed(client.id, next),
      () =>
        toast.add({
          title: next ? "Kiche discount enabled" : "Kiche discount disabled",
        }),
    );
  }

  async function onCancel(id: string) {
    const ok = await confirm({
      title: "Cancel this booking?",
      description: "This cancels the booking per the refund policy.",
      confirmLabel: "Cancel booking",
      destructive: true,
    });
    if (!ok) return;
    run(() => cancelBooking({ bookingId: id }));
  }

  async function onNoShow(id: string) {
    const ok = await confirm({
      title: "Mark no-show?",
      description: "This records a no-show and writes a debit per policy.",
      confirmLabel: "Mark no-show",
      destructive: true,
    });
    if (!ok) return;
    run(() => markNoShow(id));
  }

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {/* Account */}
      <section className={SECTION}>
        <p className={LEGEND}>Account</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd>{client.email ?? "—"}</dd>
          <dt className="text-muted-foreground">Phone</dt>
          <dd>{client.phone ?? "—"}</dd>
          <dt className="text-muted-foreground">Address</dt>
          <dd>
            {[client.address, client.zip].filter(Boolean).join(", ") || "—"}
          </dd>
          <dt className="text-muted-foreground">Onboarded</dt>
          <dd>{client.onboarding_complete ? "Yes" : "No"}</dd>
          <dt className="text-muted-foreground">Joined</dt>
          <dd>{denver(client.created_at)}</dd>
        </dl>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={kiche}
            disabled={isPending}
            onChange={toggleKiche}
          />
          Kiche discount eligible
        </label>
      </section>

      {/* Pets */}
      <section className={SECTION}>
        <p className={LEGEND}>Pets</p>
        {client.pets.length === 0 ? (
          <p className="text-muted-foreground text-sm">No pets.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {client.pets.map((pet) => (
              <li key={pet.id} className="flex items-start gap-3 text-sm">
                <PetAvatar
                  name={pet.name}
                  species={pet.species}
                  photoUrl={pet.photoUrl}
                  size={36}
                />
                <div>
                  <p className="font-medium">
                    {pet.name}{" "}
                    <span className="text-muted-foreground font-normal">
                      ({pet.species}
                      {pet.breed ? `, ${pet.breed}` : ""})
                    </span>
                  </p>
                  {pet.notes && (
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {pet.notes}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Forms */}
      <section className={SECTION}>
        <p className={LEGEND}>Forms</p>
        {client.forms.length === 0 ? (
          <p className="text-muted-foreground text-sm">No form responses.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {client.forms.map((f) => (
              <li key={f.id} className="text-sm">
                <p className="font-medium">{f.form_key}</p>
                <pre className="bg-muted/40 text-muted-foreground overflow-x-auto rounded p-2 text-xs">
                  {JSON.stringify(f.data, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Bookings */}
      <section className={SECTION}>
        <p className={LEGEND}>Bookings</p>
        {client.bookings.length === 0 ? (
          <p className="text-muted-foreground text-sm">No bookings.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {client.bookings.map((b) => (
              <li
                key={b.id}
                className="border-border/60 flex flex-wrap items-center gap-2 border-b pb-2 text-sm"
              >
                <span className="font-medium">
                  {b.service_name ?? "Service"}
                </span>
                <Badge variant="secondary">{b.status}</Badge>
                <span className="text-muted-foreground">
                  {denver(b.starts_at)} — {denver(b.ends_at)}
                </span>
                <span className="text-muted-foreground">
                  {dollars(b.final_cents)}
                </span>
                <span className="ml-auto flex gap-2">
                  {b.status === "pending_approval" && (
                    <>
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() => run(() => approveBooking(b.id))}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => run(() => declineBooking(b.id))}
                      >
                        Decline
                      </Button>
                    </>
                  )}
                  {(b.status === "pending_approval" ||
                    b.status === "confirmed") && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => onCancel(b.id)}
                    >
                      Cancel
                    </Button>
                  )}
                  {b.status === "confirmed" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => onNoShow(b.id)}
                    >
                      No-show
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Balance */}
      <section className={SECTION}>
        <p className={LEGEND}>Balance</p>
        <p className="text-sm">
          Outstanding:{" "}
          <span
            className={
              client.outstandingCents > 0
                ? "text-destructive font-semibold"
                : "font-semibold"
            }
          >
            {dollars(client.outstandingCents)}
          </span>
        </p>
        {client.debits.length > 0 && (
          <ul className="flex flex-col gap-2">
            {client.debits.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span>{dollars(d.amount_cents)}</span>
                <Badge variant="secondary">{d.reason}</Badge>
                <span className="text-muted-foreground">
                  {denver(d.created_at)}
                </span>
                {d.settled_at ? (
                  <span className="text-muted-foreground ml-auto">settled</span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => settleDebit(d.id, client.id),
                        () => toast.add({ title: "Debit settled" }),
                      )
                    }
                  >
                    Mark settled
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

> Verify `cancelBooking` takes `{ bookingId }` and `markNoShow`/`approveBooking`/`declineBooking` take a bare id string — these mirror the availability client's usage exactly (`availability-client.tsx`). Match its call signatures.

- [ ] **Step 3: Typecheck + lint + build**

Run: `npx tsc --noEmit && npx eslint "src/app/(admin)/admin/clients/**/*.tsx" && npx next build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/admin/clients/[clientId]/page.tsx" "src/app/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx"
git commit -m "feat: admin client detail with kiche, debits, booking actions"
```

---

## Task 13: `/admin/bookings` → booking calendar

**Files:**

- Modify: `src/app/(admin)/admin/bookings/page.tsx`
- Create: `src/app/(admin)/admin/bookings/_components/bookings-calendar-client.tsx`
- Delete: `src/app/(admin)/admin/bookings/_components/bookings-client.tsx`

The calendar is a lightweight read-only month grid (no Scheduler dependency). The server page computes the current Denver month range and loads bookings; the client renders the month, a day-agenda, a status filter, and a client search, reusing the moderation cores.

- [ ] **Step 1: Rewrite the page (server component)**

`src/app/(admin)/admin/bookings/page.tsx`:

```tsx
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { listBookingsInRange } from "@/features/admin/bookings-calendar-actions";
import { BookingsCalendarClient } from "./_components/bookings-calendar-client";

/** First instant of this month and next month, in UTC, anchored to Denver. */
function monthRange(now: Date): { startIso: string; endIso: string } {
  // Denver is UTC-7/-6; building from UTC year/month is close enough for a
  // month-bucket query (boundaries are off by a few hours, harmless for listing).
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 1));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export default async function AdminBookingsPage() {
  const range = monthRange(new Date());
  const result = await listBookingsInRange(range);
  if (result.kind !== "success") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Bookings" />
        <ErrorState message="Could not load bookings." />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Bookings" subtitle="Calendar of booked time." />
      <BookingsCalendarClient
        bookings={result.bookings}
        monthStartIso={range.startIso}
      />
    </div>
  );
}
```

> Month navigation across months: this task ships the **current** month (server-loaded). Prev/next month is a follow-up — the client exposes the grid + day-agenda for the loaded month. If cross-month nav is wanted now, lift `monthStartIso` to a search param and re-query; left out here to keep the task bounded (note it in the handoff).

- [ ] **Step 2: Write the calendar client**

`src/app/(admin)/admin/bookings/_components/bookings-calendar-client.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { useConfirm } from "@/components/feedback/confirm-dialog";
import {
  approveBooking,
  declineBooking,
} from "@/features/admin/approval-actions";
import { cancelBooking, markNoShow } from "@/features/booking/actions";
import { matchesClientQuery } from "@/features/admin/client-search";
import type { BookingCalendarRow } from "@/features/admin/bookings-calendar-actions";

const TZ = "America/Denver";
const STATUSES = [
  "all",
  "pending_approval",
  "confirmed",
  "completed",
  "cancelled",
  "declined",
  "no_show",
] as const;
type StatusFilter = (typeof STATUSES)[number];

/** Denver day key (YYYY-MM-DD) for an ISO instant. */
function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}
function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function BookingsCalendarClient({
  bookings,
  monthStartIso,
}: {
  bookings: BookingCalendarRow[];
  monthStartIso: string;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      bookings.filter((b) => {
        if (status !== "all" && b.status !== status) return false;
        return matchesClientQuery(
          { full_name: b.client_name, email: null, phone: null },
          query,
        );
      }),
    [bookings, status, query],
  );

  const byDay = useMemo(() => {
    const m = new Map<string, BookingCalendarRow[]>();
    for (const b of filtered) {
      const k = dayKey(b.starts_at);
      const list = m.get(k) ?? [];
      list.push(b);
      m.set(k, list);
    }
    return m;
  }, [filtered]);

  // Build the month's day cells (Denver month from monthStartIso).
  const monthDate = new Date(monthStartIso);
  const year = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(
      d,
    ).padStart(2, "0")}`;
    cells.push(key);
  }

  function run<T extends { kind: string }>(action: () => Promise<T>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.kind === "success") router.refresh();
      else setError(`Action failed: ${result.kind}`);
    });
  }
  async function onCancel(id: string) {
    const ok = await confirm({
      title: "Cancel this booking?",
      confirmLabel: "Cancel booking",
      destructive: true,
    });
    if (ok) run(() => cancelBooking({ bookingId: id }));
  }
  async function onNoShow(id: string) {
    const ok = await confirm({
      title: "Mark no-show?",
      confirmLabel: "Mark no-show",
      destructive: true,
    });
    if (ok) run(() => markNoShow(id));
  }

  const dayList = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          aria-label="Filter by status"
          className="border-input bg-background rounded-md border px-2 py-1 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search client…"
          aria-label="Search client"
          className="border-input bg-background rounded-md border px-2 py-1 text-sm"
        />
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-muted-foreground py-1 font-medium">
            {d}
          </div>
        ))}
        {cells.map((key, i) =>
          key === null ? (
            <div key={`pad-${i}`} />
          ) : (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedDay(key)}
              className={`aspect-square rounded-md border p-1 text-left transition-colors ${
                selectedDay === key
                  ? "border-brand bg-brand/10"
                  : "border-border bg-card hover:bg-accent"
              }`}
            >
              <span className="text-foreground">{Number(key.slice(-2))}</span>
              {(byDay.get(key)?.length ?? 0) > 0 && (
                <span className="bg-brand-strong mt-1 block h-1.5 w-1.5 rounded-full" />
              )}
            </button>
          ),
        )}
      </div>

      {/* Day agenda */}
      {selectedDay && (
        <section aria-label={`Bookings on ${selectedDay}`}>
          <h2 className="text-foreground mb-2 text-sm font-semibold">
            {selectedDay}
          </h2>
          {dayList.length === 0 ? (
            <EmptyState title="No bookings this day." />
          ) : (
            <ul className="flex flex-col gap-2">
              {dayList.map((b) => (
                <li
                  key={b.id}
                  className="bg-card border-border flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm"
                >
                  <Link
                    href={`/admin/clients/${b.client_id}`}
                    className="text-brand-strong font-medium hover:underline"
                  >
                    {b.client_name ?? "Unknown client"}
                  </Link>
                  <span>{b.service_name ?? "Service"}</span>
                  <Badge variant="secondary">{b.status}</Badge>
                  <span className="text-muted-foreground">
                    {timeLabel(b.starts_at)}–{timeLabel(b.ends_at)}
                  </span>
                  <span className="text-muted-foreground">
                    {dollars(b.final_cents)}
                  </span>
                  <span className="ml-auto flex gap-2">
                    {b.status === "pending_approval" && (
                      <>
                        <Button
                          size="sm"
                          disabled={isPending}
                          onClick={() => run(() => approveBooking(b.id))}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => run(() => declineBooking(b.id))}
                        >
                          Decline
                        </Button>
                      </>
                    )}
                    {(b.status === "pending_approval" ||
                      b.status === "confirmed") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => onCancel(b.id)}
                      >
                        Cancel
                      </Button>
                    )}
                    {b.status === "confirmed" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isPending}
                        onClick={() => onNoShow(b.id)}
                      >
                        No-show
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Delete the obsolete approvals-only client**

```bash
git rm "src/app/(admin)/admin/bookings/_components/bookings-client.tsx"
```

Confirm nothing else imports it: `npx eslint "src/**/*.{ts,tsx}"` (or grep) shows no dangling import.

- [ ] **Step 4: Typecheck + lint + build**

Run: `npx tsc --noEmit && npx eslint "src/app/(admin)/admin/bookings/**/*.tsx" && npx next build`
Expected: clean; `/admin/bookings` builds.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/admin/bookings/page.tsx" "src/app/(admin)/admin/bookings/_components/bookings-calendar-client.tsx"
git commit -m "feat: admin booking calendar replacing approvals list"
```

---

## Task 14: `/admin` dashboard

**Files:**

- Modify: `src/app/(admin)/admin/page.tsx`

Replace the redirect with a glance-view that composes existing reads. Reuses `listInquiries`, `listClients`, `listBookingsInRange`, and a reviews count.

- [ ] **Step 1: Write the dashboard page**

`src/app/(admin)/admin/page.tsx`:

```tsx
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { listClients } from "@/features/admin/clients-actions";
import { listInquiries } from "@/features/inquiries/inquiry-actions";
import { listBookingsInRange } from "@/features/admin/bookings-calendar-actions";

const TZ = "America/Denver";
function dayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function Card({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: string | number;
}) {
  return (
    <Link
      href={href}
      className="bg-card border-border hover:bg-accent flex flex-col gap-1 rounded-xl border p-4 transition-colors"
    >
      <span className="text-foreground text-2xl font-semibold">{value}</span>
      <span className="text-muted-foreground text-sm">{label}</span>
    </Link>
  );
}

export default async function AdminDashboardPage() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const range = {
    startIso: new Date(Date.UTC(y, m, 1)).toISOString(),
    endIso: new Date(Date.UTC(y, m + 1, 1)).toISOString(),
  };

  const [clientsRes, inquiriesRes, bookingsRes] = await Promise.all([
    listClients(),
    listInquiries(),
    listBookingsInRange(range),
  ]);

  const bookings = bookingsRes.kind === "success" ? bookingsRes.bookings : [];
  const todayKey = dayKey(now);
  const todayCount = bookings.filter(
    (b) => dayKey(new Date(b.starts_at)) === todayKey,
  ).length;
  const pendingCount = bookings.filter(
    (b) => b.status === "pending_approval",
  ).length;

  const newInquiries =
    inquiriesRes.kind === "success"
      ? inquiriesRes.inquiries.filter((i) => i.status === "new").length
      : 0;
  const owingClients =
    clientsRes.kind === "success"
      ? clientsRes.clients.filter((c) => c.outstandingCents > 0).length
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" subtitle="At a glance." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card
          href="/admin/bookings"
          label="Bookings today"
          value={todayCount}
        />
        <Card
          href="/admin/bookings"
          label="Pending approval"
          value={pendingCount}
        />
        <Card
          href="/admin/inquiries"
          label="New inquiries"
          value={newInquiries}
        />
        <Card
          href="/admin/clients"
          label="Clients owing a balance"
          value={owingClients}
        />
      </div>
    </div>
  );
}
```

> A pending-reviews count card can be added once a `listReviews`-style count is wired; left out to avoid guessing the reviews action's shape. If `features/admin/reviews-actions.ts` exposes a list with a `status==='pending'` filter, add a fifth `Card` linking `/admin/reviews`.

- [ ] **Step 2: Typecheck + lint + build**

Run: `npx tsc --noEmit && npx eslint "src/app/(admin)/admin/page.tsx" && npx next build`
Expected: clean; `/admin` renders the dashboard (no longer redirects). Confirm the sidebar "Dashboard" link (Task 8) resolves here.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(admin)/admin/page.tsx"
git commit -m "feat: admin dashboard glance view"
```

---

## Task 15: Optional integration tests (local Supabase)

**Files:**

- Modify: `src/features/admin/admin.test.ts` (add cases) — only if the local stack is available.

The pure logic (Tasks 1–3) is already unit-tested. The action cores follow the integration-test pattern in `admin.test.ts` (real local Supabase via `.env.test`). Add, if running the stack:

- `setKicheAllowedCore` flips `kiche_allowed`; non-admin → forbidden.
- `settleDebitCore` stamps `settled_at`; second call on the same debit is a no-op.
- `submitInquiryCore` inserts; honeypot value → no insert, returns ok; same email within the window → rate-limited.
- `listClientsCore` aggregates counts + outstanding balance correctly.

- [ ] **Step 1: Add the cases** following the existing fixture/cleanup pattern (create users via `serviceClient.auth.admin.createUser`, track created ids, clean up in `afterAll`).

- [ ] **Step 2: Run**

Run: `npx vitest run src/features/admin/admin.test.ts`
Expected: PASS (requires local stack + `.env.test`). If the stack isn't available, skip this task — the cores are covered by the pure-logic tests + the maintainer's browser verification.

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/admin.test.ts
git commit -m "test: admin clients, debit, inquiry cores"
```

---

## Final verification

```bash
npx vitest run
npx tsc --noEmit
npx eslint "src/**/*.{ts,tsx}"
npx next build
```

All green. Then the maintainer's browser walk (not headless): desktop + 390px on `/contact`, `/admin`, `/admin/clients`, `/admin/clients/[id]`, `/admin/bookings`, `/admin/inquiries`; light + dark; keyboard nav + visible focus on tables, calendar, forms, dialogs; confirm Email opens `mailto:` with the right subject/body, Text opens `sms:` on mobile, `replied_at` stamps; Kiche toggle + debit-settle reflect and survive refresh; honeypot/rate-limit reject as expected.

---

## Self-review notes (author)

- **Spec coverage:** Clients index+detail (T6, T11, T12) · Kiche toggle (T6, T12) · debit settle (T6, T12) · inline booking actions (T12, reused cores) · booking calendar (T7, T13) · dashboard (T14) · inquiries table+RLS (T4) · `/contact` honeypot+rate-limit (T5, T9) · admin inquiries + mailto/sms handoff (T3, T5, T10) · new→resolved + replied_at (T4, T5) · nav (T8) · docs (T4, T11). Deferred items (input humanization, pickers, manual booking) are explicitly out of scope per the spec — no tasks, by design.
- **Type consistency:** `AdminDeps { serviceClient, actorUserId }` shape reused across inquiry/clients/bookings actions (matches existing `ApprovalDeps`/`SettingsDeps`). Result unions use `{ kind }` for admin reads/mutations and `{ ok }` for the public submit (matches `reviews-action`). `cancelBooking({ bookingId })` and bare-id `approveBooking`/`declineBooking`/`markNoShow` mirror `availability-client.tsx`.
- **Known verify-against-codebase points flagged inline** (PageContainer/PageHeader props, Badge variants, EmptyState/ErrorState props, params-Promise signature, ToastProvider scope, the `profiles(full_name)` join mapping in T7). These are small surface mismatches the implementer confirms against named existing files — not placeholders.
