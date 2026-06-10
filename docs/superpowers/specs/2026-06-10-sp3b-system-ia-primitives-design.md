# SP3b — System IA + UI primitives (design)

> Second half of SP3 (Foundations). Companion: [roadmap](2026-06-10-professionalization-roadmap-design.md) §SP3, [findings register](2026-06-10-audit-findings.md) §SP3. SP3a ([spec](2026-06-10-sp3a-codebase-refactor-design.md), [plan](../plans/2026-06-10-sp3a-codebase-refactor.md)) delivered the enforceable feature boundaries + per-feature public APIs this spec consumes. SP3b owns the **system IA + UI-primitive** slice, plus the codebase-deepening follow-ups SP3a's review deferred.

## Goal

Finish the foundation: (A) close the codebase-deepening debt SP3a's fresh review logged (A13/A14/A16 — duplication SP3a relocated verbatim but could not consolidate inside its behavior-preserving scope), and (B) build the system-IA fixes and the reusable UI primitives — confirm-dialog, toast, dialog/popup, navigation skeleton, admin attention-badge — that SP4–SP6 consume. Primitives are architecture: a modularized system gets modularized UI. **3b builds the primitives and performs only the single migration that defines each one; the sitewide application is SP6.**

## Scope (findings owned)

From the findings register §SP3: **A2** (confirm-dialog unification), **A12** (onboarding IA / nav active-state), and the SP3a deepening follow-ups **A13, A14, A16**. The toast primitive resolves the build half of **U7** and the active-state half of **U3** (both findings' sitewide application stays in SP6). The admin attention-badge primitive sets up **AD5** (SP5 wires the live counts).

Deferred out (consumed, not built, here): every sitewide sweep — silent-action feedback (U1/U2), redirect-back generalization (U4), text-overflow sweep (U5), own-bookings muted-clay (U8), return-to-top application (U9), the SP6 cohesion walk (U11). A15 (serial debt/onboarding awaits) stays SP7 (performance).

## Decisions (from maintainer grilling, 2026-06-10)

- **Finish the foundation now.** 3b absorbs the SP3a deepening follow-ups (A13/A14/A16) rather than pushing them to the booking-mutation track. Closes all SP3-tagged findings.
- **Two plans under one spec.** The work is mixed-domain (backend dedup vs UI), so it decomposes into **Plan A — codebase deepening** (A13/A14/A16, behavior-preserving, no UI) and **Plan B — IA + UI primitives** (A2, A12/U3, U7, nav skeleton, admin-attention seam, feedback conventions). Two independent execution sessions; smaller plans → cheaper subagent execution + focused reviews (same rationale as the 3a/3b split). Plan A runs first (lowest-risk pure refactor, clears the deepening debt before primitive work begins).
- **Confirm-dialog seam (A2):** unify on the **promise-hook API** (`useConfirm` / `await confirm()`), folding in the controlled component's `pending`/async-disable state + icon/brand visual. Maintainer delegated ("your call"); the promise-hook is the dominant usage (5 of 6 sites) and the industry-validated pattern for the linear "ask → act" control flow.
- **Onboarding IA (A12):** **standalone route + navigation skeleton.** `/onboarding` is a pre-account gate (middleware sends non-onboarded users there, approved users to `/account`; approved users never see it), so it is not an account sub-page. Keep it standalone; fix the nav matcher so it never mis-highlights Account; give it a navigation skeleton (way back to site + section indicator).
- **Toast policy (U7):** **type-based duration** — success/info auto-dismiss, errors sticky, action-toasts sticky.
- **Admin attention surface (AD5):** 3b ships the **nav-badge primitive + the typed attention-counts seam shape only**; SP5 wires the live counts and final placement.
- **Dialog/popup primitive:** worth generalizing now — SP5's inquiry popup (AD7) and future modals should compose one styled shell, not re-style base-ui ad hoc.

## Standing rule: behavior preservation (Plan A) / additive primitives (Plan B)

- **Plan A** is strictly behavior-preserving — no functional or visual change, same safety net as SP3a (existing booking/admin unit + integration suite as the characterization harness; `tsc --noEmit` strict; the boundary lint; add a characterization test before any move that crosses thin coverage).
- **Plan B** changes UI by design, but each primitive is introduced as a **drop-in replacement that preserves current behavior at its migrated call sites** — the toast still fires on the same events, the confirm dialog still gates the same actions. New behavior (type-based toast duration, alertdialog semantics) is the deliberate, specified delta. Each migrated site is manually verified desktop **and** mobile + breakpoint transition (mobile parity), and a11y-checked (focus order, ARIA roles, contrast).

## Architecture

### Plan A — codebase deepening

Three consolidations of duplication SP3a relocated verbatim. Each is internal to the booking feature, behind its locked public API; no cross-feature surface changes.

- **A13 — shared booking-scheduler hook.** `use-service-booking`, `use-edit-booking`, `use-admin-create-booking` are ~90% duplicated (date helpers, `buildCapabilities`, `busyRanges`, `schedulerData`, stay/derivation, latest-ref debounce, `onSelectionChange`, `@`-cell parsing, step labels); the only deltas are the action calls + auth/force-confirm gating. Extract a `useBookingScheduler({ preview, submit, gating })` primitive; each existing hook becomes a thin parameterization passing its preview/submit callbacks + gating flags. Critical invariants to preserve verbatim (SP3a regression history): the `onSelectionChange` callback identity stability (`useCallback` deps — an unstable identity re-fires `Scheduler`'s effect subscription, risking a render loop) and the ~400 ms debounce semantics. Guarded by the existing `edit-booking.integration.test.ts` + `admin-create-booking.integration.test.ts`; add a characterization test for the `service-booking` path (today thinner-covered) **before** extracting.
- **A14 — shared slot validation.** The `SettingsRow → BookingRuleSettings` mapping and the `passesGuards`/`getOpenWindows`/`fitsWindow` slot-validation block are duplicated 4× across cores (`create-core`, `edit-core` ×2 incl. `previewEditCore`, `reschedule-core`), violating `booking-service-shared`'s "≥2 cores" charter. Extract `toRuleSettings()` + `validateSlot()` into `booking-service-shared`; the four cores call shared. Removes the edit-vs-preview drift risk that the preview twin exists to prevent.
- **A16 — drop the redundant re-parse.** `create-core` re-runs `createBookingInputSchema.parse(rawInput)` that `computeBookingArtifacts` already ran (shared discards its parsed `input`, forcing the re-parse to recover `userId`/`startsAt`/`endsAt`). Surface the already-parsed input on `BookingQuoteArtifacts` (e.g. `artifacts.input`) so `create-core` reads it instead of re-parsing — removes the redundant validation + divergence risk.

ADR appended (`docs/adr/`) recording the shared-scheduler-hook + shared-slot-validation decisions, continuing SP3a's decision-memory discipline.

### Plan B — IA + UI primitives

#### Confirm-dialog unification (A2)

Today: two parallel implementations — `components/feedback/confirm-dialog.tsx` (`useConfirm` promise hook, `await confirm(opts)`, 5 production call sites) and `components/ui/confirm-dialog.tsx` (`ConfirmDialog` controlled component with `pending`/async-disable + icon/brand visual, 1 site: `inquiry-list`).

Unify on **one** `useConfirm` hook:

- Keep the promise-hook API (`const { confirm, dialog } = useConfirm()` → `if (await confirm({ ... })) …`). It is the ergonomic, dominant pattern and the industry-recommended shape for imperative "ask → act" prompts.
- Fold in the controlled version's two strengths: an optional **`pending`/async-confirm** path (the confirm button can disable + show a working state while an async confirm resolves, instead of resolving the promise immediately), and the icon + brand visual treatment.
- Accessibility: render with `role="alertdialog"` (base-ui `AlertDialog` already provides this), move initial focus to the **least-destructive** action (Cancel), label via the title (`aria-labelledby`), restore focus to the trigger on close. The current feedback impl already uses `AlertDialog`; this hardens focus + labelling.
- Migrate the single `inquiry-list` controlled site to the hook. Delete `components/ui/confirm-dialog.tsx`. Net: one seam, the `ui/` duplicate gone.

#### Toast redesign (U7)

Current `components/feedback/toast.tsx` renders a single fixed toast shape with no per-type duration or severity semantics. Redesign the primitive (not its sitewide application):

- **Duration:** type-based. success/info auto-dismiss (~5 s; **pause on hover and focus** so slow readers and AT users are never cut off); **errors are sticky** (no auto-dismiss, manual close); action-bearing toasts are sticky. Validated against current conventions (2–6 s typical, errors longer/persistent, pause-on-hover).
- **ARIA:** `role="status"` (`aria-live="polite"`) for success/info; `role="alert"` (assertive) for errors. A toast that carries an interactive element should **move focus to it and be persistent** rather than behave as a transient live region (a11y rule — interactive content must not be a disappearing live region).
- **Sizing:** width clamps to content with a max (no fixed width that truncates or over-stretches); multi-line content wraps. Mobile: bottom-anchored with safe-area inset (the viewport already does this); desktop top-center.
- **Motion (frontend-design):** brief slide+fade entrance, staggered when multiple stack; exit on dismiss; respects `prefers-reduced-motion`. Tokens only (no hardcoded color/timing literals beyond the documented duration constants).

#### Dialog/popup primitive

Generalize the dialog shell into a reusable, **non-alert** `Dialog` primitive over base-ui `Dialog` (distinct from the `alertdialog` confirm path): the styled popup shell (backdrop, brand-consistent panel, title/description slots, close affordance, mobile bottom-sheet ↔ desktop centered responsive behavior the current confirm dialogs already hint at). The confirm-dialog becomes one consumer (its alert variant); SP5's inquiry popup (AD7) and any future modal compose the same shell instead of re-styling base-ui ad hoc. Ships the primitive only — no new modal surfaces in 3b.

#### Onboarding IA + navigation skeleton (A12 / U3)

- **Active-state fix:** the nav matcher must not let `/onboarding` (or any non-`/account` route in the `(account)` group) light the Account affordance, and onboarding must not appear "foreign." Correct the matcher / nav config so the active-state is accurate on `/onboarding`. (The register notes a `startsWith("/account")` matcher as the U3 root; the live matcher is the prefix-aware `isActiveSection` — the plan confirms the exact mis-highlight against seeded onboarding states before changing it.)
- **Navigation skeleton primitive:** a small reusable "wayfinding" affordance — a clear way **back to the site** plus a section/step indicator — applied to `/onboarding` and available to any other dead-end page (every page has a way back/forward, per roadmap §SP3). Industry guidance: for a flat hierarchy (1–2 levels) breadcrumbs are unnecessary; instead clearly indicate the top-level section / provide an explicit back affordance — which is exactly onboarding's need. Onboarding keeps its existing 2-step `StepBar`; it gains the exit affordance it lacks today.

#### Admin "needs attention" seam (AD5 setup)

- **Nav-badge primitive:** a reusable count/attention badge for nav affordances (wordmark / tab / drawer item). Red attention state + numeric count; contrast-checked against its backgrounds; shown only when the count is actionable (industry rule — a badge that is always present loses meaning). Accessible name announces the count ("3 items need attention").
- **Attention-counts seam:** define the typed shape of an `attentionCounts` provider — `{ pendingApprovals, newInquiries, flaggedConflicts }` (exact fields confirmed in the plan against the real queries) — and the injection point in the admin nav, **without** wiring live data. **SP5 (admin overhaul) wires the real counts + final placement** (AD5). 3b ships the primitive + seam shape so SP5 has a typed socket to fill.

#### Feedback conventions

A short convention doc (in `docs/`) stating the rule SP6 enforces — **every user action produces visible feedback**, and which primitive serves which case (toast for transient async results, inline for field/validation, redirect/route change for navigation outcomes, confirm-dialog for destructive intent). Plus the **return-to-top** affordance (U9) defined as a primitive here. This is the _rule + primitives_; the sitewide application is SP6.

## Industry validation (standing rule)

- **Confirm dialogs:** the promise-based imperative hook is the recommended pattern for linear "are you sure?" control flow (lets the prompt embed in the action's flow); destructive confirmations should use `role="alertdialog"`, focus the least-destructive action, and carry an accessible name via the title. Validates the A2 seam choice + the a11y hardening.
- **Toasts:** typical duration 2–6 s; success ~5 s, errors longer or persistent; pause on hover/focus; `role="status"`/`aria-live="polite"` for confirmations, `role="alert"` for errors; toasts with interactive elements should move focus and be persistent (not transient live regions). Validates the type-based policy.
- **Navigation skeleton:** for flat hierarchies breadcrumbs are not needed — indicate the top-level section / provide an explicit back affordance instead. Validates "standalone + skeleton" over a breadcrumb system for onboarding.
- **Notification badges:** red attention state + count; surface the count only when actionable and infrequent (otherwise it becomes noise); ensure badge/background contrast. Validates the attention-badge primitive design.

Sources:

- https://medium.com/@jaredloson/a-replacement-for-window-confirm-using-promises-and-react-hooks-cfc011e76a7a
- https://akashhamirwasia.com/blog/building-expressive-confirm-dialog-api-in-react/
- https://www.radix-ui.com/primitives/docs/components/alert-dialog
- https://www.sarasoueidan.com/blog/accessible-notifications-with-aria-live-regions-part-2/
- https://carbondesignsystem.com/components/notification/accessibility/
- https://www.nngroup.com/articles/breadcrumbs/
- https://www.patternfly.org/components/notification-badge/design-guidelines/

## Execution order (plans expand into tasks)

**Plan A — codebase deepening** (runs first):

1. A14 — extract `toRuleSettings()` + `validateSlot()` into shared; repoint the 4 cores.
2. A16 — surface parsed input on `BookingQuoteArtifacts`; drop `create-core` re-parse.
3. A13 — add the `service-booking` characterization test, then extract `useBookingScheduler`; reparameterize the 3 hooks.
4. ADR for the shared-scheduler-hook + shared-slot-validation decisions.

**Plan B — IA + UI primitives:**

1. Confirm-dialog unification (A2) — unified `useConfirm` (pending + visual + a11y), migrate `inquiry-list`, delete the `ui/` duplicate.
2. Dialog/popup primitive — extract the shared shell; confirm-dialog composes it.
3. Toast redesign (U7) — type-based duration, ARIA roles, content-clamped sizing, motion.
4. Onboarding IA + nav-skeleton primitive (A12/U3) — fix active-state, add the wayfinding affordance.
5. Admin attention-badge primitive + attention-counts seam shape (AD5 setup).
6. Feedback-conventions doc + return-to-top primitive (U9 build).

## Definition of done

- **Plan A:** A13, A14, A16 consolidated; behavior-preserving (named-test gates + boundary lint + typecheck green); pruned from the register.
- **Plan B:** A2 + A12 pruned from the register; U7 build + U3 active-state resolved (sitewide application noted as SP6); AD5 noted as primitive-ready (SP5 wires counts).
- Each primitive has a unit/interaction test; each migrated call site verified desktop **and** mobile + breakpoint transition; a11y checked (focus order, ARIA roles, contrast).
- Design tokens only — no hardcoded colors/timings beyond documented duration constants (constitution).
- ADRs + any new `docs/` convention committed; same-commit doc rule honored.
- Both plans satisfy the WORKFLOW.md handoff contract (self-contained, dependency-ordered, subagent-executable).
- HANDOFF Progress + Session log updated.

---

_Last reviewed: 2026-06-10_
