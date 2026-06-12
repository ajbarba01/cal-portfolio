# SP6 Plan B — Surface sweep + walkthrough Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply Plan A's conventions surface by surface — chrome polish, contact/home/auth restyles, reviews/account/admin passes, feedback-rule sweep (toasts/confirms) — then run the U11 full walkthrough and fix what it catches.

**Architecture:** No schema, no new primitives (Plan A shipped them). Each task = one surface group against its signed-off mockup; the final task is the `busy-week` walkthrough at 390/768/1024/1440 that closes the remaining live-verify findings (U5, U8-placement, U11, U22, U23, U27).

**Tech Stack:** Next.js App Router, TypeScript strict, Tailwind semantic tokens, lucide-react.

**Spec:** [`2026-06-11-sp6-cohesion-design.md`](../specs/2026-06-11-sp6-cohesion-design.md). **Visual contracts:** `home-chrome-preview.html` (Tasks 1–3), `contact-preview.html` (Task 4), `system-preview.html` (Tasks 6–7). See [mockups/sp6/NOTES.md](../mockups/sp6/NOTES.md) for sign-off conditions.

**Prereq:** Plan A merged. Standing rules: tokens are law; lucide over emoji; AA + visible focus + keyboard; mobile parity; `frontend-design` before UI tasks; subject-line-only commits, no plan/phase IDs.

---

## Task 1: Header/nav polish (U20)

**Files:** Modify `src/components/site-header.tsx`, `src/components/site-nav.tsx`, `src/components/layout/nav-underline.tsx` (or wherever `navUnderline` lives).

**Contract:** `home-chrome-preview.html` — header ~60px (today `py-6` ≈ 88px), tabs get a hover surface (`hover:bg-muted` rounded) + tucked active underline (inset to label width, not full-tab), burger optically flush right.

- [ ] **Step 1:** Trim header vertical padding (`py-6` → `py-3`); tab links become padded rounded hover targets with the active state per contract. Keep `aria-current` behavior; focus-visible ring on every tab.
- [ ] **Step 2:** Mobile: pull the burger trigger optically flush — `-mr-3` (or equivalent vs the container's `px-5`) so the icon lands on the content edge; the 44px hit target stays intact.
- [ ] **Step 3:** Verify desktop tabs (hover/active/focus), wordmark admin tint unchanged, drawer unchanged, header height on all three zones; 390 burger flush.
- [ ] **Step 4:** Typecheck + lint, commit: `feat: polish site header tabs and mobile menu alignment`

## Task 2: Footer content (U12, U16 application)

**Files:** Modify `src/components/layout/site-footer.tsx`; add registry keys in `src/content/marketing.ts` if link labels are copy-owned.

**Contract:** `home-chrome-preview.html` — left copyright line; center/right nav (About · Services · Resources · Contact); socials row: Instagram + TikTok **hidden until Cal supplies URLs** (render nothing for empty target — no dead links), mail icon → `/contact` (**never `mailto:` — maintainer privacy rule**). Mobile stacks centered.

- [ ] **Step 1:** Build per contract with lucide `Instagram`, `Mail` (TikTok has no lucide glyph — use the simple-icons path inline or omit until URL exists; do NOT use an emoji). Social hrefs read from a single config (content registry or a `socials.ts` const) so Cal's URLs drop in later.
- [ ] **Step 2:** Verify: edges align with header (Plan A container), icons have `aria-label`s + 36px+ targets, hover states, mobile centered stack.
- [ ] **Step 3:** Typecheck + lint, commit: `feat: add footer nav and social icon links`

## Task 3: Home — trust cards + band rhythm (U18, U22 check)

**Files:** Modify `src/app/(marketing)/page.tsx`.

**Contract:** `home-chrome-preview.html` (approved on REAL registry copy) — card per point: lucide icon in clay-soft disc + Fraunces title row, long-form body left-aligned, clay inline links; centered grid (max-w ~944px inside the app container), 1-col stack on mobile. Icons: `Shield`/`ShieldCheck` (safety), `Heart` (well-trusted), `MapPin` (experienced/local). Why-Cal header stays `MarketingCopy` (placeholder until copy-sync).

- [ ] **Step 1 (frontend-design first):** Rebuild the trust `<ul>` as cards per contract. `MarketingCopy` already renders the inline markdown links — keep body via the registry, never hardcode copy.
- [ ] **Step 2:** Confirm U22 at 390: CTA band heading wraps without clipping (Plan A's overflow fix should cover it; if it still clips, fix the band's padding/measure here and note it).
- [ ] **Step 3:** Verify 390/768/1440 + dark theme; AA on `text-sand-700`-equivalent body (use `text-foreground/80`-class semantic tokens, not raw sand vars).
- [ ] **Step 4:** Typecheck + lint, commit: `feat: rebuild home trust points as icon cards`

## Task 4: Contact page rebuild (U19)

**Files:** Modify `src/app/(marketing)/contact/page.tsx`, `src/app/(marketing)/contact/_components/contact-form.tsx`.

**Contract:** `contact-preview.html` (approved) — single centered card (max-w ~560px) on the sheet: Fraunces "Contact me" + one-line intro + clock-icon "I usually reply within a day" row; **stacked single-column fields** (Name/Email/Phone/Subject-optional/Message); `Textarea` primitive; brand submit with `Send` icon; **no public email/phone anywhere**; honeypot stays; inline success state replaces the form (check disc, next-step links to `/book` + `/resources`) + the existing toast.

- [ ] **Step 1 (frontend-design first):** Rebuild per contract using the Plan A form-on-card recipe. Keep `submitInquiry` wiring + error `role="alert"`; pending state on the button ("Sending…").
- [ ] **Step 2:** Success state per contract (not the current bare `<p>`): card swap with links; focus moves to the success heading (a11y).
- [ ] **Step 3:** Verify: desktop centered, 390 full-width card, keyboard-only pass, error + success both visible states; signed-in prefill still works.
- [ ] **Step 4:** Typecheck + lint, commit: `feat: rebuild contact page as centered card with success state`

## Task 5: Auth pages adopt the recipe (U15 application, U23)

**Files:** Modify login + signup pages/components under `src/app/(auth)/`.

- [ ] **Step 1:** Apply the form-on-card recipe (Plan A): card styling consistent with contact, brand submit (done in Plan A Task 5 — verify), input fills/focus identical, links (`Sign up` / `Sign in` cross-links) clay. Trim the dead vertical space (U23): center the card vertically in the available sheet (`min-h` + flex centering) instead of top-anchored card + 1000px of empty sand.
- [ ] **Step 2:** Verify both pages at 390/1440, keyboard pass, password managers still autofill (no name/id changes).
- [ ] **Step 3:** Typecheck + lint, commit: `feat: align auth pages with shared form recipe`

## Task 6: Marketing rest — reviews, about, resources, gallery, services (U21, U23)

**Files:** Modify `src/app/(marketing)/reviews/page.tsx` (+ components), light touches in `about/`, `resources/`, `gallery/`, `services/`.

- [ ] **Step 1 — Reviews:** unicode ★ → lucide `Star` (filled via `fill-current`) with `aria-label="4 of 5 stars"`; "Leave a review" becomes a card consistent with the form recipe (signed-out: card with sign-in link, not a bare underline); auto-publish copy (Plan A Task 8) verified here.
- [ ] **Step 2 — About/Resources:** apply measure + rhythm conventions (body at `read` width, eyebrow treatment consistent with home bands); no structural redesign. Services: verify card internals use consistent paddings/typography with the trust cards; no redesign (copy is Cal's).
- [ ] **Step 3 — U23 empty-sheet rhythm:** on short pages (reviews with few entries), the sheet shouldn't render a viewport of empty sand — confirm the shell's min-height strategy post-Plan-A and tighten section paddings where a page is sparse.
- [ ] **Step 4:** Verify each page 390/1440; typecheck + lint, commit: `feat: sweep marketing pages for icon and rhythm cohesion`

## Task 7: Feedback-rule sweep — toast types (U7) + confirm audit + back-to-top (U9)

**Files:** Every `useToast`/`toast.add` call site (grep `toast.add`); action buttons lacking confirms (grep mutation handlers in `(admin)`/`(account)`); long pages get `BackToTop`.

- [ ] **Step 1 — U7:** Tag every toast call with its type (`success` / `error` / `info` per the SP3b primitive API). Errors must be the sticky+assertive type; successes auto-dismiss. List of call sites in the commit body is NOT needed — keep subject-only.
- [ ] **Step 2 — Confirm audit (NN/g: destructive/consequential only, name the object):** sweep admin + account mutation buttons; wrap silent consequential ones in the existing `useConfirm` (known: **mark-balance-settled** — title names the client + amount per `system-preview.html` panel 6). Do NOT add confirms to routine actions (approve booking, resolve inquiry) — overuse kills the signal.
- [ ] **Step 3 — U9:** Mount the SP3b `BackToTop` on long scrollers: resources, gallery, admin clients/bookings lists, account bookings.
- [ ] **Step 4:** Verify a sample of each toast type live; confirm dialog keyboard/escape behavior; typecheck + lint, commit: `feat: apply toast types, confirm dialogs, and back-to-top sitewide`

## Task 8: Admin + account polish (U5, U28, U29, U30)

**Files:** Admin sidebar (`src/components/layout/app-sidebar.tsx`), inquiries components, booking-detail surfaces, clients list.

- [ ] **Step 1 — U30:** lucide icons on admin sidebar tabs (match the SP5b dashboard preview's icon set: `LayoutDashboard`, `CalendarDays`, `CalendarCheck`, `Users`, `MessageSquare`, `Star`, `Briefcase`, `Settings` — pick per existing nav labels); drawer gets the same.
- [ ] **Step 2 — U29:** in inquiry rows/detail, the date text currently swallows clicks — make the entire row the open affordance (one `<Link>`/button wrapping, hover state, no nested interactive conflicts).
- [ ] **Step 3 — U28:** grep booking-detail + emails for "holiday" → premium-day wording; reword stale detail lines (premium days are a rate note, not a separate list — per SP5 label decision).
- [ ] **Step 4 — U5 (clients list instance):** long client names truncate with `truncate` + `title` attr in the table cell + drawer/mobile card; sweep other user-text cells in the same table.
- [ ] **Step 5 — U8 + U10 (account):** client's own bookings render muted-clay in the account calendar (token: `--sidebar-active`/clay-soft family — semantic, AA-checked) with a one-line legend; booking detail shows fuller service info (service name, duration/nights, pets, price breakdown from existing artifacts — no new reads if avoidable).
- [ ] **Step 6:** Verify each on `busy-week` seed; typecheck + lint, commit: `feat: polish admin and account booking surfaces`

## Task 9: U11 walkthrough — full sweep + fix list

**Files:** fixes land wherever the walk finds them (lightweight-lane discipline per fix; escalate anything spec-sized).

- [ ] **Step 1:** Seed `busy-week`. Walk EVERY route (marketing, auth, onboarding, account, admin) at 390 / 768 / 1024 / 1440 **including the transitions between them** (drag-resize). Tooling: Chrome DevTools device toolbar; headless-Chrome screenshot matrix (audit-session pattern) for the record; Playwright MCP if available for auth'd flows. Capture: silent actions, overflow/wrap breaks (U5 class), off-center mobile filter stacks, empty states (each list with 0 items — `fresh` seed for that), confusing states, U27 (overnight rendering in bookings calendars), U22 residual.
- [ ] **Step 2:** Triage the catch list IN THIS PLAN's Handoff log (one line each: surface · defect · severity). Fix all minor ones task-by-task (typecheck + lint per commit, conventional subjects). Anything structural → escalate, don't improvise.
- [ ] **Step 3:** Re-walk the fixed surfaces at the same breakpoints to confirm.
- [ ] **Step 4:** Commit(s): `fix: <specific defect>` per fix.

---

## Final gates + close-out

- [ ] `npm run typecheck` · `npm run lint` (0 errors) · `npx vitest run` (no new failures vs known shared-DB ones) · `npm run build`.
- [ ] Manual `verify` pass of the headline surfaces (home, contact, booking flow, admin hub) desktop + mobile.
- [ ] Fresh-session `/code-review`; address findings.
- [ ] Prune from the register: U5, U7, U8, U9, U10, U11, U12, U13 (decision note), U16, U18, U19, U20, U21, U23, U27, U28, U29, U30 + any Plan A leftovers confirmed here. SP6 section should be empty (or carry only explicitly-deferred lines).
- [ ] Both SP6 plans → `plans/archive/` (DoD shipped); HANDOFF Progress (SP6 DONE) + session-log line; roadmap SP6 status note — same commit.

## Handoff log

(escalations + the U11 catch list go here)
