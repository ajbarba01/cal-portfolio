# Design Overhaul — Intermediate: Shell Unification + Interaction Language (Spec)

> Status: **approved-direction, pending spec review** · 2026-06-05
> Umbrella roadmap: `~/.claude/plans/ok-sure-lets-try-splendid-plum.md` (5-phase, foundation-first).
> Inserted **between Phase 1 and Phase 2**. Builds on Phase 0 (Trail tokens, Fraunces/Public Sans,
> `space.*`/`measure`/`typeScale`/`--brand*`) and Phase 1
> (`2026-06-04-design-overhaul-phase1-chrome-design.md`: `PageContainer`/`PageHeader`, single-row
> marketing header, `AppShell` sidebar, feedback + component kit). This phase **revises** the Phase-1
> shell — it is not page-internal redesign (still Phases 2–4) and does not touch Scheduler Layers 1–2.

## Context & goal

Phase 1 shipped two divergent shells: marketing = single-row top-tab header; account/admin =
`AppShell` left sidebar with its **own** slim top bar. Maintainer (Alex) wants three things, which
together make this a shell revision rather than a polish pass:

1. **One nav model, visibly constant.** The marketing header must appear on **every** page, account
   and admin included — not a different shell per zone. The account/admin **sidebar stays**, but as a
   second layer _below_ the one global header (not behind a separate slim bar).
2. **A document-like "sheet on a desk" layout (SEP-inspired).** Every route is one centered white
   **sheet**; the page is effectively "resized horizontally" and the leftover side space becomes a
   warm accent **desk**. Header, sidebar, content, and footer all live inside the sheet width.
3. **A consistent, responsive interaction language.** Every interactive element shows a clear,
   dynamic hover/active state. This becomes the documented standard for all future phases.

Plus a short list of folded-in Phase-1 carry-forward fixes and a deferred a11y verification debt.

This is presentational/structural only: TS strict, no `any`, two-layer tokens (components reference
semantic roles only), `space.*`-only whitespace, a11y floor, mobile-first authored.

## Out of scope

- Page-internal body redesign for marketing (Phase 2), account/booking (Phase 3), admin (Phase 4).
- Scheduler Layers 1–2 (untouched); Layer-3 restyle stays Phase 3.
- Deep auth-form polish (onboarding/login/signup get shell adoption only — see §F).
- Input humanization (cents/minutes/lat-lng/jsonb) — Phase 4.
- `account-menu.tsx` server-component refactor — **deferred** (bundle-only, not UI-affecting).

## Locked decisions (from this brainstorm + visual companion)

- **#3 layout = "sheet on a desk", hairline edges, no vertical margin** (companion `sep-gutters-v3`):
  accent desk fills the viewport; one centered white sheet runs full height with hairline left/right
  borders only; **everything** (header, sidebar, content, footer) is inside the sheet width. At phone
  width the sheet goes full-bleed (desk gutters collapse).
- **#2 nav = global header everywhere + keep sidebar.** Marketing `SiteHeader` renders on all zones;
  `AppShell`'s own slim top bar is removed; sidebar persists below the global header for account/admin
  section nav.
- **Wordmark = the admin affordance.** Admin user → wordmark renders clay-tinted, gains the underline
  hover, links to `/admin`. Non-admin → near-black, links home, no underline. The separate "Admin"
  header link is **removed**.
- **Account/profile + Sign-in header links** adopt the tab underline treatment.
- **Interaction language** (companion `interaction-language`): top-bar links = underline grow;
  sidebar items = rect (clay-soft active fill, neutral rect hover); buttons = **deepen**
  (clay-fill → clay-strong) on hover + 1px press on `:active`.
- **Mobile = one merged drawer** (professional one-entry-point pattern): a single hamburger, flush to
  the right edge, opens a drawer that lists zone sections first (when in account/admin), then the
  marketing links + account/sign-out. `AppShell`'s separate mobile drawer is removed.
- **`--canvas` semantic token** for the desk: light = `--sand-100`, dark = `--sand-950`, mirrored in
  `.dark`. Components paint the desk with `bg-canvas`, never a raw sand value.
- **Folded-in cleanups:** PageHeader `<h1>` leading → `typeScale.h1.leading` (1.1); `FormField`
  children-XOR-inputProps; `data-slot` on `ConfirmDialog` popup + `Toast.Root`.

## Design

### A. The shell: desk + sheet primitive

A new layout primitive (working name `PageShell`) owns the desk + sheet structure and is composed once
per zone layout. Structure (light values shown; dark mirrors via tokens):

```
<div bg-canvas>                       ← the desk: fills viewport, accent gutters
  <div mx-auto max-w-[sheet] bg-card  ← the sheet: centered, full min-h-dvh,
       border-x border-border>           hairline left/right borders
    <SiteHeader/>                      ← global header (inside the sheet)
    <zone body>                        ← marketing main | sidebar+content | auth
    <SiteFooter/>                      ← footer (inside the sheet)
  </div>
</div>
```

- **Sheet width** is a single new width step (e.g. `--sheet` ≈ the current `max-w-5xl` band, tuned in
  build). `PageContainer` `width="read"|"app"` continues to govern the **inner content column** inside
  the sheet (marketing ≈ 65ch reading measure; account/admin wider for tables). The sheet is the outer
  bound; `PageContainer` is the inner bound.
- **Full height, no vertical margin:** sheet is `min-h-dvh`; desk shows only in the horizontal gutters.
- **Mobile (`< sm`):** sheet is full-bleed (`max-w-none`, no border-x); desk not visible. The hamburger
  sits flush to the right edge within the header's normal horizontal padding (no extra margin).
- **Dark mode:** sheet = `--card` (sand-925), desk = `--canvas` (sand-950, a touch darker) → sheet reads
  as slightly lifted, the inverse-but-equivalent of the light relationship.

`PageShell` replaces the per-zone outer wrappers in all three layouts
(`(marketing)/layout.tsx`, `(account)/layout.tsx`, `(admin)/layout.tsx`).

### B. Global header on every zone

`SiteHeader` becomes the single global header, rendered inside `PageShell` for all zones:

- Grid stays `1fr_auto_1fr`: wordmark (left) · centered marketing tabs · account cluster (right).
- **Wordmark** takes an `isAdmin` signal: admin → `text-brand-strong` + underline-hover + `href="/admin"`;
  else → `text-foreground`, no underline, `href="/"`.
- **Account cluster** drops the standalone "Admin" link. Signed-in → account/profile link with the
  underline treatment (+ existing `AccountMenu` dropdown behavior preserved); signed-out → "Sign in"
  with the underline treatment.
- `AppShell` is reduced to **sidebar + content only** (its slim top bar and its own mobile drawer are
  removed; the global header + merged drawer own those responsibilities). The sidebar's "Back to site"
  affordance is redundant with the now-global wordmark/tabs and is removed.
- Identity + sign-out stay in the **sidebar footer** for account/admin (unchanged from Phase 1).

### C. Interaction language (documented standard — FRONTEND.md)

A small, named set of interaction primitives, all token-driven, all motion within existing
`motion.*` tokens, all respecting `prefers-reduced-motion`:

- **`nav-underline`** — top-bar links (marketing tabs, account/profile, admin wordmark). Underline
  grows from center on hover (`scale-x` 0→1), persists when active; active also `text-brand-strong`
  - semibold. (Already on tabs in `site-nav.tsx`; extend to account/profile/wordmark.)
- **`nav-rect`** — sidebar items. Active = clay-soft fill (`--accent` is sand; introduce the active
  fill as a clay-soft tint role) + `text-brand-strong` + semibold; hover (inactive) = neutral rect
  (`bg-muted`/sand-200). Replaces Phase 1's `bg-accent` active.
- **Button hover = deepen.** The `brand` variant deepens `--brand` → `--brand-strong` on hover; the
  default/primary variants get the analogous one-step deepen. All buttons press 1px on `:active`.

Verify AA contrast on every hover/active pairing in light **and** dark.

### D. The `--canvas` token + sidebar active-fill role

- `globals.css`: add `--canvas` to the semantic layer (`:root` → `--sand-100`; `.dark` → `--sand-950`)
  and expose `--color-canvas` in `@theme inline`. List the role in `SEMANTIC_COLORS`
  (`src/lib/design-tokens.ts`).
- Sidebar active rect needs a clay-soft fill role distinct from `--accent` (which stays sand). Add a
  semantic role mapped to `--clay-soft` (light) with a dark mirror, referenced only by `nav-rect`.

### E. Folded-in cleanups

- **PageHeader** `<h1>`: `leading-tight` → the `typeScale.h1.leading` (1.1) value, sourced from the
  token, not a Tailwind literal.
- **FormField**: overload the type so `children` (custom control) and `inputProps`
  (`placeholder`/`type`/…) are mutually exclusive (XOR) — props can no longer be silently dropped.
- **`data-slot`**: add to `ConfirmDialog` popup + `Toast.Root` to match every other kit primitive.

### F. Auth pages — shell adoption only

These pages hardcode `max-w-lg` etc. and must inherit the shell, **without** deeper form restyle
(that stays Phase 3). Two route groups, two fixes:

- **`(auth)/login`, `(auth)/signup`** — the `(auth)` group has **no layout** today, so these render
  bare under the root layout. Add `(auth)/layout.tsx` rendering `PageShell` + the global `SiteHeader`
  (marketing-style: wordmark + tabs + "Sign in" cluster, since the user is logged out) + sheet +
  footer — but **no sidebar / no zone section nav** (pre-auth). Page bodies drop their hardcoded
  widths and compose `PageContainer width="read"`.
- **`(account)/onboarding`** — already inside the `(account)` group, so it inherits that zone's updated
  `PageShell` + global header + sidebar automatically once `(account)/layout.tsx` is updated. Just
  remove its hardcoded `max-w-lg` and compose `PageContainer`. (Whether onboarding should _suppress_
  the account sidebar during first-run is a Phase-3 form-flow decision, not this phase's.)

### G. Mobile merged drawer

One `Drawer` (triggered by the single header hamburger, flush right):

- In account/admin: **zone sections first** (the sidebar's items, with `nav-rect` active state),
  a divider, then marketing links + account/sign-out.
- In marketing: marketing links + account/sign-out (today's content).
- Built with the Phase-1 base-ui `Drawer` + the `key={pathname}` remount auto-close pattern (repo
  eslint bans `set-state-in-effect`). Focus-trap + Esc verified.

## Components touched (no new domains)

`globals.css`, `src/lib/design-tokens.ts` (tokens) · new `layout/page-shell.tsx` · `site-header.tsx` ·
`site-nav.tsx` · `layout/app-shell.tsx` (reduce to sidebar+content) · `layout/app-sidebar.tsx`
(`nav-rect`) · the three zone `layout.tsx` + auth pages · `feedback/form-field.tsx`,
`feedback/confirm-dialog.tsx`, `feedback/toast.tsx` · `ui/button.tsx` (deepen) ·
`layout/page-header.tsx` · FRONTEND.md (+ DESIGN.md if brand-facing).

## Verification

- **Automated gate:** `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` all green
  (strict, no `any`); existing tests stay green, add tests only where new pure logic appears.
- **Token-swap proof:** flipping `--canvas` re-colors every desk with zero component edits.
- **Live 390px + keyboard a11y walk (gates completion — the deferred Phase-1 debt, now owed here):**
  every touched route on a 390px viewport **and** desktop, light **and** dark. Confirm: focus-trap +
  Esc on the merged drawer and `ConfirmDialog`; visible focus on all `nav-underline`/`nav-rect`/button
  states; `aria-current` on active nav; hamburger flush-right with no excess margin; sheet full-bleed
  on mobile; no horizontal scroll. No "done" claim before this passes.

## Doc updates (same-commit rule)

- **FRONTEND.md** — revise the Phase-1 "Shared chrome + component kit" section: global-header-everywhere
  nav model, desk+sheet (`PageShell` + `--canvas`), and the **interaction language** (`nav-underline` /
  `nav-rect` / button-deepen) as the standing standard.
- **DESIGN.md** — note the desk/sheet brand layout + `--canvas` if brand-facing.
- Update memory `design-overhaul-roadmap.md` after merge.
