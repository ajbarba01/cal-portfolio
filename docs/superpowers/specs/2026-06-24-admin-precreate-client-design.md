# Admin pre-created (unclaimed) clients — design

> Lets Cal (admin) create a client record before that person signs up — to approve them,
> fill forms, and create bookings on their behalf — and gives existing offline clients a
> one-click migration into a real account. Approach: **unclaimed shadow account**.

_Date: 2026-06-24 · Status: approved design, ready for implementation plan_

## Problem

Cal has real-world clients who have never used the site. Today a client record cannot exist
without the person self-signing-up: `profiles` is strictly 1:1 with `auth.users`
(`profiles.id = auth.uid()`), and every booking/form/payment FK plus all RLS keys off
`client_id = auth.uid()`. So Cal cannot track bookings/forms for an offline client, and
existing clients have no easy migration path.

The admin **on-behalf** machinery already exists (`/admin/clients/[id]/book`, on-behalf form
completion, the onboarding-status approval dropdown). The only missing piece is **creating the
client record itself** without the person signing up.

## Approach (chosen): unclaimed shadow account

Mint a real `auth.users` row via the Supabase admin API with **no password**, flag its profile
as `unclaimed`, and reuse every existing flow unchanged. Migration = Cal generates a one-time
**claim link**, the client sets a password, the flag clears, and the existing
`onboarding_status` middleware routes them.

**Why not the alternatives:**

- **Decoupled `client_leads` table** — bookings/forms/payments/RLS all key off `profiles` /
  `auth.uid()`; a parallel entity means duplicating tables or a claim-time data migration.
  Disproportionate for a single-admin tool. Rejected.
- **Profile without an auth user (nullable auth link)** — touches every RLS policy and FK
  assumption in a mature deny-by-default schema. High risk, low reward. Rejected.

Approach A is the standard Supabase pattern and the only one that does not fight the
`auth.uid()` foundation. Blast radius: one migration (three nullable/default columns), one RLS
guard edit, one create action, one claim page + action, one notification guard, plus admin UI.

## Decisions captured from brainstorming

- Cal **always has an email** for these clients → a real auth user can be minted immediately.
- The invite is **Cal-initiated** (a button), never automatic on creation.
- Delivery is **copy-the-link**; Cal sends it however they like. **No system email** for the
  claim link (avoids deliverability risk and a wrong-address auto-send). Resend is not involved.
- Post-claim behavior is driven **entirely by `onboarding_status`** that Cal set — the existing
  middleware already redirects non-approved users to `/onboarding`. Approved → straight in;
  `info_pending` → onboarding step 1. No new post-claim routing logic.
- **Notifications are suppressed while unclaimed.** Cal handles comms manually until the client
  claims; the only outbound is the claim link Cal copies and sends by hand.
- Default initial status at create = **Approved** (the common migration case), editable.

## Data model

**`profiles` additions (one migration):**

| Column       | Type                             | Purpose                                                              |
| ------------ | -------------------------------- | -------------------------------------------------------------------- |
| `unclaimed`  | `boolean not null default false` | Authoritative "Cal made this; nobody has taken it over yet" flag.    |
| `claimed_at` | `timestamptz null`               | Stamped when the client claims (audit / "migrated on").              |
| `invited_at` | `timestamptz null`               | Stamped when Cal generates a claim link ("invite generated <time>"). |

**Why a `false`-default flag instead of inferring from a null `claimed_at`:** the profile row is
created by a DB trigger on `auth.users` insert, which cannot distinguish admin-create from
self-signup. A `false`-default opt-in flag means **every existing signup/OAuth path needs zero
changes** — only the admin-create action flips a row to `unclaimed=true`.

**No other schema changes.** `bookings`, `form_responses`, `pets`, `booking_pets`, `payments`,
RLS, and the exclusion constraint are untouched.

### State semantics

- `unclaimed = true` → shadow account. No password exists, so password-login is impossible by
  construction. Cal drives everything via existing on-behalf flows. Notifications suppressed.
- Claim link → set password → `unclaimed = false`, `claimed_at = now()`. From that instant it is
  an ordinary account; the existing `onboarding_status` middleware decides where they land.

### Security (RLS column guard)

`unclaimed`, `claimed_at`, and `invited_at` join `role`, `onboarding_status`, `lat`, `lng` in the
**client `UPDATE` column whitelist** on `profiles` — **system/admin-set, never client-writable**.
Otherwise a claimed client could self-flip `unclaimed` or forge `claimed_at`. The create, claim,
and invite actions all write these columns under the **service role** in admin/auth-gated server
actions.

## Create flow

**Entry point:** a **"New client"** button on `/admin/clients` → dedicated route
`/admin/clients/new` (a route, not a modal: it sets initial `onboarding_status` and is the front
door to the whole offline-client lifecycle). On success → redirect to the new client's detail
page, where the approval dropdown, on-behalf forms, on-behalf booking, pets, and the new invite
panel already live.

**Fields at create (minimal; everything else deferred to existing on-behalf flows):**

- **Email** (required — the auth identity) and **full name** (required).
- **Phone, address/zip** (optional; address feeds the existing geocode → distance pipeline).
- **Initial onboarding status** — default **Approved**, with `info_pending` /
  `meet_greet_pending` / `declined` selectable. The one knob that decides post-claim landing;
  editable later via the existing dropdown.

**Server action `createUnclaimedClient` (admin-gated, service role):**

1. Validate input with Zod at the edge.
2. `auth.admin.createUser({ email, email_confirm: true })` — **no password**.
3. The profile trigger creates the row; the action then updates it: `full_name`, `phone`,
   `address`/`zip`, `onboarding_status`, **`unclaimed = true`**.
4. If an address is present, run the existing geocode adapter → `lat`/`lng` (same as signup).
5. Return the new id → redirect to the detail page.

**Email collision (deliberate):** `auth.admin.createUser` errors if the email already exists. The
action maps this to a friendly, specific result — "A client with this email already exists" —
ideally linking to that existing client rather than surfacing a raw error, so Cal cannot
accidentally fork a real client into a duplicate shadow.

**Reused unchanged after creation:** approval dropdown, `/admin/clients/[id]/book`, on-behalf form
completion, pets. That reuse is the entire payoff of approach A.

## Claim flow

**Generate link (Cal's button).** On the client detail page, for an `unclaimed` client, a
**"Generate claim link"** action. Server action (admin-gated, service role) calls Supabase admin
`generateLink`:

- Type **`invite`** against the existing email (a one-time, expiring token URL that lands the user
  in a set-password state; `invite` is the right semantic — this account never had a password).
- `redirectTo` points at our own **`/claim`** page so we control the landing UX.
- Stamp `invited_at = now()`.
- Return the URL to the client component, which renders it with a **copy button** and an "invite
  generated <time>" line afterward. Cal copies and sends it.

**Security:** the claim link is a credential — whoever holds it can set the password and take the
account. Acceptable because Cal sends it directly to the intended client; it is one-time and
expiring (Supabase default) and surfaced only to an authenticated admin. We never email it
ourselves. The panel warns Cal it is sensitive.

**`/claim` landing page** (new public route in the `auth` group):

1. Supabase verifies the token → an authenticated session for that user.
2. A **set-password** form (reuses the existing password-field component + validation).
3. On submit: set the password, then a small server action stamps **`unclaimed = false`,
   `claimed_at = now()`**.
4. Redirect to `/account` (or a validated `returnTo`). The **existing onboarding middleware** takes
   over with no new logic.

**Edge cases:**

- Expired/used token → "this link expired; ask Cal for a new one." Cal regenerates.
- Already-claimed account opening an old link (`unclaimed = false`) → route to normal login
  instead of re-claiming.

**Out of scope:** no rework of the standard password-reset flow. Claimed clients use the existing
reset; the claim path covers only the unclaimed → claimed transition.

## Notification suppression

A single suppression predicate — `shouldNotify(profile)` returning `false` when
`profile.unclaimed` — is applied at every dispatch boundary that resolves a recipient profile:
the booking-confirmation send path and the reminder/completion crons. The recipient-resolution
queries already read `profiles`; they select `unclaimed` and short-circuit. Suppression is a
clean no-op (logged, not an error). The instant `unclaimed` clears, normal comms resume. The
claim link is generated/copied, never auto-sent, so it is unaffected.

## Admin UI

Run the `frontend-design` skill during the build for these surfaces (standing rule): no new
shadows, semantic tokens only, mobile parity.

- **Directory (`/admin/clients`):** an **"Unclaimed"** badge per unclaimed client (and "invite
  generated" once `invited_at` is set), reusing the existing badge/status vocabulary — no new
  color tokens. A "show only unclaimed" filter is nice-to-have, not MVP.
- **Detail (`/admin/clients/[id]`):** a small **"Account claim"** panel — status line (Unclaimed /
  invite generated <time> / Claimed <date>) and the **Generate claim link** button → copy field.
  Everything else on the page (approval dropdown, forms, book, pets) is the existing UI,
  unchanged.

## Testing

- **Pure/unit:** `shouldNotify` predicate; create-action validation + email-collision mapping;
  claim state transition (unclaimed → claimed, already-claimed guard, expired-token handling).
- **Integration (local Supabase):** `createUnclaimedClient` mints an auth user + flagged profile;
  on-behalf booking/forms work against an unclaimed client; claim flips the flags; the RLS column
  guard rejects a client trying to write `unclaimed` / `claimed_at` / `invited_at`.
- **Seeding:** extend the seed scenarios with an unclaimed client (and one with a generated
  invite) so the admin UI states are demoable (roadmap standing rule: each feature extends seed
  scenarios for the states it changes).

## Docs to update in the same commit (same-commit doc rule)

- `docs/DESIGN.md`: `profiles` columns (`unclaimed`, `claimed_at`, `invited_at`); the column-guard
  list; `/admin/clients/new` and `/claim` in the route map; notification-suppression note; a brief
  "pre-created / unclaimed clients" subsection.

## Open questions

None blocking. Deferred niceties (not MVP): "show only unclaimed" directory filter; bulk import of
offline clients; per-client notification toggle (explicitly rejected in favor of the simple
`unclaimed` gate).
