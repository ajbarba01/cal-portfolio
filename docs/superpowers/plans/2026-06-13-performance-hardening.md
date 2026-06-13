# Performance Hardening Plan — cal-portfolio (v2, post-`(site)`shell refactor)

> Executable task-by-task by an implementer agent (Opus/Sonnet). Each task is independently
> shippable, dependency-ordered, ends with named gates. Repo rules: work on `main`,
> subject-line-only conventional commits, doc updates in the same commit as the code.

## Context

A performance audit (2026-06-12) plus a re-audit after the `(site)`-shell refactor (HEAD `aa268b4`,
2026-06-13) found: the client React/animation layer is excellent, but **all 32 routes render
dynamic** (verified via `next build` — every route `ƒ`), there are only 3 DB indexes repo-wide,
booking pages have request waterfalls, every list query is unbounded, three realtime subscriptions
silently never fire, and the gallery ships 46 MB of original camera files.

The maintainer's priority (their words): **navigation should feel like toggling a UI element, not
fetching a page** — nav/footer/sidebar load essentially instantly, the clicked tab selects
instantly (client feedback), and `loading.tsx` is the placeholder while the server request fills in.
This plan therefore has two outcomes:

- **Outcome 1 — Instant navigation & shell.** The chrome is static and persistent (paints instantly
  on cold loads, persists across soft nav); the clicked target highlights instantly AND the content area
  swaps to a loading placeholder on click (not waiting for `loading.tsx`, which the App Router won't
  re-show on soft sibling navigations); the server fill behind that placeholder is fast (indexes +
  parallelized queries + no per-nav dynamic shell auth).
- **Outcome 2 — Fast fills & first paint.** Indexes + parallelized queries + per-request dedupe make
  the placeholder→content swap quick; static/ISR public content + optimized images make cold loads
  fast for SEO/ad traffic.

### Locked decisions (maintainer)

1. **Shell strategy:** make the chrome static by resolving header auth **client-side** (stable, no
   experimental flags — honors the "no future foot-guns" constraint). Nav/footer/sidebar become
   fully static and instant; only the top-right auth control fills post-hydration into reserved
   space (no layout shift). PPR is the documented alternative (rejected here only because its
   `experimental` flag is an upgrade-risk the maintainer asked to avoid).
2. **Realtime:** enable where clean (profiles → instant onboarding), poll elsewhere, remove dead
   subscription code.
3. Lists: reuse the existing client-side pager (`src/lib/pagination.ts` + `src/components/ui/pagination.tsx`).
4. Gallery: re-encode, keep originals in a gitignored source folder; a sync script handles
   add/delete; documented as a repo skill.
5. Add `@vercel/speed-insights` for before/after field metrics.

### Verified ground truth (re-confirmed against HEAD `aa268b4`; re-verify only if code drifts)

- Single static blocker: `HeaderAuth` in src/components/site-header.tsx is an **async server component**
  (`createClient()` + `auth.getUser()` + profiles role query), rendered by the persistent shell
  `src/app/(site)/layout.tsx` → `PageShell`. It is already `<Suspense>`wrapped.
- `getAttentionCounts` is **already** `cache()`wrapped (src/features/admin/attention-counts-query.ts line ~69). `getUser` is **not** cached; it runs ~3×/admin load (middleware `getClaims` + header + page).
- Optimistic instant-select is **done for the sidebar** (src/components/layout/app-sidebar.tsx:55-67) but **missing for the top tabs** (src/components/site-nav.tsx:26-51, `SiteNavTabs`).
- `loading.tsx` exists for `(site)/(marketing|account|admin)`; **missing** for `(auth)` and `(onboarding)`. **No `error.tsx` anywhere.**
- Realtime publication is **empty** (zero `alter publication supabase_realtime` migrations) → subscriptions in `use-busy-ranges.ts`, `use-availability.ts`, and the new `use-premium-days.ts` never fire; all fall back to 60 s polls. RLS would also block cross-client booking events even if published.
- `use-premium-days.ts` adds a client `settings.select("holiday_dates")` fetch on every booking-page mount **plus** a dead settings subscription.
- Reviews auto-publish (`20260612120000_reviews_auto_publish.sql`); `submitReview` (src/features/reviews/reviews-action.ts) calls no `revalidatePath`.
- All list queries unbounded; `listClientsCore` (src/features/admin/clients-actions.ts) still fetches the entire `pets` and `bookings` tables (`select("client_id")`) to count in JS.
- Visual effects re-audit: **excellent** (compositor-only transforms, rAF-batched, passive listeners, reduced-motion honored, clean teardown). Only minor polish (see Task 12).
- No new deps from the refactor. Pre-commit gate: `npx lint-staged` + `npm run typecheck`. No CI.
- **OneDrive symlink quirk:** if `npm run build` prints `next: command not found`, run
  `node node_modules/next/dist/bin/next build` instead. Same for other bin tools.

### GATE (run after every task unless noted)

`npm run typecheck && npm run lint && npm run test` then a production build (`npm run build`, or the
node fallback above). Plus the per-task manual checks listed.

### Intentional behavior changes (approved via this plan)

1. On cold loads, the top-right auth control (account menu / Sign in) fills in just after hydration
   (reserved space, no layout shift). Nav/footer/sidebar are unaffected — they paint instantly.
2. Admin attention badges in the **mobile drawer** resolve client-side on admin routes; the desktop
   sidebar badges are unchanged (still server-rendered in the dynamic admin zone).
3. List caps: account bookings/inquiries newest 500; admin inquiries/reviews newest 1000. Client
   search/pager operate on that window; pager totals reflect the window.
4. Public pages (`/services`, `/reviews`, `/gallery`, `/about`, `/resources`, `/`) become static/ISR;
   admin content edits reflect via `revalidatePath`, 24 h time fallback otherwise.
5. Booking-approval email sends after the response (`after()`); reminder cron processes ≤100/run.
6. Onboarding approval reflects via profiles realtime (replaces the 15 s poll).

---

## PHASE A — Foundation: fast fills & correctness (no UX risk, do first)

### Task 0 — Plan handoff + Speed Insights

1. Copy this file to `docs/superpowers/plans/2026-06-13-performance-hardening.md`.
2. `npm install @vercel/speed-insights`.
3. In `src/app/layout.tsx`: render `<SpeedInsights />` (from `@vercel/speed-insights/next`) inside
   `<body>`, sibling of children.
   **Commit:** `feat: add speed insights field metrics` (plan file may be a separate `docs:` commit).

### Task 1 — Index migration

Create `supabase/migrations/<YYYYMMDDHHMM00>_performance_indexes.sql` (timestamp after the latest
migration). Exact DDL — query-shaped, not generic:

```sql
create index if not exists bookings_client_id_starts_at_idx on bookings (client_id, starts_at desc);
create index if not exists bookings_starts_at_idx on bookings (starts_at);
create index if not exists bookings_active_ends_at_idx on bookings (ends_at)
  where status in ('pending_approval', 'confirmed');
create index if not exists bookings_reminder_due_idx on bookings (starts_at)
  where status = 'confirmed' and reminder_sent_at is null;
create index if not exists bookings_service_id_idx on bookings (service_id);
create index if not exists pets_client_id_idx on pets (client_id);
create index if not exists payments_booking_id_idx on payments (booking_id);
create index if not exists form_responses_client_id_idx on form_responses (client_id);
create index if not exists inquiries_client_id_idx on inquiries (client_id);
create index if not exists client_debits_client_id_idx on client_debits (client_id);
create index if not exists reviews_status_created_idx on reviews (status, created_at desc);
create index if not exists profiles_role_created_idx on profiles (role, created_at desc);
```

Do **not** add a lone `bookings(status)` (useless 4-value btree) or `payments(client_id)` (no query
filters it). Apply locally (`supabase migration up` or `supabase db reset`). **Pushing to the hosted
project requires maintainer confirmation — stop and ask before `supabase db push`.Commit:** `perf: add indexes for hot query paths`

### Task 2 — Per-request `cache()` dedupe for auth

New `src/lib/supabase/server-cache.ts`:

```tsx
import "server-only";
import { cache } from "react";
import { createClient } from "./server";
export const getCachedUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return { user: data.user, error };
});
```

Swap direct `auth.getUser()` calls (keep all redirect/gate logic identical) in: `(site)/(account)/layout.tsx`,
`(site)/(admin)/layout.tsx`, every `(account)`/`(admin)` page that calls it (grep `auth.getUser()` under
`src/app/(site)`), and `src/lib/admin-session.ts` `getActorOrRedirect()`. Note: `getAttentionCounts`
is already `cache()`-wrapped — leave it. Do not wrap the `*Core` functions (they take per-call `deps`).
**Manual:** admin dashboard renders; badge counts equal dashboard counts.
**Commit:** `perf: dedupe per-request auth reads with react cache`

### Task 3 — Parallelize page waterfalls

Preserve gate order (auth → ownership → render); only reorder independent awaits. **Before editing each
file, confirm its current await list matches the shape below.**

- **`(site)/(account)/account/bookings/page.tsx`:** after `getCachedUser()`, run `repo.getSettings()` and
  the bookings query in one `Promise.all`.
- **`(site)/(account)/account/bookings/[id]/edit/page.tsx`:** stage 1 `getCachedUser()` (gate) →
  stage 2 `repo.getBookingForEdit(id)` (gate) → stage 3 `Promise.all([getSettings, serviceRow(slug), finalCents(id), loadBookingFormData(slug), pets(user.id)])` → stage 4 existing photo-signing `Promise.all`.
- **`(site)/(marketing)/book/[serviceSlug]/page.tsx`:** stage 1 `Promise.all([serviceRow(slug), loadBookingFormData(slug), getCachedUser()])` → profile gate → `Promise.all([pets+signing, myBookings])`
  in the signed-in branch. (Fold the premium-days server-seed from Task 8 here if doing both.)
  **Manual:** load each page signed-in (book also signed-out); identical render incl. pet photos and prefilled edit form.
  **Commit:** `perf: parallelize independent queries on booking pages`

### Task 4 — List caps + clients aggregation

**4a. Caps** (keep existing client-side filter + `paginate()`; add a one-line comment at each: "window =
newest N; search/pager operate on the window"):

- `(site)/(account)/account/bookings/page.tsx` → `.limit(500)` (already ordered `starts_at desc`).
- `(site)/(account)/account/inquiries/page.tsx` → `.limit(500)`.
- `listInquiriesCore` (src/features/inquiries/inquiry-actions.ts) → `.limit(1000)`.
- `listReviewsCore` (src/features/admin/reviews-actions.ts) → `.limit(1000)`.

**4b. `listClientsCore`** (src/features/admin/clients-actions.ts) — replace the whole-table `pets`/`bookings`
scans with PostgREST embedded aggregates (no DDL):

```tsx
serviceClient
  .from("profiles")
  .select(
    "id, full_name, email, phone, onboarding_status, created_at, pets(count), bookings(count), client_debits(cents, settled_at)",
  )
  .eq("role", "client")
  .order("created_at", { ascending: false });
```

Sum unsettled debits in JS from the embedded rows; keep the meet-greet query as-is; preserve the
`ClientListRow` output shape exactly. If embedded `count` syntax misbehaves in dev, fall back to a
`client_overview` view — and that migration MUST `revoke all on client_overview from anon, authenticated;`
(Supabase auto-grants new public-schema relations; an owner-rights view would leak client PII via PostgREST).
**Manual:** `/admin/clients` shows identical counts/debt badges (compare on `npm run db:seed` data).
**Commit:** `perf: cap list queries and aggregate client counts in postgres`

---

## PHASE B — Instant navigation & static shell

### Task 5 — Instant selection + instant content placeholder + error coverage (Outcome 1 core)

**Root cause of the "sidebar nav lags, can't tell if loading happens" symptom (confirmed in prod, verified
by inspection):** it is NOT dev-prefetch and NOT sidebar-specific. The App Router **keeps the previous page
visible during a navigation transition** and only reliably shows `loading.tsx` on _first entry_ to a zone —
not on soft sibling navigations within an already-mounted boundary (there is no `template.tsx`, and nav is
pure native `<Link>` with no pending hook). So the perceived delay equals the destination's server time.
Marketing's light pages (`about`/`resources` do 0 server fetches) feel instant; every account page does
auth + heavy **unindexed** queries, so the hold is long with no feedback. The sidebar isn't special — its
destinations are just always heavy. **Therefore the fix is two-pronged: (i) acknowledge the click instantly
in the content area, and (ii) shrink the actual server wait (Phase A indexes/parallelize/cache + Task 6
removing the per-nav dynamic shell auth).** This task does (i); Phase A/Task 6 do (ii).

1. **Optimistic top tabs:** port the sidebar's pattern to `SiteNavTabs` (src/components/site-nav.tsx:26-51).
   `pendingHref` state set in a primary-click handler (skip modified/non-primary clicks, mirror
   app-sidebar.tsx:55-67), cleared via the render-time `lastPathname` pattern,
   `activeHref = pendingHref ?? committedHref`. Reuse `is-active-nav`.
2. **Instant content-area placeholder (the core fix for the lag):** the content region must swap to a
   loading placeholder the instant a nav starts, NOT wait for `loading.tsx` (which won't re-show on sibling
   nav). Mechanism — keep native `<Link>` (preserves prefetch, a11y, open-in-new-tab) and bridge its
   in-flight status to a shared pending state: - New client `src/components/layout/nav-pending.tsx`: a `NavPendingProvider` + `useNavPending()` context,
   and a `<LinkPendingBridge>` (a tiny child rendered inside each nav `<Link>`) that calls Next 16's
   **`useLinkStatus()`** (`import { useLinkStatus } from "next/link"`) and writes that link's `pending`
   into the context. - A `<ContentArea>` client wrapper around `{children}` in `AppShell`'s `<main>` (and the marketing
   layout's `<main>`): when `useNavPending()` is pending, render the zone skeleton overlay on top of the
   stale content; otherwise render `{children}`. This makes the placeholder appear on click for every soft
   navigation, heavy or light. - Net effect: click → tab highlights instantly (item 1) → content shows the skeleton instantly (this
   item) → server resolves → real content replaces the skeleton. `loading.tsx` still covers first-entry
   and hard loads.
3. **Prefetch:** confirm sidebar + `SiteNavTabs` + `SiteNavMobile` `<Link>`s have no `prefetch={false}`;
   confirm all internal nav uses `<Link>`, not `<a>`.
4. **Loading coverage:** add `src/app/(auth)/loading.tsx` and `src/app/(onboarding)/loading.tsx`
   (mirror the `(site)` zone loaders).
5. **Loader shape (perceptibility):** make the zone `loading.tsx` (and the matching `<ContentArea>` overlay
   skeleton) content-shaped using `Skeleton` — e.g. account = title + card rows; admin = table rows — not a
   bare spinner, so the transition is unmistakable. Keep `min-h-[75vh]` so it can't collapse. Reuse one
   skeleton component for both the `loading.tsx` and the overlay per zone (DRY).
6. **Error boundary:** add `src/app/error.tsx` (`"use client"`), styled like `src/app/not-found.tsx`;
   generic message + "Try again" `reset()`; `console.error(error)`; no detail leaked.
   **Manual (production build):** in `/account`, click between sidebar tabs → highlight instant AND a skeleton
   appears in the content area immediately, then real content lands; repeat several times (not just first
   entry) to confirm the placeholder shows every time; same for marketing tabs; throw in a page → error
   boundary renders; `aria-current` intact, reduced-motion respected. **Re-verify after Phase A + Task 6:** the
   real wait behind the placeholder should be markedly shorter.
   **Commit:** `feat: instant tab selection and content loading placeholder`

### Task 6 — Client-resolve header auth → static shell (prerequisite for Task 7)

Goal: the persistent shell reads no cookies, so chrome is static/instant and public pages can prerender.

1. New client component `src/components/header-auth-client.tsx` (`"use client"`): browser client
   (src/lib/supabase/client.ts); resolve via `getSession()` + `onAuthStateChange` (NOT `getClaims`/`getUser` —
   `getSession` is the local cookie read; `getClaims` can hit the network on HS256 projects). Resolve in
   `useEffect` only (never read cookies during render — initial client render must equal the server
   placeholder). When signed in: one browser `profiles.select("role").eq("id", session.user.id).single()`
   → `isAdmin`. Render existing `AccountMenu` / `SignInLink` with their current boolean props. Until
   resolved: fixed-width invisible placeholder (no CLS, no wrong-state flash).
2. In src/components/site-header.tsx: replace the server `HeaderAuth` with `<HeaderAuthClient />`; delete the
   `@/lib/supabase/server` import from any module that becomes client-side. Mobile-drawer admin badges:
   when the client header resolves `role==="admin"`, fetch counts via a server action wrapping the
   existing `getAttentionCounts` and pass to `SiteNavMobile`; desktop sidebar badges
   (app-shell.tsx `SidebarWithBadges`) stay server-rendered in the dynamic admin zone — unchanged.
3. Account/admin **layouts keep their server-side auth gates/redirects** (security unaffected); only the
   header's _display_ is client-resolved.
   **Manual (dev):** signed-out — marketing shows Sign in, no hydration warnings; client — account menu
   appears post-hydration on `/`, works on `/account`; admin — tint + desktop sidebar badges intact on
   `/admin`, mobile drawer badges resolve; `/login` → `/onboarding` → `/account` redirect chain intact;
   nav/footer paint instantly before auth resolves.
   **Commit:** `refactor: resolve header auth client-side for a static shell`

### Task 7 — Static/ISR public content + revalidation + matcher (depends on Task 6)

1. **Cookie-free client** `src/lib/supabase/static.ts`: `createClient` from `@supabase/supabase-js` with
   `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (match
   src/lib/supabase/client.ts env names), `auth: { persistSession: false, autoRefreshToken: false }`. RLS
   (anon) already allows reading active services + published reviews.
2. **Convert pages** under `src/app/(site)/(marketing)/`:
   - `services/page.tsx`, `reviews/page.tsx`: use `createStaticClient()`; add `export const revalidate = 86400`.
     For `reviews`, move the auth-gated "leave a review" control into the client form (`review-form.tsx`),
     resolving auth browser-side (reuse the Task 6 session pattern) instead of server `getUser()`.
   - `gallery/page.tsx`: **fully static — do NOT add `revalidate`.** `getGalleryImages()` reads the
     filesystem; on Vercel `public/` is not traced into the function and the reader swallows errors to `[]`,
     so an ISR regen would cache an empty gallery. Build-time-only is correct (images change on deploy).
   - `/`, `/about`, `/resources`: no change needed — they become static once the shell (Task 6) stops
     reading cookies. `contact` and `book/[serviceSlug]` stay dynamic (prefill / searchParams).
3. **Revalidate wiring** (add to existing success branches): `updateService` → `revalidatePath("/services")`;
   `moderateReview` → `revalidatePath("/reviews")`; `submitReview` → `revalidatePath("/reviews")` on `ok:true`
   (**required** — reviews auto-publish and the form says "your review is live").
4. **Narrow the proxy matcher** in src/proxy.ts to exactly:
   `["/account/:path*", "/admin/:path*", "/onboarding", "/login", "/signup", "/auth/:path*", "/book/:path*", "/contact"]`.
   `/book/*` and `/contact` **must stay** (they read auth via the cookie-bound server client whose `setAll`
   is a no-op in RSC — without middleware, expired-token visits lose rotated refresh tokens → spurious logout).
   **Manual / core verification:** `npm run build` route table shows `○` for `/`, `/about`, `/resources`,
   `/services`, `/reviews`, `/gallery`, `/_not-found`; `ƒ` for the rest. Prerendered `/services` HTML under
   `.next/` contains real service names (guards against build-time empty static). Edit a service in admin →
   `/services` updates next load; submit/moderate a review → `/reviews` updates; booking flow works signed-out
   and signed-in. **Build now needs valid env vars** (`.env.local` locally; Vercel envs at deploy).
   **Commit:** `perf: render public pages static with on-demand revalidation`

---

## PHASE C — Assets, realtime, effects, docs

### Task 8 — Premium-days server-seed + realtime cleanup

1. Migration `<timestamp>_realtime_profiles.sql`: `alter publication supabase_realtime add table profiles;`
   (self-read RLS already exists). **Hosted push needs maintainer confirmation.**
2. Onboarding: in `src/app/(site)/(onboarding)/onboarding/_components/meet-greet-step.tsx`, replace the 15 s
   `RefreshOnInterval` with a `postgres_changes` UPDATE subscription on `profiles` filtered
   `id=eq.<userId>` → `router.refresh()`, plus a 60 s fallback; clean up channel on unmount. `/onboarding`
   stays in the matcher so the middleware approval→`/account` redirect still fires.
3. `use-premium-days.ts`: seed from a server-provided `initialPremiumDays` prop (mirror the `initialBusy`
   pattern in `use-busy-ranges.ts`) — the booking pages already load settings server-side; pass
   `holiday_dates` down. **Remove the dead settings subscription** (holidays don't change mid-session).
4. `use-busy-ranges.ts` / `use-availability.ts`: keep the 60 s polls; add a comment that realtime delivery
   needs both publication membership and RLS-visible rows, so polling is the working mechanism. Do **not**
   add a status filter (UPDATE filters match the new row → cancellations would be missed).
   **Manual (two browsers):** flip `profiles.onboarding_status` to `approved` → onboarding tab redirects in ~1 s.
   Booking calendars still show premium days (now without a client round trip).
   **Commit:** `perf: profile realtime for onboarding and server-seed premium days`

### Task 9 — Deferred email + cron hardening

1. `approveBooking` (src/features/admin/approval-actions.ts): wrap the best-effort confirmation-email block in
   `after(async () => { … })` from `next/server` (keep `revalidatePath` and the returned result outside
   `after`). Do not defer booking-creation email (its result is consumed) or cron sends.
2. `src/app/api/cron/reminders/route.ts`: `export const maxDuration = 60;`
3. `runReminderCron` (src/features/notifications/reminder-cron.ts): add `.limit(100)` with a comment (idempotent via
   `reminder_sent_at`; daily run drains backlog).
   **Manual:** approve a seeded booking — UI responds without waiting on email; log confirms send attempt.
   **Commit:** `perf: defer approval email and bound reminder cron`

### Task 10 — Gallery pipeline + image config

1. Source folders `gallery-originals/` and `bg-originals/` at repo root, **gitignored**; seed by copying
   current `public/gallery/*` and `public/bg/*.JPG` before first run.
2. Script `scripts/gallery-sync/index.ts` (+ `sharp` devDep), npm script `"gallery:sync": "tsx scripts/gallery-sync/index.ts"`:
   resize to ≤1600 px long edge (no upscaling), JPEG q≈80 (`mozjpeg: true`), strip EXIF (sharp default);
   **gallery outputs get content-hashed names** (`IMG_0592.<hash>.jpg`) so swaps bust caches; bg outputs keep
   stable basenames. Sync semantics: output without a source → delete; unchanged hash → skip; new/changed →
   process; print add/remove/skip summary; idempotent. Also emit `src/content/image-placeholders.json`
   (`{ "<output filename>": "<~16px base64 blur>" }`, tracked). Run once; commit re-encoded outputs + remove
   the originals from `public/`. Confirm src/features/gallery/gallery-images.ts still globs correctly (hashed
   names fine; adjust alt derivation if it parses filenames).
3. Blur placeholders: `MarketingHero` (src/components/marketing/marketing-hero.tsx) accepts optional
   `blurDataURL` → `placeholder="blur"`; pages pass it from the JSON keyed by bg filename. Gallery grid
   (src/app/(site)/(marketing)/gallery/\_components/gallery-grid.tsx/(marketing)/gallery/\_components/gallery-grid.tsx)) likewise via `getGalleryImages()`.
4. next.config.ts `images`: `formats: ["image/avif", "image/webp"]`, `qualities: [68, 70, 75]`,
   `minimumCacheTTL: 2678400`. Grep `picsum.photos`; if unused, drop the `remotePatterns` entry.
5. Skill + docs (same commit): `.claude/skills/gallery-sync/SKILL.md` (mirror the `copy-sync` skill format);
   `docs/FRONTEND.md` "Image pipeline" subsection (originals folders, sync script, placeholder JSON,
   next/image conventions, "never commit raw camera files to public/").
   **Manual:** gallery + hero render with blur-up; `npm run gallery:sync` twice → second run all skips;
   `public/gallery` < 8 MB.
   **Commit:** `feat: gallery image pipeline with blur placeholders and avif`

### Task 11 — Visual-effects polish (minor; audit rated effects excellent)

- `src/components/effects/cursor-ring.tsx`: the `transitionrun`/`transitionend` handlers call
  `scheduleRebuild` repeatedly during a dropdown's fade. Gate so geometry rebuilds once at transition
  start, not per fired event.
- `src/components/ui/back-to-top.tsx`: rAF-throttle the `scroll` handler (guard a pending frame) instead
  of `setState` per scroll event.
- `src/components/effects/reveal.tsx` (optional, only if a page has >50 reveals): share one
  IntersectionObserver via a module-level pool instead of one per element.
  **Manual:** open/close the account dropdown — no glow stutter; scroll long pages — back-to-top toggles
  cleanly; reduced-motion still honored.
  **Commit:** `perf: smooth cursor-ring and back-to-top under rapid events`

### Task 12 — Bake principles into docs

1. `docs/ENGINEERING.md` — new "Performance discipline" item under Code quality: public routes render
   static unless they provably need request data (verify via the `next build` route table — public = `○`);
   mutations that change public-page data call `revalidatePath`; new query predicates get index coverage in
   the same migration; list queries are bounded; best-effort side effects use `after()`; shared
   layout/page reads use React `cache()`.
2. `docs/FRONTEND.md` — "Instant navigation" note: persistent static shell; optimistic active-state on nav
   (`pendingHref` pattern, link to `app-sidebar.tsx`); `loading.tsx` as the fill placeholder; default
   `<Link>` prefetch; compositor-only animations + `prefers-reduced-motion` for all effects.
3. `AGENTS.md` — one constitution line: "**Performance floor** — public routes stay static; bounded
   queries; indexes for new predicates; instant-nav shell (see ENGINEERING/FRONTEND)."
4. Refresh `_Last reviewed:_` footers on touched docs.
   **Commit:** `docs: add performance and instant-navigation principles`

---

## End-to-end verification (after all tasks)

1. `npm run typecheck && npm run lint && npm run test && npm run build` — all green.
2. Build route table: `○` for `/`, `/about`, `/services`, `/reviews`, `/gallery`, `/resources`, `/_not-found`;
   everything else `ƒ`. **This is the core check for Outcome 2.**
3. Prerendered `/services` + `/reviews` HTML contains real DB content.
4. Instant-nav (Outcome 1): cold-load a marketing page → nav/footer paint immediately; click a tab →
   instant highlight + loader + content; soft-nav between account pages → sidebar persists, tab selects
   instantly, only main swaps.
5. Auth matrix (dev): signed-out browse+book; client account flows; admin dashboard/badges/approve;
   onboarding realtime redirect.
6. `/admin/clients` counts identical pre/post Task 4 on seeded data.
7. Post-deploy: Speed Insights — public-page TTFB collapses; compare a week of field LCP/INP/TTFB to baseline.

## Sequencing & gated moments

Phase A (Tasks 0–4) first — independent, no UX risk. Phase B in order (Task 6 precedes 7). Phase C any order.
One commit per task, subject-line only, on `main`. **Maintainer-gated:** hosted Supabase migration pushes
(Tasks 1, 8) and the first deploy after Task 7 (confirm Vercel env vars exist so the static build can query).

## Deferred notes (misc; not in scope)

- `NumberStepper` fires `onChange` per keystroke → quote-preview churn; commit on blur/step.
- `Scheduler` effect depends on an unstable `onSelectionChange` prop; wrap the caller's handler in `useCallback`.
- PPR (`experimental.ppr`) — the alternative to Task 6 if the post-hydration auth-control fill is ever
  unacceptable; revisit when it leaves experimental.
- `experimental.optimizePackageImports` for supabase-js/date-fns — marginal; bundle is already lean.
- Cursor-effect JS is in every `(site)` page's first-load bundle; dynamic-import after first paint only if a
  first-load JS budget is set.
- `favicon.ico` 15 KB → reuse the existing `public/brand/favicon.svg` (819 B).
- Busy-ranges public realtime is structurally blocked by RLS; if live slot-freeing ever matters, use
  Realtime Broadcast or an anon-readable events table, not `postgres_changes` on `bookings`.
