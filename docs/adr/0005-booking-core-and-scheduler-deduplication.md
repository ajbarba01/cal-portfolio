# ADR-0005: Booking core + scheduler deduplication

**Status:** Accepted  
**Date:** 2026-06-10

## Context

SP3a relocated booking logic into per-concern cores (`create-core`,
`edit-core`, `reschedule-core`) and per-component hooks behavior-preservingly,
but its definition-of-done was no-behavior-change, so it could not consolidate
the duplication it moved verbatim. The fresh review logged three follow-ups:

- **A14** — the `SettingsRow → BookingRuleSettings` map plus the
  `passesGuards` / `fitsWindow` slot-validation pairing duplicated across
  `create-core`, `edit-core` (×2, incl. `previewEditCore`), and
  `reschedule-core`.
- **A16** — `create-core` re-running `createBookingInputSchema.parse(rawInput)`
  that `computeBookingArtifacts` had already parsed and discarded.
- **A13** — three ~90%-duplicated booking-scheduler hooks
  (`use-service-booking`, `use-edit-booking`, `use-admin-create-booking`).

## Decision

### A14 — shared rule-settings mapping only

`toRuleSettings(settings)` lives in `booking-service-shared` (the "≥2 cores"
home); all four core call sites use it instead of an inline 4-field literal.
This removes the literal-drift risk the read-only `previewEditCore` twin exists
to guard against.

The guard/window **pairing** was deliberately **not** consolidated (no
`validateSlot` runner was extracted). The four cores do not share a clean
pairing: each gates `passesGuards` / `fitsWindow` behind its own policy flags
(`skipHoursLeadGuards` / `skipWindowFit`), short-circuits between them, fetches
`openWindows` lazily, and `editBookingCore` vs `previewEditCore` diverge
intentionally on warning-vs-silent admin-skip behavior. A combined runner would
change behavior (eager window fetch, lost short-circuit, lost divergence),
violating the behavior-preserving rule — so it was left out rather than shipped
as dead, drift-prone code.

### A16 — reuse the parsed input

`computeBookingArtifacts` surfaces its already-parsed input on
`BookingQuoteArtifacts.input` (`z.output<typeof createBookingInputSchema>`);
`create-core` reads `result.artifacts.input` instead of re-parsing. On the
success path (the only path that reaches the old re-parse) the value is
identical, so behavior is preserved while the redundant validation +
divergence risk are removed.

### A13 — shared `useBookingScheduler` substrate

A `useBookingScheduler` primitive (`src/features/booking/use-booking-scheduler.ts`,
exported from `index.client.ts`) owns the substrate that was byte-identical
across the three hooks: date/calendar plumbing, the pricing-type → mode
derivation, the controlled scheduling inputs (quantities / pets / recurring /
occurrence count), selection state (`selectedStart` / `range`), duration, the
availability + busy wiring, the capabilities/`schedulerData` memos, the derived
booking time (`stay` / `startsAt` / `endsAt` / `nights` / `hasSelection` /
`petsOk`), the debounced live preview (400 ms timer + preview `useTransition`),
and the Scheduler-selection bridge (`onSelectionChange` + `@`-cell parsing).

Each of `use-service-booking` / `use-edit-booking` / `use-admin-create-booking`
is now a thin wrapper supplying only its deltas: its own quote-state shape, its
preview body + result handling, its quote gate, its "clear on idle" / "clear on
selection-change" bodies, and its submit handler + return-shape extras.

Two wiring decisions made the extraction behavior-preserving:

- **Wrapper deltas flow in by ref.** Because some gates depend on the shared
  hook's derived values (e.g. edit's gate depends on `patchEmpty`, which depends
  on the shared `startsAt`/`endsAt`), the wrapper passes `canQuoteRef` /
  `runPreviewRef` / `clearOnSelectRef` / `clearOnIdleRef` into the shared hook
  and updates them in its own ref-only effect. The shared `onSelectionChange` /
  `requestQuote` read these at fire-time, so they keep stable identities while
  running the wrapper's freshest logic.
- **The IO hooks are injected, not imported.** The wrapper passes
  `useAvailability` / `useBusyRanges` / `useOvernightNights` in as `io`. This
  avoids a circular import (`index.client` re-exports `useBookingScheduler`) and
  lets the barrel's IO mock flow through in tests.

Load-bearing invariants are preserved verbatim (SP3a regression history):
`onSelectionChange` stays a `useCallback` with deps `[mode]` (an unstable
identity re-fires the Scheduler's subscription effect → render loop, the bug
fixed in commit `99040d4`); the live-quote debounce stays 400 ms via the timer
ref; the latest-input sync stays a ref-only effect (no setState — the repo's
eslint bans set-state-in-effect).

### Hook-test stack added

A13 is the high-risk dedup, but the existing "integration" tests exercise the
booking-service **cores**, not the React hooks — the three hooks had zero
coverage and the repo had no DOM/hook test stack. So `@testing-library/react` +
`jsdom` were added as devDeps and `vitest.config.ts` now includes `*.test.tsx`
(DOM-dependent tests opt into jsdom per-file via a `// @vitest-environment jsdom`
docblock, keeping the node integration tests unchanged). A characterization
test pins the load-bearing `useServiceBooking` invariants (no-selection,
`onSelectionChange` identity stability, cell-parse derivation, 400 ms debounce)
as the safety net the extraction kept green.

## Consequences

**Positive:**

- A fix to the rule-settings mapping, the quote debounce, the selection bridge,
  or the `@`-cell parsing is made once, not 2–4×.
- `useBookingScheduler` is the single place future scheduler behavior changes
  land; wrappers stay free to diverge on submit/gating/quote-state without
  copying the substrate.
- The repo now has a hook/component test stack, so future client-state logic is
  testable without a browser.

**Trade-offs:**

- The wrapper-ref wiring (four refs + a ref-only sync effect) is more indirect
  than three self-contained hooks; it is the cost of keeping the shared
  `onSelectionChange` / `requestQuote` identities stable while their bodies read
  per-wrapper logic. The invariants are documented inline at each ref.
- A14 shipped only the settings-map helper, not a full slot-validation runner;
  the guard/window pairing stays written out per core (by design — see above).

---

_Last reviewed: 2026-06-10_
