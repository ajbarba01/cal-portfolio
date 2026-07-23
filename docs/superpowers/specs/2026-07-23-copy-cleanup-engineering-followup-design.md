# Copy-cleanup engineering follow-up — design

> Fixes the code defects the writing-voice cleanup pass surfaced but deliberately
> did not fix. That pass was a copy pass: it applied four copy rewrites and
> recorded everything else. This plan closes the twelve `route:engineering` rows
> in `docs/content/voice/copy-register.md` and the four `route:component` rows,
> and routes the three `route:copy-sync` rows to Cal.
>
> Source of truth for every finding is the register. Each row's Note carries the
> full trace — what leaks, where it renders, which consumer — verified against
> source during the cleanup pass. This spec does not re-derive those traces; it
> designs the remedy.

## Why this exists

The cleanup pass found that most of what it surfaced was "a defect wearing copy's
clothes rather than a copy defect" (spec Outcome, `2026-07-22-writing-voice-design.md`).
A conservative writing standard changed almost no text; what it exposed instead
was a cluster of failure-path bugs where the code shows a user the wrong thing.
Two patterns from that pass bind this one:

1. **The extraction blind spot.** The audit's extractor only ever saw string
   literals, so a user-facing message assembled at runtime from a variable was
   invisible to it. Eight of the findings here were found by reading code around a
   literal, not by the extraction surfacing the leak. The register warns the set
   may be incomplete — so when this plan touches a failure path, it sweeps
   siblings for the same class rather than fixing only the named line.
2. **Every review miss was a false claim, never a false flag.** Across seven
   audits, the flagged strings held up; the confident assertions around them did
   not. This plan treats each finding's Note as reliable and each fix's own
   "confirmed" claim as the thing to verify.

## Scope

**In scope — twelve `route:engineering` + four `route:component` findings**, grouped
into four sub-projects below.

**Out of scope — three `route:copy-sync` findings** (A1, A2, F3). These need Cal's
approval, not an engineering fix, and are routed through the copy-sync protocol
(`docs/CONTENT.md`, `/copy-sync`), never by editing source:

- **A1** (`layout.tsx:35`), **A2** (`(marketing)/page.tsx:93`) — the two
  `<meta name="description">` strings; adjective-only second sentences that need a
  specific fact only Cal can supply. No drafts doc exists; surface them to Cal
  directly at close-out.
- **F3** (`term-descriptions.ts:19`) — "Per cat, including the first." is factually
  wrong on a cats-only booking. Already recorded in
  `docs/content/pricing-language-drafts.md` awaiting Cal. Not fixed in source — the
  standard forbids correcting a fact, and this file routes through copy-sync.

**Also out of bounds** (cleanup-pass exclusions, still binding): `src/content/marketing.ts`,
anything rendered via `<MarketingCopy>`, `src/content/rover-reviews.ts`,
`src/features/notifications/emails.ts`, `src/app/showcase/**`.

## Decomposition — one plan, four sub-projects

The twelve engineering findings do not cleave into three equal thirds. They split
by _kind of change_: mechanical error-plumbing that is testable now with no human
decision (SP1, SP2), versus decision-gated copy-vs-code truth (SP3). The four
component findings are a fourth, separate domain (SP4). One plan and one ledger
hold all four; sequencing puts the highest-harm mechanical work first and the
decision-gated work last, so a pending human decision cannot stall the rest.

### SP1 — Internal error leaks (Class 1; leads the plan)

**Findings:** F4, F1, F2, C1. The code interpolates an internal error object into
a message a real person reads. The leaking value is a variable, so no wording
change helps.

**Remedy contract.** At each failure path: stop interpolating the internal value;
show a clean, static, user-language message client-side; and where a server
boundary exists, `console.error` the raw value first (the repo's established
server-log idiom — there is no logger utility). Where the raw error is read
client-side with no server boundary (a client hook querying Supabase directly),
drop the raw value from the UI and keep only the static message.

- **F4 leads — the most serious finding of the pass.** `computeBookingArtifacts`
  (`booking-service-shared.ts:506`) returns
  `{ kind: "validation_error", message: parseResult.error.message }` on a failed
  `safeParse`. In zod v4 that `.message` is the `JSON.stringify`d issues array —
  `code`, `path`, `pattern` — and it reaches users with no wrapping text on three
  surfaces (public create, edit, admin book-on-behalf). Fix at the source: catch
  the parse failure and substitute a clean message derived from
  `parseResult.error.issues` before it leaves `computeBookingArtifacts`; log the
  raw issues server-side.
  - **Sub-decision (settled):** the substituted message is **generic-static**
    ("Please check your entries and try again." or similar), not field-aware. The
    client already validates once before submit, so this server-side parse failure
    is an edge path; a generic message is enough and avoids re-deriving zod's
    per-field mapping. Field-aware remains a possible plan-level refinement if the
    implementer finds a clean issues→field map already present.
- **F1** (`use-availability.ts:143`) — raw Supabase driver error into an
  `ErrorState` on all three booking surfaces plus the meet-greet scheduler
  (`meet-greet-scheduler.tsx:183-184`). Static message; the sibling
  `submit-action.ts` toast ("Something went wrong. Please try again.") is the
  house shape to match.
- **F2** (`create-intent.ts:183`) — same shape on the prepay button
  (`prepay-button.tsx:49`). This is a server action, so log server-side.
- **C1** (`meet-greet-scheduler.tsx:176`) — raw union tag (`result.kind`)
  interpolated into a client-facing toast after a failed meet-greet booking.

### SP2 — Discarded `.message`, bare tag shown (Class 2)

**Findings:** G1, G2, G4, G5, G6, G7. The action carries a usable `.message`; the
UI shows the internal `kind` tag instead. **G7 is on the PUBLIC signed-out
`/contact` page.**

**Remedy.** Apply the guard two sibling files already use correctly —
`settings-client.tsx:178-182` and `reviews-client.tsx:104-108`:

```
"message" in result ? result.message : `Action failed: ${result.kind}`
```

at each unguarded site (G1, G2, G4). G5/G6/G7 are the raw-driver-text variant
inside server cores — their Notes name additional unguarded branches in the same
functions (e.g. `create-client-actions.ts:139`, six branches in
`onbehalf-actions.ts`, two in `inquiry-actions.ts`); those siblings are fixed
in-scope per the nearby-class hunt, using SP1's static-message-plus-server-log
contract.

**Regression guard.** A second inline ESLint plugin in `eslint.config.mjs`,
modeled on the existing `no-drift` plugin (`eslint.config.mjs:42-104`), that flags
the shape both classes share: template-literal interpolation of a `.kind` member,
or of a raw `.message`/error object, in user-facing surface files. This is a
heuristic that catches the _shape_, not a proof; it carries the same
`eslint-disable`-with-reason escape valve the existing rules do. The exact
selector and file scope are a plan-level detail; that a rule of this shape belongs
here is settled.

### SP3 — Copy claims the code does not perform (Class 3; decision-gated, last)

**Findings:** G3, K5. These are product decisions, not cleanups, so they sequence
last and each surfaces its decision to the maintainer before implementation.

- **G3** (`bookings-calendar-client.tsx:538`) — "The client is refunded in full
  and notified." "Refunded in full" is code-backed (admin cancel forces
  `fullRefund: true`). "Notified" is not: `booking_cancelled` is deliberately
  absent from the notifier vocabulary, and no cancel path constructs a `Notifier`.
  **Decision:** build the cancellation notification, or drop "and notified." from
  the copy. **Caveat carried from the register:** a Stripe dashboard setting could
  email the client on refund independently of the app — invisible from code.
  Confirm this before assuming the client is or isn't notified; it does not make
  the app's own copy code-backed either way.
- **K5** (`profile-schema.ts:21`) — "Enter a valid 5-digit ZIP code" understates a
  regex that also accepts ZIP+4. **Decision:** fix the message or tighten the
  regex. **Lean (settled unless the maintainer objects):** fix the message to
  match the regex (accept ZIP+4), since ZIP+4 is a valid US postal code and
  narrowing the regex would reject legitimate input.

### SP4 — Component-convention fixes (components)

**Findings:** K3, K4, A3, D2. Real, but neither code-error nor copy — a separate
component domain, folded in here as a fourth sub-project.

- **K3** (`profile-fields.tsx:95`), **K4** (`profile-fields.tsx:130`) —
  `FieldGroup.title` strings carrying a hand-typed "(optional)" suffix because the
  optional-suffix convention only reaches `FormField` labels, not `FieldGroup`
  titles. Fix: teach `FieldGroup` titles the convention (component change); the
  copy itself is correct.
- **A3** (`services/page.tsx:271-273`) — the `/services` zero-state renders a raw
  `<p>` where sibling zero-states (`gallery/page.tsx:54`, `reviews/page.tsx:61`)
  use the shared `<EmptyState>`. Fix: swap to `<EmptyState>`; copy is fine.
- **D2** (`scheduler/legend.tsx:45`) — a `Your booking` legend key describing a
  swatch that can never render on the admin book-on-behalf flow (`myBookings` is
  hardcoded empty there). Fix: conditionally render this entry the way its sibling
  `Premium day` key already is (`legend.tsx:72-73`); a component change, not a
  wording swap.

## Cross-cutting constraints (bind every sub-project)

- **Nearby-class hunt.** The extraction only saw string literals; eight findings
  hid in runtime-assembled messages. When a task touches a failure path, sweep
  siblings for the same class before closing it. Several Notes (G5, G6, G7) already
  name specific extra branches — those are in-scope.
- **Test coupling.** Tests assert exact strings. Any changed message ships its test
  update in the SAME commit. Grep first:
  `grep -rln "<string>" src --include=*.test.ts --include=*.test.tsx`.
- **Do not run bare `npm test`.** Three `.integration` suites plus
  `booking-service.test.ts` and `create-booking.mutation.test.ts` are DB-backed and
  need the local Supabase stack — 38 fail without it, pre-existing, not a
  regression. Gate each task on its own per-task unit suite, not `vitest run`.
- **Register is the live status board.** When a finding is fixed, flip its row's
  verdict from `route:engineering` (or `route:component`) to `fixed (<commit>)`.
- **Out of bounds:** the exclusions listed under Scope. Cal uses they/them — never
  a gendered pronoun for Cal.
- **Commits & docs.** Work on `main`, no worktree, stage by name. Subject-line-only
  Conventional Commits — no body, no trailers, no "Generated with" footer, no
  internal identifiers (no plan names, phase numbers, ticket IDs). Same-commit doc
  rule; run `node scripts/check-doc-links.mjs` when docs change.

## Sequencing

1. **SP1** (F4 first, then F1, F2, C1) — highest user harm.
2. **SP2** (G1, G2, G4 guard; G5, G6, G7 core-side; then the lint rule).
3. **SP4** (K3/K4, A3, D2) — independent; any time after SP2.
4. **SP3** (G3, K5) — last; each surfaces its decision to the maintainer first.

## Verification & testing

- Each message change is verified by its updated unit test in the same commit, run
  as a scoped suite (not `vitest run`).
- SP1/SP2 fixes are verified by reading the consumer chain named in each Note to
  confirm the clean message reaches the surface and the raw value no longer does.
- The SP2 lint rule is verified by confirming it flags the pre-fix shape and passes
  the post-fix code (and that `npm run lint` stays green repo-wide).
- Close-out: register rows all flipped to `fixed`, A1/A2 surfaced to Cal, F3 left
  for Cal, doc links clean.

## Execution method

`writing-plans` to produce the implementation plan, then
`subagent-driven-development` to execute it. Sonnet for subagents — opus was
blocked twice by a content filter on this program's earlier writing tasks.
`systematic-debugging` applies per finding, since this is a bug-fix program.

---

_Last reviewed: 2026-07-23_
