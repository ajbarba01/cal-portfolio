# Design Overhaul — Phase 1: Shared Chrome + Core Components (Spec)

> Status: **approved-direction, pending spec review** · 2026-06-04
> Umbrella roadmap: `~/.claude/plans/ok-sure-lets-try-splendid-plum.md` (5-phase, foundation-first).
> Builds on **Phase 0** (`2026-06-04-design-overhaul-phase0-tokens-design.md`): the Trail palette,
> Fraunces/Public Sans, and the `space.*` / `measure` / `typeScale` / `--brand*` tokens are already in
> place on local `main`. This spec covers **Phase 1 only**: the shared shells + the core component kit
> every later phase composes. Enforces Site-wide Standards **1, 3, 4, 5** (+ 7, 8 cross-cutting).

## Context & goal

The site is a functional wireframe with **no shared chrome**: 6 container widths + 4 padding rhythms +
3 `h1` sizes across 21 pages; the marketing header is a 7-link `flex-wrap` with no mobile drawer; the
account section nav is **copy-pasted 4× as raw `<a href>`** (full reloads); the admin index is a
**dead-end link list** with no persistent nav; feedback is ≥3 ad-hoc patterns including raw dev
screens (`Failed to load X: {message}`, `Access denied.`). Phase 0 gave us the token vocabulary; this
phase spends it — building the **shell primitives, navigation, feedback system, and core components**
so Phases 2–4 only compose, never re-invent.

**Mobile-first is an authored intent, not a fallback.** Every shell and component in this phase is
authored at phone width first and enhanced up; the mobile experience uses purpose-built adaptive
patterns (off-canvas drawers, stacked-card tables, bottom-sheet dialogs, bottom-anchored toasts) so
the result reads as _designed for the phone_, not a desktop layout squeezed down.

**Out of scope: page-internal redesign.** Phase 1 builds the shells + kit and wraps existing pages in
them (container/header/error-state swaps), but does **not** restyle the body of marketing, account, or
admin pages — that is Phases 2–4. Scheduler Layers 1–2 are never touched.

## Locked decisions (from the Phase 1 brainstorm + visual companion)

- **Shell model:** marketing keeps a top-tab header; **account + admin get a persistent left sidebar**
  (the in-app section nav), each with a slim top bar. (Visual companion option A.)
- **Marketing header:** **two-tier centered** — wordmark centered on top, centered tab row below.
  (Option B; the strongest "SEP centered" read Cal likes.)
- **Component scope:** build the kit **minus speculative pickers** — defer time picker + date picker to
  Phase 4 (settings is their real consumer).
- **Feedback taxonomy** (below) with **toast design v2**: white card, tinted icon chip, × dismiss,
  success progress line, auto-themes to warm-dark.
- **Sign-out lives in the sidebar footer** for in-app zones (not duplicated in the top bar); the
  marketing `AccountMenu` keeps its own dropdown.
- **No theme-toggle UI** this phase (dark mode follows OS; YAGNI).

---

## 1. Shell primitives — one structural system (Standard 1)

Two components are the **sole source** of width, horizontal padding, and heading rhythm. After this
phase, no page sets `max-w-*` / `px-*` / ad-hoc `h1` sizes.

- **`PageContainer`** (`src/components/layout/page-container.tsx`)
  - Owns horizontal padding (`space.pageX`) + max-width + horizontal centering.
  - Prop `width: "read" | "app"` (default `"read"`): `read` = the `measure` reading column (~65ch,
    marketing long-form); `app` = a wider max (account/admin tables + scheduler). One constant per
    width, defined here.
  - Renders a semantic wrapper; composes with `PageHeader` + content.
- **`PageHeader`** (`src/components/layout/page-header.tsx`)
  - Slots: `title` (required), `subtitle` (optional), `actions` (optional, right-aligned on desktop,
    **wraps below the title on mobile**).
  - Pulls the `typeScale` h1 step for the title and `space` for top/bottom rhythm. Renders a real
    `<h1>` (Fraunces via the Phase 0 base rule).
- Both reference **only** `space.*` / `measure` / `typeScale` — zero arbitrary spacing/size values.
- **Mobile:** `space.pageX` is already responsive (`px-5 sm:px-8`); `PageHeader` action row stacks
  under the title at base width and moves inline at `sm:`.

## 2. Navigation — three shells, one model (Standards 3, 4)

### Marketing header (`SiteHeader`, refactored)

- **Two-tier, centered.** Top tier: centered Fraunces wordmark (`Link` → `/`), with the
  account cluster in a right-aligned slot — **Sign in** (guest) / `AccountMenu` (signed in) + an
  **Admin** link when `role==='admin'`. Bottom tier: the 7-tab nav row, centered, with an
  **active-state** clay underline on the current route.
- Stays a server component (re-derives session + role per render, as today). Active-state needs the
  current pathname → the tab row is a small **client** subcomponent (`usePathname`) mounted inside the
  server header; identity/role stay server-derived.
- **Mobile (authored first):** below `md`, the tab row collapses into a **drawer** (base-ui `drawer`):
  a hamburger in the top tier opens a full-height off-canvas panel with **large tap rows (≥44px)**,
  active row marked with a clay left-border, scrim dismiss, focus-trapped, body-scroll-locked. The
  centered wordmark stays in the bar.

### Account + admin sidebar shell

- **`AppShell`** (`src/components/layout/app-shell.tsx`) — a client shell rendered by the `(account)`
  and `(admin)` layouts, parameterized by a **nav config** (zone label + section list) passed from
  each layout. Composition: slim top bar + sidebar/drawer + `<main>` (wraps children; pages choose
  `PageContainer width="app"`).
- **Sidebar (desktop, ≥`md`):** persistent left column —
  - **Back to site** affordance at top (`Link` → `/`).
  - Zone-scoped **section nav** with **active-state** (clay tint + weight on the current route, via
    `usePathname`). Account sections: Profile / Pets / Forms / Bookings. Admin sections: Availability /
    Bookings / Services / Settings / Reviews / Clients.
  - **Footer:** identity line (name · role) + **Sign out** (the sign-out handler currently in
    `AccountMenu`, lifted to a shared client action).
- **Mobile (authored first, below `md`):** the sidebar is an **off-canvas drawer** (base-ui `drawer`)
  opened from a hamburger in the slim top bar — scrim, focus-trap, body-scroll-lock, swipe/tap-to-
  dismiss, auto-close on route change. Section rows are ≥44px tap targets.
- **Slim top bar (both zones):** wordmark (→ `/`) + the mobile hamburger. No sign-out here (lives in
  the sidebar footer) — single source, no duplication.
- The admin index page (`/admin`) stops being a dead-end link list; `/admin` redirects to the first
  admin section (Availability), since the sidebar now is the dashboard nav.

### Link hygiene (Standard 4)

- **Every internal `<a href>` → `next/link` `<Link>`.** Sweep the account pages (the 4× copy-pasted
  nav vanishes into the sidebar), resources internal links, and any other in-app `<a>`. External links
  stay `<a>` with `rel`/`target` as appropriate.

## 3. Feedback system — one taxonomy (Standard 5)

Built on `@base-ui/react` (`toast`, `field`/`fieldset`/`form`, `dialog`/`alert-dialog`) + semantic
tokens. Lives in `src/components/feedback/`.

| Event                                                                           | Surface                                                                                                                 |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Field invalid (validation)                                                      | **inline** at the field (base-ui `field` error text + `aria-invalid`) — never a toast                                   |
| A whole view fails to load (no data to show)                                    | **`ErrorState`** panel: icon + friendly `[[HEADER]]` + Retry. Replaces `Failed to load X: {message}` / `Access denied.` |
| Routine in-place save (settings/profile section)                                | inline **"Saved ✓"** confirmation by the button                                                                         |
| Important action succeeds, result not already on screen (approve, delete, send) | **success toast**                                                                                                       |
| An action fails but the page is still usable                                    | **failure toast** — sticky + Retry                                                                                      |
| Destructive action (cancel booking, block-out, delete)                          | **confirm dialog** (`alert-dialog`)                                                                                     |
| No data yet (empty list)                                                        | **`EmptyState`** panel: icon + friendly `[[HEADER]]` + optional CTA                                                     |

- **Toast provider** (`ToastProvider` + `useToast`): mounted once at the root layout. aria-live region
  (polite for success, assertive for failure). Toast **v2** look: white `--card` surface, tinted icon
  chip (`status-available`/`destructive` token tints), title + muted subtitle, × dismiss, success auto-
  dismiss (~4s) with a thin progress line, failure sticky until dismissed with a Retry affordance.
  **Auto-themes** to warm-dark via tokens (no separate dark component).
- **`ErrorState` / `EmptyState`:** one shared panel component, two intents (icon + accent differ).
  Copy stays `[[ ]]`-stubbed per DESIGN.md rules; messages are friendly, not raw error strings. The
  raw `Access denied.` / `Failed to load …: {message}` screens across admin/account pages are swapped
  for these (mechanical swap; page-body redesign stays in later phases).
- **`ConfirmDialog`:** promise-based confirm wrapper over `alert-dialog` (title, body, confirm/cancel
  labels, `destructive` variant). Used by destructive admin/account actions.
- **`FormField`:** label + control + error + optional hint, wired to base-ui `field` so error +
  `aria-describedby`/`aria-invalid` are automatic. The shared inline-error primitive.
- **Mobile:** toasts anchor **bottom** with safe-area inset (thumb reach + visibility) and move to a
  top/corner anchor at `sm:`; confirm/dialog renders as a **bottom-sheet** (full-width, thumb-reachable
  actions) below `sm`, centered modal above.

## 4. Core component kit (Standard 1, feeds 2–4)

On `@base-ui/react` + semantic tokens, in `src/components/ui/`. **Build now** (each has a near-term
consumer in the shells or the page-wrapping pass, or is a Phase-2 staple worth landing with the kit):

- **`Card`** — surface container (`--card`, border, radius, padding from `space`).
- **`Badge`** — status/label pill; variants map to semantic + `status-*` roles.
- **`Table`** — semantic `<table>` styled to tokens, **with the mobile stacked-card pattern**: at base
  width each row renders as a labeled card (no horizontal scroll); real table at `md:`.
- **`Tabs`** — base-ui `tabs`, token-styled (in-page tabbed sections).
- **`Skeleton`** — token pulse placeholder for loading states.
- **`FormField`** + **`Select`** — base-ui `field` + `select`, token-styled (the inline-error field
  primitive + the first humanized control).
- Feedback set from §3 (`Toast`, `ErrorState`, `EmptyState`, `ConfirmDialog`).

**Align to the new tokens** (no API change): existing `button` / `input` / `label` — verify they read
the Phase-0 semantic roles (incl. `--brand*` where a branded variant is wanted) and the focus ring is
`--ring`. Add a **`brand`** button variant (uses `--brand` / `--brand-foreground`) for primary
marketing/hero CTAs — `--primary` stays the neutral default.

**Defer to Phase 4:** time picker, date picker (no consumer until settings humanization).

Each component: mobile-first base styles, ≥44px interactive targets, visible `--ring` focus, full
keyboard operation, semantic roles only (no hardcoded color/spacing).

## 5. Mobile-first / adaptive principles (cross-cutting — Standard 7, 8)

Applied to **every** surface above; called out here so the plan verifies them per-component, not as an
afterthought:

- **Authored mobile-first** — base styles target the phone; `sm:`/`md:` add desktop affordances. No
  desktop-down squeezing.
- **Adaptive, not shrunk** — nav → off-canvas drawers; tables → stacked cards; dialogs → bottom-sheets;
  toasts → bottom-anchored. These are purpose-built mobile patterns, not hidden desktop layouts.
- **Touch ergonomics** — interactive targets ≥44×44px; generous row spacing; primary actions within
  thumb reach (bottom-sheet/bottom-toast).
- **Native input behavior** — correct `type`/`inputmode` on fields (tel/email/numeric) so mobile
  keyboards adapt; full-width controls.
- **Viewport correctness** — `dvh` over `vh` for full-height shells; `env(safe-area-inset-*)` respected
  on fixed bars/sheets/toasts; **no horizontal scroll** anywhere.
- **Accessibility floor everywhere** — semantic HTML, AA contrast (Phase-0 tokens), visible focus, full
  keyboard nav (incl. drawer/dialog focus-trap + Esc), re-verified per surface.

---

## Files touched (Phase 1)

**New:**

- `src/components/layout/page-container.tsx`, `page-header.tsx`, `app-shell.tsx`, plus the sidebar +
  mobile-drawer pieces the shell composes.
- `src/components/feedback/` — `toast` (provider + hook + component), `error-state.tsx`,
  `empty-state.tsx`, `confirm-dialog.tsx`, `form-field.tsx`.
- `src/components/ui/` — `card.tsx`, `badge.tsx`, `table.tsx`, `tabs.tsx`, `skeleton.tsx`, `select.tsx`.

**Modified:**

- `src/components/site-header.tsx` — two-tier centered header + active-state tab row + mobile drawer.
- `src/components/account-menu.tsx` — sign-out handler lifted to a shared action reused by the sidebar
  footer; marketing dropdown retained.
- `src/app/(account)/layout.tsx`, `src/app/(admin)/layout.tsx` — render `AppShell` with the zone nav
  config (replacing bare `<SiteHeader/> + children`).
- `src/app/(marketing)/layout.tsx` — header swap is internal to `SiteHeader`; footer unchanged.
- `src/app/(account)/account/*` pages — drop the copy-pasted `<nav>`; wrap in `PageContainer`/
  `PageHeader`; convert `<a>` → `<Link>`.
- `src/app/(admin)/admin/page.tsx` — redirect `/admin` → `/admin/availability` (dead-end removed).
- `src/app/(admin)/admin/*` + `(account)/*` pages — swap raw `Access denied.` / `Failed to load …`
  screens for `ErrorState`; wrap in `PageContainer`/`PageHeader`.
- `src/app/layout.tsx` — mount `ToastProvider` at root.
- `src/components/ui/button.tsx` — add `brand` variant; confirm token alignment (input/label too).
- `docs/FRONTEND.md` — document shell primitives, the three-shell nav model, the feedback taxonomy +
  toast, the component kit, and the mobile-first/adaptive principles (same-commit doc rule).

## Out of scope (later phases)

Page-body redesigns (marketing Phase 2; account + booking Phase 3; admin Phase 4); the time/date
pickers + full input humanization (Phase 4); scheduler Layer-3 restyle (Phase 3/4); real photography
(Phase 2). Phase 1 ships chrome + kit + mechanical page-wrapping only.

## Acceptance criteria & verification

1. **Build/lint/typecheck clean** — `npm run lint`, `npm run typecheck`, `npm run build`; strict,
   no `any`. `npm test` green (no pure-logic touched, but the suite must still pass).
2. **One structural system** — no page sets its own `max-w-*` / `px-*` / ad-hoc `h1`; all read through
   `PageContainer` / `PageHeader`. Grep shows the 6-width / 4-padding / 3-h1 divergence is gone on
   touched pages.
3. **Navigation** — marketing header is two-tier centered with an active-state tab row + working mobile
   drawer; account + admin render the sidebar with active-state, Back-to-site, and footer sign-out;
   `/admin` no longer dead-ends; the 4× copy-pasted account nav is gone.
4. **No raw internal `<a href>`** for in-app routes (all `<Link>`); no full-reload regression on
   account nav.
5. **Feedback** — no raw `Failed to load X: {message}` / `Access denied.` screens remain on touched
   pages (replaced by `ErrorState`); a toast fires (aria-live) on a representative success + failure; a
   destructive action routes through `ConfirmDialog`; an inline field error renders at the field.
6. **Mobile-first proof** — at ~390px: marketing nav is a drawer (not a wrapped row); the sidebar is an
   off-canvas drawer; a `Table` renders as stacked cards (no horizontal scroll); a confirm renders as a
   bottom-sheet; a toast anchors bottom. All re-checked at desktop width.
7. **Accessibility** — keyboard-walk the header, drawer, sidebar, a dialog, and a form: visible
   `--ring` focus, focus-trap + Esc on drawer/dialog, logical tab order, semantic landmarks. Light +
   dark.
8. **Docs** — FRONTEND.md updated in the same commit(s) as the code it documents.

## Risks / notes

- **Server/client seam in `SiteHeader`** — keep identity/role server-derived; isolate the
  `usePathname` active-state into a small client child so the header stays an RSC.
- **`AppShell` is a client component** (drawer state, `usePathname`) — the layouts stay server
  components and pass plain nav-config props down; no server data leaks into client beyond name/role.
- **base-ui `drawer` / `toast` API specifics** — confirm the v1.5 component APIs during planning; the
  primitives exist (verified) but prop shapes must be read from the installed package.
- **Mechanical vs redesign boundary** — resist restyling page bodies while swapping error screens /
  wrapping containers; that scope belongs to Phases 2–4. Keep diffs to chrome + kit.
- **Sign-out single-source** — one shared sign-out action used by both the marketing `AccountMenu` and
  the sidebar footer; don't fork the handler.
