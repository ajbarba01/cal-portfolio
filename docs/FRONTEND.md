# Frontend & Design

> Authority for **the design system, theming, and the design→code pipeline** (general, portable). Project-specific pages, brand direction, and the concrete palette live in [DESIGN.md](DESIGN.md). For code conventions see [CODE_STYLE.md](CODE_STYLE.md); for architecture see [ENGINEERING.md](ENGINEERING.md).

Goal: a distinctive, professional UI that **avoids the generic AI look**, with a styling system modular enough that **palettes and components swap with minimal effort**.

---

## A. Design-tool pipeline (cheapest-first)

1. **(Optional) BareMinimum.design** — free, no-signup; turns a prompt or screenshot into ASCII/TUI wireframes (export text / Markdown / PNG / React-shadcn). Use it for **zero-cost structural sketches** to agree layout _before_ spending Claude Design budget. **Do not** build production UI from its skeletal code export. Optional — overlaps Claude Design's wireframe mode.

2. **Claude Design** (separate weekly limit that does **not** consume Claude Code quota):
   - **Onboard it on this repo** so it reads `design-tokens.ts` and existing components and reuses the design system — without that grounding it produces the generic modern-startup look.
   - **Wireframe mode first** (cheaper tokens) to settle structure; switch to polished mockups only once structure is locked.
   - **Dense prompts win:** name the artifact type, audience, content structure, and constraints. Use chat for layout/structure changes, inline canvas comments for local tweaks.
   - Heavy sessions can burn >50% of a weekly allotment — iterate in wireframe mode, polish sparingly.

3. **"Send to Claude Code" handoff** — exports a bundle: component tree (machine-readable), the tokens actually used, layout hierarchy, and referenced assets. Claude Code builds from the tree and tokens, **not** by inferring from pixels.

4. **Claude Code build** — invoke the `frontend-design` skill to force deliberate aesthetic choices, then implement with **shadcn/ui** + `design-tokens.ts`.

> **`frontend-design` fires twice for UI features.** First during **brainstorming** (the spec stage — see [WORKFLOW.md](WORKFLOW.md) skill table) so the aesthetic direction is set in the spec before the plan, then again at **build** (step 4) for implementation. Non-UI work skips it.

---

## B. Modular theming (swap palettes / components with minimal effort)

- **Two-layer tokens.**
  - _Primitive layer_ — the raw palette (`blue500`, `stone100`, …). Never referenced by components directly.
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

Tokens live in two files: **`src/app/globals.css`** owns color + radius as two-layer CSS variables (primitive palette → semantic roles; the runtime source of truth, incl. dark mode), and **`src/lib/design-tokens.ts`** owns the non-color TS tokens (motion, breakpoints, z-index) + the canonical list of semantic color roles. Typography is set via `next/font` in the root layout.

**Anti-generic rules:**

- Never default to Inter / Roboto / Open Sans / Arial. Pick a distinctive display + body pairing.
- Real contrast: weight extremes (200 vs 800), size jumps of 3×+ (not 1.5×).
- **Commit to a visual direction.** The project's specific direction and palette live in [DESIGN.md](DESIGN.md) — set them there, not here.

**Brand tokens (set 2026-06-04; extended 2026-06-05):**

- **Palette "Trail":** `--sand-0…950` warm neutrals (the re-palette swap layer) + clay accent.
  Clay is **two roles**: `--brand` (bright `#AE5A35` fill — fills + button text, white passes AA) and
  `--brand-strong` (`#8A4226` — AA-safe small text/links/active-nav/focus ring). `--primary` stays
  warm near-black: clay is a deliberate accent, never the default button color.
- **`--canvas`** (the accent desk behind the sheet): light = `--sand-200`, dark = `--sand-950`. Two-layer
  semantic role — swapping the desk color requires no component edits.
- **`--sidebar-active`** — sidebar active-rect fill: light = `--clay-soft`, dark = `--clay-deep`.
- **`--destructive-warm` / `--danger-warm`** — warm clay-leaning red for sign-out / soft-destructive affordances (sidebar sign-out), distinct from the pure `--destructive`.
- **Type:** Fraunces (`--font-heading`) headings, Public Sans (`--font-sans`) body. Documented type
  scale + spacing scale + `65ch` reading measure live in `src/lib/design-tokens.ts` (`typeScale`,
  `space`, `measure`); the `.measure` utility is in `globals.css`.
- **Whitespace is a token:** only the `space.*` steps (Tailwind 4px base) are used for padding/gaps;
  no arbitrary values. Shells apply them so all zones share one rhythm.
- **Status reconciliation:** `--status-*` fills were re-tuned to the warm base; unavailable stays
  warm gray (not red); red is reserved for `--destructive`.

**Shared chrome + component kit (Phase 1, 2026-06-04; shell unification 2026-06-05):**

- **Shell primitives.** `PageShell` is the outermost server primitive: renders the global `SiteHeader`, the zone body, and `SiteFooter` inside a "sheet on a desk" (see _Shell_ below). `PageContainer` governs the inner content column (`width="read"` ≈ 65ch; `width="app"` wider for tables). `PageHeader` is the single source of the page title/subtitle/actions rhythm — renders the one `<h1>` per page from the type scale. No page sets its own max-width, horizontal padding, or ad-hoc `<h1>` — they compose these primitives.
- **Shell.** `PageShell` wraps every zone. The desk (`bg-canvas` + a faint static `.desk-grain` noise overlay) fills the viewport; one centered `bg-background` sheet (`max-w-6xl` / 1152px, hairline `sm:border-x` side borders, full height) sits on top; at phone width the sheet goes full-bleed (borders collapse). Account/admin zones keep their desktop sidebar (`AppShell`) as the body of the sheet, below the global header.
- **Tonal hierarchy.** Desk ▸ content ▸ nav, lightest on top: `SiteHeader` **and** `SiteFooter` are `bg-card` (white / dark `sand-925`) so the chrome reads as one fill top and bottom; the `PageShell` sheet body is `bg-background` (`sand-50` / dark `sand-950`); cards stay `bg-card` so they lift off the toned surface. The sidebar (`--sidebar`) is excluded. `background` is darker than `card` in both themes. `html`/`body` are filled with `--canvas` so the overscroll/rubber-band area extends the desk instead of flashing another color.
- **Alternating section bands.** Stacked marketing sections alternate between the `--background` base and **`--section-alt`** (`sand-100` / dark `sand-800`) — a secondary content tone deliberately **not** the white chrome color, so a band never reads as header/footer. Card-bearing sections stay on `--background` so white cards still lift. Swappable in one place via the `--section-alt` role.
- **Navigation — global header, one model.** `SiteHeader` renders on **every** zone inside `PageShell`. Left: wordmark — admin users get a clay-tinted (`text-brand-strong`) wordmark with underline-hover, linking to `/admin`; non-admin is plain near-black, linking home. Center (desktop): marketing tab row. Right (desktop): auth cluster (Sign in / account menu). Account/admin also keep a persistent left sidebar with zone section nav and footer identity + sign-out. **One merged mobile drawer** (single hamburger, flush right) lists zone sections first (account/admin), then marketing links, then Admin (admin users only) + account/sign-out. Active-state computed by a shared pure `isActiveNav` (exact-match) helper. All internal navigation uses `next/link` — no raw `<a href>` for in-app routes. No dead-end sections.
- **Interaction language (standing standard for all phases).** Top-bar links (tabs, account menu trigger, admin wordmark) use the `nav-underline` style via the `navUnderline` helper (`src/components/layout/nav-underline.ts`): underline grows from center on hover, persists when `aria-current`. Sidebar items use a **rect** active state via `--sidebar-active` (`bg-sidebar-active text-brand-strong font-semibold`), neutral on hover. Buttons **deepen** on hover (`brand` → `--brand-strong`; `default` darkens) with a 1px press on `:active`. New interactive surfaces should follow these three patterns.
- **Feedback system — one taxonomy.** Validation errors render inline at the field (`FormField` on base-ui `field`, never a toast). A view that fails to load shows a friendly `ErrorState` panel — no raw "Failed to load …" / "Access denied." strings. No-data lists show an `EmptyState` panel. Transient results: routine in-place saves get an inline "Saved ✓"; important actions whose result isn't on screen fire a toast (success auto-dismisses, failure is sticky with retry). Toast provider mounts once at the root; aria-live handled by base-ui; auto-themes to warm-dark. Destructive actions route through a `ConfirmDialog` (promise-based; bottom-sheet on mobile, centered on desktop).
- **Component kit.** Built on `@base-ui/react` + semantic tokens, in `src/components/ui/` and `src/components/feedback/`: card, badge, table (stacked labeled cards below `md`), tabs, skeleton, form field, select, plus the feedback set (ErrorState, EmptyState, toast, ConfirmDialog). Button/input/label/calendar are token-aligned; a `brand` button variant uses `--brand` for primary marketing CTAs (`--primary` stays the neutral default). `FormField` enforces `children` XOR `inputProps` at the type level. Time/date pickers are deferred to the admin input-humanization phase.
- **Mobile-first / adaptive (authored, not bolted on).** Every shell and component is authored at phone width first; mobile uses purpose-built patterns — nav → merged off-canvas drawer, tables → stacked cards, dialogs → bottom-sheets, toasts → bottom-anchored (safe-area aware). Interactive targets ≥44 px; full-height shells use `dvh`. Accessibility floor (semantic HTML, AA contrast, visible focus, keyboard nav including drawer/dialog focus-trap + Esc) re-verified per surface.

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

Dark mode provides desaturated fills with lighter foregrounds. Primitives `--green-soft`, `--green-deep`, `--blue-soft`, `--blue-deep` live in the primitive layer (light only); dark overrides for green/blue status roles are inlined directly in `.dark`, matching the `--destructive` pattern. Components reference only the semantic `--status-*` roles.

**Calendar primitive** — `src/components/ui/calendar.tsx` is a **hand-authored** thin wrapper over `react-day-picker` v9 (NOT the shadcn CLI, which scaffolds Radix; this project layers shadcn-style components on `@base-ui/react`). It only restyles rdp's headless day-grid with semantic token classes + a lucide nav chevron. `date-fns` is layout-only inside the grid components, never for booking rules.

**Scheduler component family** — the booking and admin availability surfaces share a single compound `<Scheduler>` family in `features/booking/_components/scheduler/`. Three-layer split:

- **Layer 1 (data / server)** — RSC / server actions; fetches windows, busy ranges, overnight nights, settings; passes typed data down as props.
- **Layer 2 (pure model + hook + context)** — `schedule-selection`, `use-schedule-selection`, `scheduler-context`; stateless logic and selection state; no IO.
- **Layer 3 (compound `<Scheduler.*>` parts)** — presentational wireframe only; wired to context; logic-free. `<Scheduler>` root, `<Scheduler.MonthGrid>`, `<Scheduler.WeekGrid>`, `<Scheduler.DayPanel>`, `<Scheduler.SelectionSummary>`, `<Scheduler.WeekActions>`, `<Scheduler.Legend>`, `<Scheduler.BookingDetailsPanel>`.

**Visual/interaction model.** Cell STATUS is a background fill (available=green, booked=blue, unavailable=neutral — via the status tokens above); SELECTION is a merged OUTLINE overlay (not a fill) composed on top, so a cell can show both at once. Contiguous same-booking cells merge into one rounded fill and contiguous selected cells merge into one outline — run-boundary math is a pure util in `src/features/booking/grid-runs.ts`. Admin paints to select and clicks a booked cell to inspect (opens `Scheduler.BookingDetailsPanel`); status colors are keyed by `Scheduler.Legend`.

Layer 3 is **wireframe / semantic-token-only** by contract — a design pass later swaps classNames without touching Layers 1–2. `SchedulerCapabilities` is the per-context seam: a plain object (with ADMIN and BOOKING presets) that gates which parts mount and which interactions are enabled, keeping one component tree for both contexts.

> **Wireframe stage.** The calendar-first booking + admin surfaces are built as functional wireframes: full UX/behavior, tokens-only minimal styling, no visual polish. A later overhaul (Claude Design pipeline above) sets the concrete look.

---

_Last reviewed: 2026-06-05_ (shell unification + interaction language)
