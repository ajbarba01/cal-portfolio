# DB Seeding Framework (SP2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `supabase db reset` + `npm run db:seed -- <scenario>` reproduces any named local DB state (`fresh`, `busy-week`, `payment-states`, `admin-demo`), per the [SP2 spec](../specs/2026-06-10-db-seeding-design.md) (resolves finding S1).

**Architecture:** Two layers. (1) `supabase/seed.sql` — local-only admin auth user, runs on every `db reset` via the already-enabled `[db.seed]` config. (2) `scripts/db-seed/` — TypeScript scenario seeder on the service-role client: hard local-URL guard, wipe-first reset (services + settings are migration-owned, never touched), composable step registry, deterministic fixtures with Denver-wall-clock relative dates. Pure helpers (dates, URL guard, registry shape) are unit-tested; DB steps fail loud.

**Tech Stack:** TypeScript, `@supabase/supabase-js` (existing), `tsx` + `@date-fns/tz` (new devDeps), vitest.

**Repo rules (every commit):** gates before commit; subject-line-only Conventional Commit, no AI attribution; stage files by name. Local Supabase stack must be running (`npx supabase status`).

---

## File structure

```
supabase/seed.sql              local admin user (SQL, transactional)
scripts/db-seed/
  index.ts                     CLI entry: arg parse → wipe → steps → summary
  constants.ts                 admin email/id, shared password
  client.ts                    service-role client + local-URL guard
  dates.ts                     pure: week anchor, Denver slot builder, statusFor
  wipe.ts                      wipe-first reset + ensureAdmin
  factories.ts                 Ctx + insert helpers (users, pets, bookings, …)
  scenarios.ts                 step definitions + SCENARIOS registry
  summary.ts                   row counts + credentials printout
  dates.test.ts                unit tests (pure)
  client.test.ts               unit tests (pure guard)
  scenarios.test.ts            unit tests (registry shape)
```

### Task 1: Tooling — devDeps, npm script, vitest include

**Files:**

- Modify: `package.json`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Install devDeps**

Run: `npm install -D tsx @date-fns/tz`
Expected: both added to `devDependencies`, lockfile updated.

- [ ] **Step 2: Add npm script** to `package.json` `scripts` (after `"test:watch"`):

```json
"db:seed": "tsx --env-file=.env.local scripts/db-seed/index.ts"
```

- [ ] **Step 3: Extend vitest include** in `vitest.config.ts` so seeder unit tests run:

```ts
include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck` then `npm run test`
Expected: both green (no seeder files exist yet; `passWithNoTests` covers scripts glob).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add seeder tooling deps and db:seed script"
```

### Task 2: `supabase/seed.sql` — local admin baseline

**Files:**

- Create: `supabase/seed.sql`

Background for the implementer: `config.toml` already has `[db.seed] enabled = true, sql_paths = ["./seed.sql"]`. Seed files run only on local `db reset` / first `start` — never on prod (`db push` applies migrations only). Auth-user SQL needs a matching `auth.identities` row and empty-string (not NULL) token columns, or GoTrue sign-in breaks. The `handle_new_user` trigger auto-creates the profile row on `auth.users` insert. `crypt`/`gen_salt` live in the `extensions` schema on Supabase.

- [ ] **Step 1: Create `supabase/seed.sql`:**

```sql
-- LOCAL-ONLY baseline: a login-able admin after every `supabase db reset`.
-- Never runs on prod (db push applies migrations only). Credentials are
-- intentionally well-known local dev values: admin@local.test / password123.
-- Must match ADMIN_EMAIL / SEED_PASSWORD in scripts/db-seed/constants.ts.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated',
  'admin@local.test',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  now(), now(),
  '', '', '', '', ''
);

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000001',
    'email', 'admin@local.test',
    'email_verified', true,
    'phone_verified', false
  ),
  'email', '00000000-0000-0000-0000-000000000001',
  now(), now(), now()
);

-- handle_new_user trigger created the profile; promote it.
update profiles set
  role               = 'admin',
  onboarding_status  = 'approved',
  full_name          = 'Local Admin',
  lat                = 40.015,
  lng                = -105.27
where id = '00000000-0000-0000-0000-000000000001';

commit;
```

- [ ] **Step 2: Reset to apply**

Run: `npx supabase db reset`
Expected: migrations re-run, then `Seeding data from seed.sql...`; no errors.

- [ ] **Step 3: Acceptance test — sign in as the seeded admin**

Run (anon key = `SUPABASE_TEST_ANON_KEY` from `.env.test`):

```
curl.exe -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" -H "apikey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH" -H "Content-Type: application/json" -d "{\"email\":\"admin@local.test\",\"password\":\"password123\"}"
```

Expected: JSON containing `access_token`. Also verify the promoted profile (service key = `SUPABASE_TEST_SERVICE_ROLE_KEY` from `.env.test`):

```
curl.exe -s "http://127.0.0.1:54321/rest/v1/profiles?email=eq.admin@local.test&select=role,onboarding_status" -H "apikey: $SUPABASE_TEST_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_TEST_SERVICE_ROLE_KEY"
```

Expected: `[{"role":"admin","onboarding_status":"approved"}]`.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat: seed local admin user on db reset"
```

### Task 3: Pure date helpers (TDD)

**Files:**

- Create: `scripts/db-seed/dates.ts`
- Test: `scripts/db-seed/dates.test.ts`

- [ ] **Step 1: Write the failing tests** — `scripts/db-seed/dates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TZDate } from "@date-fns/tz";
import { SEED_TZ, weekAnchor, slot, statusFor } from "./dates";

// weekAnchor returns a TZDate (Denver context, so `slot` can read Denver
// Y/M/D). TZDate.toISOString() emits offset notation, so assert on the
// underlying UTC instant via `new Date(...getTime())`.
describe("weekAnchor", () => {
  it("returns Monday 00:00 Denver of the containing week", () => {
    // Wed 2026-06-10 12:00 Denver → Mon 2026-06-08 00:00 Denver (06:00Z, MDT)
    const wed = new TZDate(2026, 5, 10, 12, 0, 0, SEED_TZ);
    expect(
      new Date(weekAnchor(new Date(wed.getTime())).getTime()).toISOString(),
    ).toBe("2026-06-08T06:00:00.000Z");
  });

  it("maps a Monday to itself", () => {
    const mon = new TZDate(2026, 5, 8, 9, 30, 0, SEED_TZ);
    expect(
      new Date(weekAnchor(new Date(mon.getTime())).getTime()).toISOString(),
    ).toBe("2026-06-08T06:00:00.000Z");
  });
});

describe("slot", () => {
  it("builds Denver wall-clock instants across DST", () => {
    const jan = new Date(Date.UTC(2026, 0, 5, 12)); // week of Mon Jan 5 (MST, UTC-7)
    expect(slot(weekAnchor(jan), 0, 9, 0).toISOString()).toBe(
      "2026-01-05T16:00:00.000Z",
    );
    const jul = new Date(Date.UTC(2026, 6, 8, 12)); // week of Mon Jul 6 (MDT, UTC-6)
    expect(slot(weekAnchor(jul), 0, 9, 0).toISOString()).toBe(
      "2026-07-06T15:00:00.000Z",
    );
  });

  it("offsets days and minutes", () => {
    const jun = new Date(Date.UTC(2026, 5, 10, 12));
    expect(slot(weekAnchor(jun), 4, 18, 30).toISOString()).toBe(
      "2026-06-13T00:30:00.000Z", // Fri 18:30 Denver = Sat 00:30Z
    );
  });
});

describe("statusFor", () => {
  const now = new Date("2026-06-10T18:00:00.000Z");
  it("past slots are completed", () => {
    expect(statusFor(new Date("2026-06-10T15:00:00.000Z"), now)).toBe(
      "completed",
    );
  });
  it("future slots are confirmed", () => {
    expect(statusFor(new Date("2026-06-10T19:00:00.000Z"), now)).toBe(
      "confirmed",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/db-seed`
Expected: FAIL — cannot resolve `./dates`.

- [ ] **Step 3: Implement** — `scripts/db-seed/dates.ts`:

```ts
import { TZDate } from "@date-fns/tz";

export const SEED_TZ = "America/Denver";

/** Monday 00:00 in Denver of the week containing `now`. */
export function weekAnchor(now: Date): TZDate {
  const local = new TZDate(now.getTime(), SEED_TZ);
  const daysSinceMonday = (local.getDay() + 6) % 7;
  return new TZDate(
    local.getFullYear(),
    local.getMonth(),
    local.getDate() - daysSinceMonday,
    0,
    0,
    0,
    SEED_TZ,
  );
}

/** Instant for `anchor + dayOffset days` at the given Denver wall-clock time. */
export function slot(
  anchor: TZDate,
  dayOffset: number,
  hour: number,
  minute = 0,
): Date {
  return new Date(
    new TZDate(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate() + dayOffset,
      hour,
      minute,
      0,
      SEED_TZ,
    ).getTime(),
  );
}

/** Deterministic status for timetable bookings: past → completed, else confirmed. */
export function statusFor(
  startsAt: Date,
  now: Date,
): "completed" | "confirmed" {
  return startsAt.getTime() < now.getTime() ? "completed" : "confirmed";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/db-seed`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/db-seed/dates.ts scripts/db-seed/dates.test.ts
git commit -m "feat: add seeder date helpers with denver wall-clock slots"
```

### Task 4: Constants + service client with local-URL guard (TDD)

**Files:**

- Create: `scripts/db-seed/constants.ts`
- Create: `scripts/db-seed/client.ts`
- Test: `scripts/db-seed/client.test.ts`

- [ ] **Step 1: Create `scripts/db-seed/constants.ts`:**

```ts
// Must match supabase/seed.sql.
export const ADMIN_EMAIL = "admin@local.test";
export const SEED_PASSWORD = "password123";
```

- [ ] **Step 2: Write the failing tests** — `scripts/db-seed/client.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assertLocalDbUrl } from "./client";

describe("assertLocalDbUrl", () => {
  it.each(["http://127.0.0.1:54321", "http://localhost:54321"])(
    "allows %s",
    (url) => {
      expect(() => assertLocalDbUrl(url)).not.toThrow();
    },
  );

  it.each([
    "https://mvrbmrzrifamkbnjfrvd.supabase.co",
    "https://example.com",
    "http://192.168.1.10:54321",
  ])("refuses %s", (url) => {
    expect(() => assertLocalDbUrl(url)).toThrow(/local-only/);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run scripts/db-seed/client.test.ts`
Expected: FAIL — cannot resolve `./client`.

- [ ] **Step 4: Implement** — `scripts/db-seed/client.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/**
 * Seeding wipes data. It must be impossible to point this tool at a remote
 * project; there is deliberately no override flag (spec: safety guard).
 */
export function assertLocalDbUrl(url: string): void {
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `db:seed is local-only — refusing Supabase URL with host "${host}".`,
    );
  }
}

export function makeServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY — run via `npm run db:seed` so .env.local is loaded.",
    );
  }
  assertLocalDbUrl(url);
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run scripts/db-seed/client.test.ts`
Expected: PASS (5 cases).

- [ ] **Step 6: Commit**

```bash
git add scripts/db-seed/constants.ts scripts/db-seed/client.ts scripts/db-seed/client.test.ts
git commit -m "feat: add seeder service client with local-url guard"
```

### Task 5: Factories + wipe

**Files:**

- Create: `scripts/db-seed/factories.ts`
- Create: `scripts/db-seed/wipe.ts`

IO modules — no unit tests (verified end-to-end in Task 7); every helper throws on any DB error (fail loud, spec requirement).

- [ ] **Step 1: Create `scripts/db-seed/factories.ts`:**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_EMAIL, SEED_PASSWORD } from "./constants";

export interface Ctx {
  db: SupabaseClient;
  now: Date;
  adminId: string;
  users: Map<string, string>; // email → user id
  pets: Map<string, string>; // pet key → pet id
  bookings: Map<string, { id: string; clientId: string }>; // booking key → ids
  series: Map<string, string>; // series key → series id
  services: Map<string, { id: string; concurrency: "exclusive" | "resident" }>;
}

export async function loadServices(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.db
    .from("services")
    .select("id, slug, concurrency");
  if (error || !data) throw new Error(`load services: ${error?.message}`);
  for (const s of data) {
    ctx.services.set(s.slug, { id: s.id, concurrency: s.concurrency });
  }
}

async function createAuthUser(
  db: SupabaseClient,
  email: string,
): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`create auth user ${email}: ${error?.message}`);
  }
  return data.user.id;
}

/** Finds (or creates) the admin and (re)asserts its promoted profile. */
export async function ensureAdmin(db: SupabaseClient): Promise<string> {
  const { data, error } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw new Error(`listUsers: ${error.message}`);
  let id = data.users.find((u) => u.email === ADMIN_EMAIL)?.id;
  if (!id) id = await createAuthUser(db, ADMIN_EMAIL);
  const { error: profErr } = await db
    .from("profiles")
    .update({
      role: "admin",
      onboarding_status: "approved",
      full_name: "Local Admin",
      lat: 40.015,
      lng: -105.27,
    })
    .eq("id", id);
  if (profErr) throw new Error(`promote admin profile: ${profErr.message}`);
  return id;
}

export async function createClientUser(
  ctx: Ctx,
  opts: {
    email: string;
    fullName: string;
    onboarding: "info_pending" | "meet_greet_pending" | "approved" | "declined";
    kiche?: boolean;
  },
): Promise<string> {
  const id = await createAuthUser(ctx.db, opts.email);
  const { error } = await ctx.db
    .from("profiles")
    .update({
      full_name: opts.fullName,
      onboarding_status: opts.onboarding,
      kiche_allowed: opts.kiche ?? false,
      phone: "555-0100",
      address: "123 Local St, Boulder, CO",
      zip: "80301",
      lat: 40.02, // ~1 mi from origin → inside auto-approve zone
      lng: -105.26,
    })
    .eq("id", id);
  if (error) throw new Error(`profile ${opts.email}: ${error.message}`);
  ctx.users.set(opts.email, id);
  return id;
}

export async function addPet(
  ctx: Ctx,
  ownerEmail: string,
  key: string,
  opts: { name: string; species: "dog" | "cat"; breed?: string },
): Promise<string> {
  const ownerId = ctx.users.get(ownerEmail);
  if (!ownerId) throw new Error(`addPet ${key}: unknown owner ${ownerEmail}`);
  const { data, error } = await ctx.db
    .from("pets")
    .insert({
      client_id: ownerId,
      name: opts.name,
      species: opts.species,
      breed: opts.breed ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`addPet ${key}: ${error?.message}`);
  ctx.pets.set(key, data.id);
  return data.id;
}

export async function insertBooking(
  ctx: Ctx,
  key: string,
  opts: {
    clientEmail: string;
    service: string;
    startsAt: Date;
    endsAt: Date;
    status:
      | "pending_approval"
      | "confirmed"
      | "completed"
      | "declined"
      | "cancelled"
      | "no_show";
    paymentStatus?: "unpaid" | "paid" | "refunded";
    finalCents: number;
    seriesKey?: string;
    petKeys?: string[];
  },
): Promise<string> {
  const clientId = ctx.users.get(opts.clientEmail);
  const svc = ctx.services.get(opts.service);
  if (!clientId) throw new Error(`booking ${key}: unknown ${opts.clientEmail}`);
  if (!svc) throw new Error(`booking ${key}: unknown service ${opts.service}`);
  const seriesId = opts.seriesKey ? ctx.series.get(opts.seriesKey) : null;
  if (opts.seriesKey && !seriesId) {
    throw new Error(`booking ${key}: unknown series ${opts.seriesKey}`);
  }
  const { data, error } = await ctx.db
    .from("bookings")
    .insert({
      client_id: clientId,
      service_id: svc.id,
      starts_at: opts.startsAt.toISOString(),
      ends_at: opts.endsAt.toISOString(),
      series_id: seriesId,
      status: opts.status,
      payment_status: opts.paymentStatus ?? "unpaid",
      concurrency: svc.concurrency,
      distance_miles: 3,
      quote_inputs: {},
      quote_breakdown: {},
      discount_cents: 0,
      final_cents: opts.finalCents,
      requires_approval: opts.status === "pending_approval",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`booking ${key}: ${error?.message}`);
  ctx.bookings.set(key, { id: data.id, clientId });
  for (const petKey of opts.petKeys ?? []) {
    const petId = ctx.pets.get(petKey);
    if (!petId) throw new Error(`booking ${key}: unknown pet ${petKey}`);
    const { error: bpErr } = await ctx.db
      .from("booking_pets")
      .insert({ booking_id: data.id, pet_id: petId });
    if (bpErr) {
      throw new Error(`booking_pets ${key}/${petKey}: ${bpErr.message}`);
    }
  }
  return data.id;
}

export async function insertSeries(
  ctx: Ctx,
  key: string,
  opts: {
    clientEmail: string;
    service: string;
    templateStartsAt: Date;
    durationMin: number;
    openEnded?: boolean;
    count?: number;
    skippedStarts?: Date[];
  },
): Promise<string> {
  const clientId = ctx.users.get(opts.clientEmail);
  const svc = ctx.services.get(opts.service);
  if (!clientId || !svc)
    throw new Error(`series ${key}: unknown client/service`);
  const { data, error } = await ctx.db
    .from("booking_series")
    .insert({
      client_id: clientId,
      service_id: svc.id,
      freq: "weekly",
      step_interval: 1,
      count: opts.count ?? null,
      until: null,
      open_ended: opts.openEnded ?? false,
      template_starts_at: opts.templateStartsAt.toISOString(),
      duration_min: opts.durationMin,
      quote_inputs: {},
      active: true,
      skipped_starts: (opts.skippedStarts ?? []).map((d) => d.toISOString()),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`series ${key}: ${error?.message}`);
  ctx.series.set(key, data.id);
  return data.id;
}

export async function insertPayment(
  ctx: Ctx,
  opts: {
    bookingKey: string;
    intentId: string;
    amountCents: number;
    status: "requires_payment" | "succeeded" | "refunded" | "failed";
  },
): Promise<void> {
  const booking = ctx.bookings.get(opts.bookingKey);
  if (!booking) throw new Error(`payment: unknown booking ${opts.bookingKey}`);
  const { error } = await ctx.db.from("payments").insert({
    booking_id: booking.id,
    client_id: booking.clientId,
    stripe_payment_intent_id: opts.intentId,
    amount_cents: opts.amountCents,
    currency: "usd",
    status: opts.status,
  });
  if (error) throw new Error(`payment ${opts.intentId}: ${error.message}`);
}

export async function insertDebit(
  ctx: Ctx,
  opts: {
    clientEmail: string;
    bookingKey?: string;
    amountCents: number;
    reason: "late_cancel" | "no_show";
    settled: boolean;
  },
): Promise<void> {
  const clientId = ctx.users.get(opts.clientEmail);
  if (!clientId) throw new Error(`debit: unknown ${opts.clientEmail}`);
  const { error } = await ctx.db.from("client_debits").insert({
    client_id: clientId,
    booking_id: opts.bookingKey ? ctx.bookings.get(opts.bookingKey)?.id : null,
    amount_cents: opts.amountCents,
    reason: opts.reason,
    settled_at: opts.settled ? ctx.now.toISOString() : null,
  });
  if (error) throw new Error(`debit ${opts.clientEmail}: ${error.message}`);
}

export async function insertReview(
  ctx: Ctx,
  opts: {
    clientEmail: string;
    authorName: string;
    rating: number;
    body: string;
    status: "pending" | "published" | "rejected";
  },
): Promise<void> {
  const clientId = ctx.users.get(opts.clientEmail);
  if (!clientId) throw new Error(`review: unknown ${opts.clientEmail}`);
  const { error } = await ctx.db.from("reviews").insert({
    client_id: clientId,
    author_name: opts.authorName,
    rating: opts.rating,
    body: opts.body,
    status: opts.status,
  });
  if (error) throw new Error(`review ${opts.authorName}: ${error.message}`);
}

export async function insertInquiry(
  ctx: Ctx,
  opts: {
    clientEmail?: string;
    name: string;
    email: string;
    subject?: string;
    message: string;
    status: "new" | "resolved";
  },
): Promise<void> {
  const clientId = opts.clientEmail
    ? (ctx.users.get(opts.clientEmail) ?? null)
    : null;
  const resolved = opts.status === "resolved";
  const { error } = await ctx.db.from("inquiries").insert({
    client_id: clientId,
    name: opts.name,
    email: opts.email,
    subject: opts.subject ?? null,
    message: opts.message,
    status: opts.status,
    replied_at: resolved ? ctx.now.toISOString() : null,
    resolved_at: resolved ? ctx.now.toISOString() : null,
  });
  if (error) throw new Error(`inquiry ${opts.email}: ${error.message}`);
}

export async function insertWindow(
  ctx: Ctx,
  opts: { startsAt: Date; endsAt: Date; note?: string },
): Promise<void> {
  const { error } = await ctx.db.from("availability_windows").insert({
    starts_at: opts.startsAt.toISOString(),
    ends_at: opts.endsAt.toISOString(),
    note: opts.note ?? null,
  });
  if (error) throw new Error(`window: ${error.message}`);
}

export async function insertNight(
  ctx: Ctx,
  nightIsoDate: string,
  note?: string,
): Promise<void> {
  const { error } = await ctx.db
    .from("overnight_nights")
    .insert({ night: nightIsoDate, note: note ?? null });
  if (error) throw new Error(`night ${nightIsoDate}: ${error.message}`);
}
```

- [ ] **Step 2: Create `scripts/db-seed/wipe.ts`:**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_EMAIL } from "./constants";
import { ensureAdmin } from "./factories";

// Children before parents (FK delete order). services + settings are
// migration-owned and never wiped (spec). PostgREST requires a filter on
// delete; `not col is null` matches every row.
const WIPE_ORDER: ReadonlyArray<{ table: string; col: string }> = [
  { table: "form_responses", col: "id" },
  { table: "payments", col: "id" },
  { table: "booking_pets", col: "booking_id" },
  { table: "bookings", col: "id" },
  { table: "booking_series", col: "id" },
  { table: "client_debits", col: "id" },
  { table: "reviews", col: "id" },
  { table: "inquiries", col: "id" },
  { table: "pets", col: "id" },
  { table: "availability_windows", col: "id" },
  { table: "overnight_nights", col: "night" },
];

/** Wipe-first reset: empty scenario-owned tables, delete non-admin auth
 *  users (cascades profiles), ensure the admin exists. Returns admin id. */
export async function wipe(db: SupabaseClient): Promise<string> {
  for (const { table, col } of WIPE_ORDER) {
    const { error } = await db.from(table).delete().not(col, "is", null);
    if (error) throw new Error(`wipe ${table}: ${error.message}`);
  }
  for (;;) {
    const { data, error } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const targets = data.users.filter((u) => u.email !== ADMIN_EMAIL);
    if (targets.length === 0) break;
    for (const u of targets) {
      const { error: delErr } = await db.auth.admin.deleteUser(u.id);
      if (delErr) {
        throw new Error(`deleteUser ${u.email ?? u.id}: ${delErr.message}`);
      }
    }
  }
  return ensureAdmin(db);
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add scripts/db-seed/factories.ts scripts/db-seed/wipe.ts
git commit -m "feat: add seeder factories and wipe-first reset"
```

### Task 6: Scenarios + registry (registry shape TDD)

**Files:**

- Create: `scripts/db-seed/scenarios.ts`
- Test: `scripts/db-seed/scenarios.test.ts`

Fixture design (from spec): deterministic users/pets/timetable; busy-week and payment-states use **disjoint** users so `admin-demo` can concatenate their steps without dedup. All same-class bookings occupy disjoint time slots (exclusion constraint `no_same_class_overlap`). Timetable statuses derive from `statusFor` (past → completed); payment-state bookings set status explicitly.

- [ ] **Step 1: Write the failing tests** — `scripts/db-seed/scenarios.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SCENARIOS } from "./scenarios";

describe("SCENARIOS registry", () => {
  it("defines exactly the four spec scenarios", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual([
      "admin-demo",
      "busy-week",
      "fresh",
      "payment-states",
    ]);
  });

  it("fresh is wipe-only (no steps)", () => {
    expect(SCENARIOS["fresh"]).toEqual([]);
  });

  it("admin-demo composes busy-week + payment-states + extras", () => {
    const names = SCENARIOS["admin-demo"].map((s) => s.name);
    for (const s of SCENARIOS["busy-week"]) expect(names).toContain(s.name);
    for (const s of SCENARIOS["payment-states"]) {
      expect(names).toContain(s.name);
    }
    expect(names).toContain("admin-demo-extras");
  });

  it("step names are unique within each scenario", () => {
    for (const steps of Object.values(SCENARIOS)) {
      const names = steps.map((s) => s.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/db-seed/scenarios.test.ts`
Expected: FAIL — cannot resolve `./scenarios`.

- [ ] **Step 3: Implement** — `scripts/db-seed/scenarios.ts`:

```ts
import { addMinutes } from "date-fns";
import {
  type Ctx,
  addPet,
  createClientUser,
  insertBooking,
  insertDebit,
  insertInquiry,
  insertNight,
  insertPayment,
  insertReview,
  insertSeries,
  insertWindow,
} from "./factories";
import { slot, statusFor, weekAnchor } from "./dates";

export interface Step {
  name: string;
  run(ctx: Ctx): Promise<void>;
}

// ── busy-week ─────────────────────────────────────────────────────────────────

const busyClients: Step = {
  name: "busy-clients",
  async run(ctx) {
    await createClientUser(ctx, {
      email: "dana@local.test",
      fullName: "Dana Walker",
      onboarding: "approved",
    });
    await addPet(ctx, "dana@local.test", "biscuit", {
      name: "Biscuit",
      species: "dog",
      breed: "Lab mix",
    });
    await addPet(ctx, "dana@local.test", "maple", {
      name: "Maple",
      species: "dog",
      breed: "Corgi",
    });
    await createClientUser(ctx, {
      email: "sam@local.test",
      fullName: "Sam Reyes",
      onboarding: "approved",
    });
    await addPet(ctx, "sam@local.test", "pepper", {
      name: "Pepper",
      species: "dog",
      breed: "Heeler",
    });
    await addPet(ctx, "sam@local.test", "mochi", {
      name: "Mochi",
      species: "cat",
    });
    await createClientUser(ctx, {
      email: "lee@local.test",
      fullName: "Lee Nguyen",
      onboarding: "approved",
    });
    await addPet(ctx, "lee@local.test", "clementine", {
      name: "Clementine",
      species: "cat",
    });
  },
};

const busyAvailability: Step = {
  name: "busy-availability",
  async run(ctx) {
    const a = weekAnchor(ctx.now);
    // Mon–Sat 8:00–18:00 Denver, this week + next.
    for (const day of [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12]) {
      await insertWindow(ctx, {
        startsAt: slot(a, day, 8),
        endsAt: slot(a, day, 18),
      });
    }
    // Overnight nights: Fri + Sat this week (covers the resident booking).
    for (const day of [4, 5]) {
      const d = slot(a, day, 12);
      await insertNight(
        ctx,
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Denver",
        }).format(d),
      );
    }
  },
};

const busyBookings: Step = {
  name: "busy-bookings",
  async run(ctx) {
    const a = weekAnchor(ctx.now);
    // Disjoint same-class slots; statuses derived from time vs now.
    const timetable = [
      // walks ($25/h + $10/dog)
      {
        key: "walk-mon",
        svc: "walk",
        email: "dana@local.test",
        pets: ["biscuit", "maple"],
        day: 0,
        h: 9,
        m: 0,
        dur: 60,
        cents: 4500,
      },
      {
        key: "walk-tue",
        svc: "walk",
        email: "sam@local.test",
        pets: ["pepper"],
        day: 1,
        h: 9,
        m: 0,
        dur: 60,
        cents: 3500,
      },
      {
        key: "walk-wed",
        svc: "walk",
        email: "dana@local.test",
        pets: ["biscuit"],
        day: 2,
        h: 14,
        m: 0,
        dur: 60,
        cents: 3500,
      },
      {
        key: "walk-thu",
        svc: "walk",
        email: "sam@local.test",
        pets: ["pepper"],
        day: 3,
        h: 9,
        m: 0,
        dur: 60,
        cents: 3500,
      },
      {
        key: "walk-fri",
        svc: "walk",
        email: "dana@local.test",
        pets: ["maple"],
        day: 4,
        h: 11,
        m: 0,
        dur: 60,
        cents: 3500,
      },
      {
        key: "walk-sat",
        svc: "walk",
        email: "sam@local.test",
        pets: ["pepper"],
        day: 5,
        h: 10,
        m: 0,
        dur: 60,
        cents: 3500,
      },
      // check-ins ($30/h, $15 min)
      {
        key: "checkin-mon",
        svc: "check-in",
        email: "lee@local.test",
        pets: ["clementine"],
        day: 0,
        h: 13,
        m: 0,
        dur: 30,
        cents: 1500,
      },
      {
        key: "checkin-wed",
        svc: "check-in",
        email: "sam@local.test",
        pets: ["mochi"],
        day: 2,
        h: 9,
        m: 30,
        dur: 30,
        cents: 1500,
      },
      {
        key: "checkin-fri",
        svc: "check-in",
        email: "lee@local.test",
        pets: ["clementine"],
        day: 4,
        h: 15,
        m: 0,
        dur: 30,
        cents: 1500,
      },
      // training ($35/h, max 1 pet)
      {
        key: "training-tue",
        svc: "training",
        email: "dana@local.test",
        pets: ["biscuit"],
        day: 1,
        h: 16,
        m: 0,
        dur: 60,
        cents: 3500,
      },
    ];
    for (const t of timetable) {
      const startsAt = slot(a, t.day, t.h, t.m);
      await insertBooking(ctx, t.key, {
        clientEmail: t.email,
        service: t.svc,
        startsAt,
        endsAt: addMinutes(startsAt, t.dur),
        status: statusFor(startsAt, ctx.now),
        paymentStatus: "unpaid",
        finalCents: t.cents,
        petKeys: t.pets,
      });
    }
    // Resident house-sit: Fri 18:00 → Sun 10:00, cat-only 2 nights ($30/night).
    await insertBooking(ctx, "housesit-weekend", {
      clientEmail: "lee@local.test",
      service: "house-sitting",
      startsAt: slot(a, 4, 18),
      endsAt: slot(a, 6, 10),
      status: statusFor(slot(a, 4, 18), ctx.now),
      finalCents: 6000,
      petKeys: ["clementine"],
    });
    // Pending approvals, next week.
    await insertBooking(ctx, "pending-walk", {
      clientEmail: "dana@local.test",
      service: "walk",
      startsAt: slot(a, 7, 9),
      endsAt: slot(a, 7, 10),
      status: "pending_approval",
      finalCents: 4500,
      petKeys: ["biscuit", "maple"],
    });
    await insertBooking(ctx, "pending-housesit", {
      clientEmail: "sam@local.test",
      service: "house-sitting",
      startsAt: slot(a, 10, 18),
      endsAt: slot(a, 12, 10),
      status: "pending_approval",
      finalCents: 13000,
      petKeys: ["pepper", "mochi"],
    });
  },
};

const busySeries: Step = {
  name: "busy-series",
  async run(ctx) {
    const a = weekAnchor(ctx.now);
    // Weekly walk, Mondays 15:00, open-ended; week-3 occurrence skipped
    // (EXDATE), so occurrences exist at +1w, +2w, +4w.
    const template = slot(a, 7, 15);
    await insertSeries(ctx, "weekly-walk", {
      clientEmail: "sam@local.test",
      service: "walk",
      templateStartsAt: template,
      durationMin: 60,
      openEnded: true,
      skippedStarts: [slot(a, 21, 15)],
    });
    for (const day of [7, 14, 28]) {
      const startsAt = slot(a, day, 15);
      await insertBooking(ctx, `series-walk-d${day}`, {
        clientEmail: "sam@local.test",
        service: "walk",
        startsAt,
        endsAt: addMinutes(startsAt, 60),
        status: "confirmed",
        finalCents: 3500,
        seriesKey: "weekly-walk",
        petKeys: ["pepper"],
      });
    }
  },
};

// ── payment-states ────────────────────────────────────────────────────────────

const paymentClients: Step = {
  name: "payment-clients",
  async run(ctx) {
    await createClientUser(ctx, {
      email: "paula@local.test",
      fullName: "Paula Iverson",
      onboarding: "approved",
    });
    await addPet(ctx, "paula@local.test", "rex", {
      name: "Rex",
      species: "dog",
      breed: "GSD",
    });
    await createClientUser(ctx, {
      email: "devon@local.test",
      fullName: "Devon Price",
      onboarding: "approved",
    });
    await addPet(ctx, "devon@local.test", "koda", {
      name: "Koda",
      species: "dog",
      breed: "Husky",
    });
  },
};

const paymentBookings: Step = {
  name: "payment-bookings",
  async run(ctx) {
    const a = weekAnchor(ctx.now);
    // 7:00 walks — below the busy-week timetable's earliest slot, so
    // admin-demo composition can never violate the same-class exclusion.
    const mk = (key: string, day: number) => ({
      key,
      startsAt: slot(a, day, 7),
      endsAt: slot(a, day, 8),
    });

    // unpaid, no payments row
    const b1 = mk("pay-unpaid", 0);
    await insertBooking(ctx, b1.key, {
      clientEmail: "paula@local.test",
      service: "walk",
      startsAt: b1.startsAt,
      endsAt: b1.endsAt,
      status: "completed",
      paymentStatus: "unpaid",
      finalCents: 3500,
      petKeys: ["rex"],
    });

    // paid (payment succeeded)
    const b3 = mk("pay-paid", 1);
    await insertBooking(ctx, b3.key, {
      clientEmail: "paula@local.test",
      service: "walk",
      startsAt: b3.startsAt,
      endsAt: b3.endsAt,
      status: "completed",
      paymentStatus: "paid",
      finalCents: 3500,
      petKeys: ["rex"],
    });
    await insertPayment(ctx, {
      bookingKey: b3.key,
      intentId: "pi_seed_paid",
      amountCents: 3500,
      status: "succeeded",
    });

    // refunded (cancelled in full-refund window)
    const b4 = mk("pay-refunded", 2);
    await insertBooking(ctx, b4.key, {
      clientEmail: "paula@local.test",
      service: "walk",
      startsAt: b4.startsAt,
      endsAt: b4.endsAt,
      status: "cancelled",
      paymentStatus: "refunded",
      finalCents: 3500,
      petKeys: ["rex"],
    });
    await insertPayment(ctx, {
      bookingKey: b4.key,
      intentId: "pi_seed_refunded",
      amountCents: 3500,
      status: "refunded",
    });

    // no-show with outstanding debt → devon's re-booking is debt-gated
    const b6 = mk("pay-noshow", 3);
    await insertBooking(ctx, b6.key, {
      clientEmail: "devon@local.test",
      service: "walk",
      startsAt: b6.startsAt,
      endsAt: b6.endsAt,
      status: "no_show",
      paymentStatus: "unpaid",
      finalCents: 3500,
      petKeys: ["koda"],
    });
    await insertDebit(ctx, {
      clientEmail: "devon@local.test",
      bookingKey: b6.key,
      amountCents: 3500,
      reason: "no_show",
      settled: false,
    });

    // late cancel with settled debt (history, no gate)
    const b7 = mk("pay-latecancel", 4);
    await insertBooking(ctx, b7.key, {
      clientEmail: "paula@local.test",
      service: "walk",
      startsAt: b7.startsAt,
      endsAt: b7.endsAt,
      status: "cancelled",
      paymentStatus: "unpaid",
      finalCents: 3500,
      petKeys: ["rex"],
    });
    await insertDebit(ctx, {
      clientEmail: "paula@local.test",
      bookingKey: b7.key,
      amountCents: 1750,
      reason: "late_cancel",
      settled: true,
    });

    // open intent (requires_payment), next week
    const b2 = mk("pay-open-intent", 7);
    await insertBooking(ctx, b2.key, {
      clientEmail: "paula@local.test",
      service: "walk",
      startsAt: b2.startsAt,
      endsAt: b2.endsAt,
      status: "confirmed",
      paymentStatus: "unpaid",
      finalCents: 3500,
      petKeys: ["rex"],
    });
    await insertPayment(ctx, {
      bookingKey: b2.key,
      intentId: "pi_seed_open",
      amountCents: 3500,
      status: "requires_payment",
    });

    // failed payment, next week
    const b5 = mk("pay-failed", 8);
    await insertBooking(ctx, b5.key, {
      clientEmail: "paula@local.test",
      service: "walk",
      startsAt: b5.startsAt,
      endsAt: b5.endsAt,
      status: "confirmed",
      paymentStatus: "unpaid",
      finalCents: 3500,
      petKeys: ["rex"],
    });
    await insertPayment(ctx, {
      bookingKey: b5.key,
      intentId: "pi_seed_failed",
      amountCents: 3500,
      status: "failed",
    });
  },
};

// ── admin-demo extras ─────────────────────────────────────────────────────────

const adminDemoExtras: Step = {
  name: "admin-demo-extras",
  async run(ctx) {
    const a = weekAnchor(ctx.now);
    // Every onboarding status on the clients list.
    await createClientUser(ctx, {
      email: "noor@local.test",
      fullName: "Noor Haddad",
      onboarding: "info_pending",
    });
    await createClientUser(ctx, {
      email: "morgan@local.test",
      fullName: "Morgan Avery",
      onboarding: "meet_greet_pending",
    });
    await addPet(ctx, "morgan@local.test", "scout", {
      name: "Scout",
      species: "dog",
      breed: "Beagle",
    });
    await createClientUser(ctx, {
      email: "drew@local.test",
      fullName: "Drew Castle",
      onboarding: "declined",
    });
    await createClientUser(ctx, {
      email: "kira@local.test",
      fullName: "Kira Bell",
      onboarding: "approved",
      kiche: true,
    });
    await addPet(ctx, "kira@local.test", "juniper", {
      name: "Juniper",
      species: "dog",
      breed: "Aussie",
    });
    // Upcoming meet & greet (free, onboarding flow).
    await insertBooking(ctx, "meet-greet-morgan", {
      clientEmail: "morgan@local.test",
      service: "meet-greet",
      startsAt: slot(a, 9, 11),
      endsAt: slot(a, 9, 11, 30),
      status: "confirmed",
      finalCents: 0,
      petKeys: ["scout"],
    });
    // Inquiries queue: one new guest, one resolved client-linked.
    await insertInquiry(ctx, {
      name: "Taylor Guest",
      email: "taylor@example.com",
      subject: "Weekend availability?",
      message: "Hi — do you have any weekend walk slots open this month?",
      status: "new",
    });
    await insertInquiry(ctx, {
      clientEmail: "morgan@local.test",
      name: "Morgan Avery",
      email: "morgan@local.test",
      message: "Following up on our meet & greet time.",
      status: "resolved",
    });
    // Reviews moderation queue: one of each status.
    await insertReview(ctx, {
      clientEmail: "dana@local.test",
      authorName: "Dana W.",
      rating: 5,
      body: "Biscuit and Maple come home tired and happy every time.",
      status: "pending",
    });
    await insertReview(ctx, {
      clientEmail: "sam@local.test",
      authorName: "Sam R.",
      rating: 5,
      body: "Reliable, communicative, and great with a nervous heeler.",
      status: "published",
    });
    await insertReview(ctx, {
      clientEmail: "kira@local.test",
      authorName: "Kira B.",
      rating: 4,
      body: "Juniper loves her walks.",
      status: "rejected",
    });
  },
};

// ── registry ──────────────────────────────────────────────────────────────────

const busyWeekSteps: Step[] = [
  busyClients,
  busyAvailability,
  busyBookings,
  busySeries,
];
const paymentSteps: Step[] = [paymentClients, paymentBookings];

export const SCENARIOS: Record<string, Step[]> = {
  fresh: [],
  "busy-week": busyWeekSteps,
  "payment-states": paymentSteps,
  "admin-demo": [...busyWeekSteps, ...paymentSteps, adminDemoExtras],
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/db-seed`
Expected: PASS (all seeder tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/db-seed/scenarios.ts scripts/db-seed/scenarios.test.ts
git commit -m "feat: add seed scenarios and registry"
```

### Task 7: CLI entry + summary; run every scenario twice

**Files:**

- Create: `scripts/db-seed/summary.ts`
- Create: `scripts/db-seed/index.ts`

- [ ] **Step 1: Create `scripts/db-seed/summary.ts`:**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_EMAIL, SEED_PASSWORD } from "./constants";

const TABLES = [
  "profiles",
  "pets",
  "availability_windows",
  "overnight_nights",
  "bookings",
  "booking_series",
  "booking_pets",
  "payments",
  "client_debits",
  "reviews",
  "inquiries",
];

export async function printSummary(db: SupabaseClient): Promise<void> {
  console.log("\nSeeded state:");
  for (const table of TABLES) {
    const { count, error } = await db
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(`count ${table}: ${error.message}`);
    console.log(`  ${table.padEnd(22)} ${count}`);
  }
  console.log(
    `\nLogins (all seeded users share one password): ${SEED_PASSWORD}`,
  );
  console.log(`  admin: ${ADMIN_EMAIL}`);
  const { data, error } = await db
    .from("profiles")
    .select("email, onboarding_status")
    .neq("role", "admin")
    .order("email");
  if (error) throw new Error(`list profiles: ${error.message}`);
  for (const p of data ?? []) {
    console.log(`  client: ${p.email} (${p.onboarding_status})`);
  }
}
```

- [ ] **Step 2: Create `scripts/db-seed/index.ts`:**

```ts
import { makeServiceClient } from "./client";
import { type Ctx, loadServices } from "./factories";
import { SCENARIOS } from "./scenarios";
import { printSummary } from "./summary";
import { wipe } from "./wipe";

async function main(): Promise<void> {
  const name = process.argv[2];
  if (!name || !(name in SCENARIOS)) {
    console.error(
      `Usage: npm run db:seed -- <scenario>\nScenarios: ${Object.keys(SCENARIOS).join(", ")}`,
    );
    process.exit(1);
  }
  const db = makeServiceClient();
  console.log(`Seeding "${name}" (wipe-first; services/settings untouched)…`);
  const adminId = await wipe(db);
  const ctx: Ctx = {
    db,
    now: new Date(),
    adminId,
    users: new Map(),
    pets: new Map(),
    bookings: new Map(),
    series: new Map(),
    services: new Map(),
  };
  await loadServices(ctx);
  for (const step of SCENARIOS[name]) {
    console.log(`  step: ${step.name}`);
    await step.run(ctx);
  }
  await printSummary(db);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
```

- [ ] **Step 3: Gates**

Run: `npm run typecheck` then `npm run lint` then `npx vitest run scripts/db-seed`
Expected: all green.

- [ ] **Step 4: Run every scenario twice (wipe idempotence — spec DoD)**

Local stack must be up (`npx supabase status`). Run, in order:

```
npm run db:seed -- fresh
npm run db:seed -- fresh
npm run db:seed -- busy-week
npm run db:seed -- busy-week
npm run db:seed -- payment-states
npm run db:seed -- payment-states
npm run db:seed -- admin-demo
npm run db:seed -- admin-demo
```

Expected: every run exits 0; second run of each scenario prints **identical row counts** to the first. `admin-demo` expected counts: profiles 10 (1 admin + 9 clients), bookings 24 (busy timetable 10 + house-sit 1 + pending 2 + series 3 + payment-states 7 + meet-greet 1), booking_series 1, payments 4, client_debits 2, reviews 3, inquiries 2.

- [ ] **Step 5: Negative test — guard refuses non-local URL**

Run (PowerShell):

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"; $env:SUPABASE_SECRET_KEY = "x"; npx tsx scripts/db-seed/index.ts fresh
```

Expected: exits non-zero with `db:seed is local-only — refusing Supabase URL with host "example.supabase.co"`. (Open a fresh shell afterwards so the env vars don't linger.)

- [ ] **Step 6: Commit**

```bash
git add scripts/db-seed/summary.ts scripts/db-seed/index.ts
git commit -m "feat: add db:seed cli with wipe-first scenario runner"
```

### Task 8: Docs, register prune, review, close out

**Files:**

- Modify: `docs/DESIGN.md` (add "Local data seeding" section after "Data model")
- Modify: `docs/superpowers/specs/2026-06-10-audit-findings.md` (prune S1)
- Modify: `docs/superpowers/specs/2026-06-10-professionalization-roadmap-design.md` (SP2 status)
- Modify: `docs/superpowers/HANDOFF.md` (progress + session log + gotcha)

- [ ] **Step 1: Add to `docs/DESIGN.md`** (new section after "Data model"):

```markdown
## Local data seeding

`supabase/seed.sql` creates the local admin login (`admin@local.test` / `password123`) on every `npx supabase db reset` (local-only; seeds never run on prod). Named DB states: `npm run db:seed -- <scenario>` — `fresh`, `busy-week`, `payment-states`, `admin-demo`. Wipe-first + deterministic; seeder refuses non-local URLs; services + settings stay migration-owned. All seeded users share the admin password. Design: [SP2 spec](superpowers/specs/2026-06-10-db-seeding-design.md). Each later SP extends scenarios for the states it changes (roadmap standing rule).
```

- [ ] **Step 2: Prune finding S1** from the register — remove the SP2 table; add one line under the register's resolved/closed area following the SP1 precedent: `S1 resolved by SP2 (db seeding framework), <today's date>.`

- [ ] **Step 3: Roadmap §SP2** — append status line (mirroring SP1's): `**Status: DONE <date>.** Next SP: SP3 foundations.`

- [ ] **Step 4: HANDOFF.md** — SP2 row: spec + plan links, status `**DONE <date>**`; SP3 row status `**next**`; append session-log line (date · SP2 · what shipped · blockers); add gotcha bullet under "Repo/tooling gotchas": `npm run db:seed -- <scenario>` wipes all non-admin local data (wipe-first) — local-only by guard.

- [ ] **Step 5: Gates (full set, spec DoD)**

Run:

```
npm run typecheck
npm run lint
npx vitest run scripts/db-seed
git add docs/DESIGN.md docs/superpowers/specs/2026-06-10-audit-findings.md docs/superpowers/specs/2026-06-10-professionalization-roadmap-design.md docs/superpowers/HANDOFF.md
node scripts/check-doc-links.mjs
```

Expected: all green (link check reads staged versions — stage first, as above).

- [ ] **Step 6: Manual `verify`** — with the local stack running and `admin-demo` seeded: sign in to the app (`npm run dev` or maintainer's running server on port 3000) as `admin@local.test`, confirm admin calendar shows the busy week + pending approvals + inquiries; sign in as `dana@local.test`, confirm her bookings render. Report what was seen.

- [ ] **Step 7: Commit**

```bash
git commit -m "docs: document local seeding and close out seeding framework"
```

- [ ] **Step 8: Fresh-session `/code-review`** of the cumulative SP2 diff (author never grades itself — Claude-only repo degrades cross-model review to a fresh session, per HANDOFF). Criticals → `## Handoff log` below; archive this plan to `docs/superpowers/plans/archive/` once review is clean (lifecycle rule, next docs commit).

---

## Definition of Done (from spec)

- `npx supabase db reset` alone → login-able local admin (Task 2 acceptance test).
- All four scenarios run green twice consecutively with identical counts (Task 7).
- Guard refuses non-local URLs (Task 7 negative test).
- `npm run typecheck` + `npm run lint` + `npx vitest run scripts/db-seed` green; fresh-session `/code-review`; manual `verify` in the app.
- S1 pruned; DESIGN.md note landed; roadmap + HANDOFF updated; plan archived.

## Handoff log

(escalations + non-blocking notes per WORKFLOW.md protocol)
