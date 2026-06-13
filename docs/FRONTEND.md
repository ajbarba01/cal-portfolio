# Frontend & Design

> CORE doc — project-agnostic; project facts live in docs/DESIGN.md.

> Authority for **the design system, theming, and the design→code pipeline** (general, portable). Project-specific pages, brand direction, and the concrete palette live in [DESIGN.md](DESIGN.md). For code conventions see [CODE_STYLE.md](CODE_STYLE.md); for architecture see [ENGINEERING.md](ENGINEERING.md).

Goal: distinctive, professional UI that **avoids the generic AI look**, with styling system modular enough that **palettes and components swap with minimal effort**.

---

## A. Design-tool pipeline (cheapest-first)

1. **(Optional) BareMinimum.design** — free, no-signup; turns a prompt or screenshot into ASCII/TUI wireframes (export text / Markdown / PNG / React-shadcn). Use for **zero-cost structural sketches** to agree layout _before_ spending Claude Design budget. **Do not** build production UI from its skeletal code export. Optional — overlaps Claude Design's wireframe mode.

2. **Claude Design** (separate weekly limit that does **not** consume Claude Code quota):
   - **Onboard it on this repo** so it reads `design-tokens.ts` + existing components and reuses the design system — without that grounding it produces the generic modern-startup look.
   - **Wireframe mode first** (cheaper tokens) to settle structure; switch to polished mockups only once structure locked.
   - **Dense prompts win:** name artifact type, audience, content structure, constraints. Use chat for layout/structure changes, inline canvas comments for local tweaks.
   - Heavy sessions can burn >50% of a weekly allotment — iterate in wireframe mode, polish sparingly.

3. **Design-tool handoff** — export a bundle containing the component tree (machine-readable), tokens actually used, layout hierarchy, referenced assets. Implementing agent builds from tree + tokens, **not** by inferring from pixels.

4. **Agent build** — any agent with `frontend-design` invokes it to force deliberate aesthetic choices, then implements with **shadcn/ui** + `design-tokens.ts`. Agents without it follow same written design constraints directly.

> **`frontend-design` fires twice for UI features.** First during **brainstorming** (the spec stage — see [WORKFLOW.md](WORKFLOW.md) skill table) so aesthetic direction is set in the spec before the plan, then again at **build** (step 4) for implementation. Non-UI work skips it.

---

## B. Modular theming (swap palettes / components with minimal effort)

- **Two-layer tokens.**
  - _Primitive layer_ — raw palette (`blue500`, `stone100`, …). Never referenced by components directly.
  - _Semantic layer_ — roles (`color.primary`, `color.surface`, `color.danger`, `text.muted`). Components reference **only semantic roles**.
- **CSS variables drive the semantic layer.** Swapping a palette = remap variables in one place; **no component edits**. Enables runtime theming (e.g. dark mode) for free.
- **shadcn/ui owned components** consume semantic tokens — never hardcoded colors. Swap a component by editing its source in-repo; swap the look by editing the token map.
- `tailwind.config` references tokens; **no inline magic color/spacing values** in components.

```
primitive palette ─▶ semantic roles (CSS vars) ─▶ tailwind config ─▶ shadcn components
        ▲ swap here to re-palette                          ▲ components never hardcode color
```

---

## C. Design system

Tokens live in two files: **`src/app/globals.css`** owns color + radius as two-layer CSS variables (primitive palette → semantic roles; runtime source of truth, incl. dark mode), and **`src/lib/design-tokens.ts`** owns non-color TS tokens (motion, breakpoints, z-index) + canonical list of semantic color roles. Typography set via `next/font` in root layout.

**Anti-generic rules:**

- Never default to Inter / Roboto / Open Sans / Arial. Pick a distinctive display + body pairing.
- Real contrast: weight extremes (200 vs 800), size jumps of 3×+ (not 1.5×).
- **Commit to a visual direction.** Project's specific direction + palette live in [DESIGN.md](DESIGN.md) — set them there, not here.

**Brand token roles (the portable token-system shape; `<project>` sets the concrete values in [DESIGN.md](DESIGN.md)):**

- **Re-palette swap layer.** A numbered neutral ramp (`--<neutral>-0…950`) is the primitive swap layer + an accent hue. Accent is **two roles**: a **bright fill** role (fills + button text, AA against white) and an **AA-safe strong** role (small text / links / active-nav / focus ring). `--primary` stays a near-black neutral so the accent is a deliberate accent, never the default button color.
- **`--canvas`** — the accent desk behind the sheet (light/dark values per theme). Two-layer semantic role — swapping desk color requires no component edits.
- **`--bg-texture`** — swappable site-wide background pattern, aliased from a `--tex-*` texture library in `globals.css` (each entry theme-aware). Painted **once, statically** on `html` (`bg-canvas` + `--bg-texture`, `background-attachment: fixed`); the desk is a transparent layout container so the single fixed layer shows through gutters + overscroll, while the opaque sheet/reading surface stays clean. Swap the whole site pattern by repointing `--bg-texture` at another `--tex-*`; `none` disables.
- **`--section-alt`** — secondary content tone for alternating section bands, deliberately **not** the white chrome color so a band never reads as header/footer.
- **`--sidebar-active`** — sidebar active-rect fill (light/dark per theme).
- **`--destructive-warm` / `--danger-warm`** — a warm accent-leaning red for soft-destructive affordances (e.g. sign-out), distinct from pure `--destructive`.
- **Type:** a distinctive display + body pairing on `--font-heading` / `--font-sans`, wired via `next/font`. Documented type scale + spacing scale + reading measure live in `src/lib/design-tokens.ts` (`typeScale`, `space`, `measure`); the `.measure` utility is in `globals.css`.
- **Whitespace is a token:** only the `space.*` steps (Tailwind 4px base) used for padding/gaps; no arbitrary values. Shells apply them so all zones share one rhythm.
- **Status reconciliation:** `--status-*` fills tuned to the neutral base; unavailable stays a warm gray (not red); red reserved for `--destructive`.

**Shared chrome + component kit (Phase 1, 2026-06-04; shell unification 2026-06-05):**

- **Shell primitives.** `PageShell` is the outermost server primitive: renders global `SiteHeader`, zone body, and `SiteFooter` inside a "sheet on a desk" (see _Shell_ below). `PageContainer` governs the inner content column (`width="read"` ≈ 65ch; `width="app"` wider for tables). `PageHeader` is the single source of page title/subtitle/actions rhythm — renders the one `<h1>` per page from the type scale. No page sets its own max-width, horizontal padding, or ad-hoc `<h1>` — they compose these primitives.
- **Width scale.** Three `PageContainer` widths: `read` (`max-w-[65ch]`, ~50–75 chars/line body-text target), `narrow` (`max-w-xl` / ~36rem, forms and booking flow), `app` (`max-w-6xl` / ~72rem, tables and admin). `SiteHeader` and `SiteFooter` share the same `max-w-6xl` inner container so chrome edges align with app-width content. Marketing section bands are full-bleed background + `max-w-6xl` inner container — the band color bleeds, the content aligns.
- **Shell.** `PageShell` wraps every zone. The desk is a transparent layout container; canvas color + `--bg-texture` painted once on `html` (static, `background-attachment: fixed`) and show through it. One centered `bg-background` sheet (`max-w-6xl` / 1152px, hairline `sm:border-x` side borders, full height) sits on top; at phone width the sheet goes full-bleed (borders collapse). Account/admin zones keep their desktop sidebar (`AppShell`) as the sheet body, below the global header.
- **Tonal hierarchy.** Desk ▸ content ▸ nav, lightest on top: `SiteHeader` **and** `SiteFooter` are `bg-card` so chrome reads as one fill top and bottom; the `PageShell` sheet body is `bg-background`; cards stay `bg-card` so they lift off the toned surface. Sidebar (`--sidebar`) excluded. `background` is darker than `card` in both themes. `html` filled with `--canvas` + static `--bg-texture` so the overscroll/rubber-band area extends the desk instead of flashing another color (Safari/iOS reveal the image there; Chrome/Firefox paint only the base color).
- **Alternating section bands.** Stacked marketing sections alternate between `--background` base and **`--section-alt`** — a secondary content tone deliberately **not** the chrome color, so a band never reads as header/footer. Card-bearing sections stay on `--background` so cards still lift. Swappable in one place via the `--section-alt` role.
- **Navigation — global header, one model.** `SiteHeader` renders on **every** zone inside `PageShell`. Left: wordmark — admin users get an accent-tinted (`text-brand-strong`) wordmark with underline-hover, linking to `/admin`; non-admin is plain near-black, linking home. Center (desktop): marketing tab row. Right (desktop): auth cluster (Sign in / account menu). Account/admin also keep a persistent left sidebar with zone section nav + footer identity + sign-out. **One merged mobile drawer** (single hamburger, flush right) lists zone sections first (account/admin), then marketing links, then Admin (admin users only) + account/sign-out. Active-state computed by a shared pure `isActiveNav` (exact-match) helper. All internal navigation uses `next/link` — no raw `<a href>` for in-app routes. No dead-end sections.
- **Interaction language (standing standard for all phases).** Top-bar links (tabs, account menu trigger, admin wordmark) use the `nav-underline` style via the `navUnderline` helper (`src/components/layout/nav-underline.ts`): underline grows from center on hover, persists when `aria-current`. Sidebar items use a **rect** active state via `--sidebar-active` (`bg-sidebar-active text-brand-strong font-semibold`), neutral on hover. Buttons **deepen** on hover (`brand` → `--brand-strong`; `default` darkens) with a 1px press on `:active`. New interactive surfaces follow these three patterns.
- **Feedback system — one taxonomy.** Validation errors render inline at the field (`FormField` on base-ui `field`, never a toast). A view that fails to load shows a friendly `ErrorState` panel — no raw "Failed to load …" / "Access denied." strings. No-data lists show an `EmptyState` panel. Transient results: routine in-place saves get an inline "Saved ✓"; important actions whose result isn't on screen fire a toast (success auto-dismisses, failure is sticky with retry). Toast provider mounts once at root; aria-live handled by base-ui; auto-themes to warm-dark. Destructive actions route through a `ConfirmDialog` (promise-based; bottom-sheet on mobile, centered on desktop).
- **Component kit.** Built on `@base-ui/react` + semantic tokens, in `src/components/ui/` and `src/components/feedback/`: card, badge, table (stacked labeled cards below `md`), tabs, skeleton, form field, select, plus the feedback set (ErrorState, EmptyState, toast, ConfirmDialog). Button/input/label/calendar are token-aligned; a `brand` button variant uses `--brand` for primary marketing CTAs (`--primary` stays the neutral default). `FormField` enforces `children` XOR `inputProps` at the type level. Time/date pickers deferred to the admin input-humanization phase.
- **Button hierarchy.** One primary action per view — use `variant="brand"` (clay fill) for THE form submit or CTA on a surface. `outline` = secondary action; `ghost` = tertiary/icon chrome; `destructive` behind `useConfirm`. The near-black `default` (`--primary`) is reserved for neutral chrome that doesn't belong to any zone's brand accent (e.g. admin bulk actions, system dialogs). Never two brand buttons on one view.
- **Form-on-card recipe.** Auth/contact/profile forms: card uses `bg-card` + `border` + `rounded-2xl`; inputs inside use `bg-background` + `border-input` + clay focus ring (`focus-visible:border-ring focus-visible:ring-ring/50`). The visual contract: inputs recede into the sheet, card lifts as the form container, single brand submit at the bottom-left (or full-width on narrow cards).
- **Admin table pattern.** Wide tabular admin data uses a semantic desktop `<table>` and stacked mobile `<ul>` cards rather than horizontal scrolling. Reuse this responsive table-to-cards pattern for future admin indexes.
- **Mobile-first / adaptive (authored, not bolted on).** Every shell + component authored at phone width first; mobile uses purpose-built patterns — nav → merged off-canvas drawer, tables → stacked cards, dialogs → bottom-sheets, toasts → bottom-anchored (safe-area aware). Interactive targets ≥44 px; full-height shells use `dvh`. Accessibility floor (semantic HTML, AA contrast, visible focus, keyboard nav including drawer/dialog focus-trap + Esc) re-verified per surface.

**Baseline requirements (every UI):**

- **Responsive, mobile-first.**
- **Accessibility floor** — semantic HTML, sufficient color contrast, visible focus states, full keyboard navigation.
- **Imagery** — `next/image`, defined aspect ratios, lazy loading.

**Status token group** — three semantic role pairs for scheduler cell states, defined in `globals.css` and listed in `SEMANTIC_COLORS`:

| Role                                 | Meaning                                 | Notes                                                                                                                                                                     |
| ------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status-available` / `-foreground`   | Muted green; day is open for booking    | Low chroma — informative, not urgent                                                                                                                                      |
| `status-booked` / `-foreground`      | Muted blue; day has a confirmed booking | Distinct from available without shouting                                                                                                                                  |
| `status-unavailable` / `-foreground` | Neutral gray; day blocked or unset      | **Not red by design** — a blank admin calendar is mostly unavailable; gray reads as quiet/neutral, not alarming. Red is reserved for `--destructive` (conflicts, errors). |

Dark mode provides desaturated fills with lighter foregrounds. Primitives `--green-soft`, `--green-deep`, `--blue-soft`, `--blue-deep` live in the primitive layer (light only); dark overrides for green/blue status roles are inlined directly in `.dark`, matching the `--destructive` pattern. Components reference only semantic `--status-*` roles.

- `--warning` / `--warning-foreground` — amber "warn-don't-block" accent (admin override notices). Light + dark defined in `globals.css`.

**Calendar primitive** — `src/components/ui/calendar.tsx` is a **hand-authored** thin wrapper over `react-day-picker` v9 (NOT the shadcn CLI, which scaffolds Radix; this project layers shadcn-style components on `@base-ui/react`). Only restyles rdp's headless day-grid with semantic token classes + a lucide nav chevron. `date-fns` is layout-only inside the grid components, never for booking rules.

**Scheduler component family** — booking + admin availability surfaces share a single compound `<Scheduler>` family in `features/booking/_components/scheduler/`. Three-layer split:

- **Layer 1 (data / server)** — RSC / server actions; fetches windows, busy ranges, overnight nights, settings; passes typed data down as props.
- **Layer 2 (pure model + hook + context)** — `schedule-selection`, `use-schedule-selection`, `scheduler-context`, `calendar-model`, `grid-runs`, `day-timeline-model`; stateless logic + selection state; no IO.
- **Layer 3 (compound `<Scheduler.*>` parts)** — presentational wireframe only; wired to context; logic-free. `<Scheduler>` root, `<Scheduler.MonthGrid>`, `<Scheduler.DayTimeline>`, `<Scheduler.WeekGrid>`, `<Scheduler.DayPanel>`, `<Scheduler.SelectionSummary>`, `<Scheduler.ClearDates>`, `<Scheduler.WeekActions>`, `<Scheduler.Legend>`, `<Scheduler.BookingDetailsPanel>`.

**Visual/interaction model.** Cell STATUS is a background fill (available=green, booked=blue, unavailable=neutral — via status tokens above); SELECTION is an OUTLINE overlay (not a fill) composed on top, so a cell can show both at once. Each selected day is its **own** rounded accent box — outlines do **not** merge across adjacent days (a deliberate "keep days separated" call); only the live drag-preview still uses run-boundary math (pure util in `src/features/booking/grid-runs.ts`). Month grid renders as a gapped `table-fixed` (rdp v9 emits a real `<table>`; equal H/V gaps come from `border-spacing`, not flex/grid gaps). Admin paints to select and clicks a booked cell to inspect (opens `Scheduler.BookingDetailsPanel`); status colors keyed by `Scheduler.Legend`. **Hourly booking** (short-duration services) uses a month→day flow: month picks the DAY, then `Scheduler.DayTimeline` shows that single day as a duration-accurate vertical timeline for picking/typing the start time; multi-day services stay a month date-range.

**Selection ring (Layer-3 restyle):** selection is a **thick accent (`--brand`) ring with a bold `--brand-strong` day number**, composing over the status fill; hover affordance + drag-preview use `--brand` at reduced opacity. Layers 1–2 unmodified.

Layer 3 is **wireframe / semantic-token-only** by contract — a design pass later swaps classNames without touching Layers 1–2. `SchedulerCapabilities` is the per-context seam: a plain object (with ADMIN and BOOKING presets) gating which parts mount + which interactions are enabled, keeping one component tree for both contexts.

> **Wireframe stage.** Calendar-first booking + admin surfaces built as functional wireframes: full UX/behavior, tokens-only minimal styling, no visual polish. A later overhaul (Claude Design pipeline above) sets the concrete look.

---

## Feedback conventions

Every user action produces visible feedback — nothing silent (enforced sitewide in the cohesion sweep). Which primitive serves which case:

- **Transient async result** (saved, booked, failed) → toast (`useToast`). Type-based duration: success/info auto-dismiss ~5 s; errors are sticky + assertive. Action-bearing toasts pass `timeout: 0` and move focus to the action.
- **Field / form validation** → inline message next to the field; never a toast alone.
- **Navigation outcome** (auth redirect-back, post-booking) → route change to a state that visibly reflects the result.
- **Destructive intent** → `useConfirm` (alertdialog; focus the least-destructive action).
- **Dead-end page** (no zone nav) → a back affordance (`BackToSite`) so there is always a way back.
- **Long page** → return-to-top affordance (`BackToTop`).

## Instant navigation

Navigation should feel like toggling a UI element, not fetching a page:

- **Persistent static shell.** Header/footer/sidebar live in the persistent `(site)` shell and read no cookies (auth resolves client-side in `header-auth-client.tsx`), so the chrome paints instantly and survives soft navigation.
- **Optimistic active state.** Nav links mark the clicked target active immediately via a `pendingHref` set in the click handler and cleared at render time on the pathname change (see `app-sidebar.tsx` / `site-nav.tsx`). Do NOT set this in an effect — the repo's eslint bans set-state-in-effect; the click-handler + render-time-clear pattern is the sanctioned approach.
- **Instant content feedback.** A shared `NavPendingProvider` flips on from the same click; `ContentArea` swaps the stale page for a buffered page loading circle (`DelayedPageLoader`: blank first, spinner only if the load drags) so soft sibling navigations get feedback even though the App Router won't re-show `loading.tsx` there. `loading.tsx` still covers first entry / hard loads.
- **Default `<Link>` prefetch** everywhere; never `prefetch={false}` on internal nav, never raw `<a>` for in-app routes.
- **Compositor-only animations** (transform/opacity), rAF-batched listeners, and `prefers-reduced-motion` honored for every effect.

## Image pipeline

Raw camera files are never committed to `public/`. Instead:

- **Originals** live in gitignored source folders at the repo root:
  `gallery-originals/` (grid photos) and `bg-originals/` (hero/background images).
- **`npm run gallery:sync`** (script: `scripts/gallery-sync/`, dep: `sharp`) re-encodes
  them into `public/`: resize ≤1600px long edge (no upscaling), JPEG q≈80 (mozjpeg),
  EXIF stripped. Gallery outputs are **content-hashed** (`IMG_0592.<hash>.jpg`) so a
  swapped photo busts caches; bg outputs keep **stable basenames** (referenced by path
  in code). Sync is idempotent (skip unchanged / delete orphaned / process changed).
- **Blur placeholders** are emitted to `src/content/image-placeholders.json`
  (tracked). `getGalleryImages()` attaches them to grid images; `MarketingHero`
  takes an optional `blurDataURL`. Always use `next/image` with `placeholder="blur"`
  where a placeholder exists.
- **`next.config.ts`** serves `avif`/`webp` with a long `minimumCacheTTL`; non-default
  `quality` values must be allow-listed in `images.qualities`.
- The `gallery-sync` skill documents the add/replace/remove workflow.

---

_Last reviewed: 2026-06-13_ (instant navigation + image pipeline)
