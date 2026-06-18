# Pricing P3 — enforce constraints + render approval reasons

Phase 3 of the pricing-engine overhaul. Phase 1 (engine core) shipped a Zod-validated
`{ modifiers, constraints }` config and a typed `approvalReasons` array on the quote
preview, but neither the constraints nor the reasons are yet consumed by the UI. This
spec covers both, as a single implementation.

- **Render half:** surface `BookingQuotePreview.approvalReasons` in the price panel.
- **Enforce half:** make the booking pickers obey `ServicePricingConfig.constraints`.

Source of record for prior phases: `.git/sdd/progress.md`, `docs/superpowers/PRICING-HANDOFF.md`.

## Decisions locked (from brainstorming)

- **One spec, both halves**, implemented together.
- **Seeded constraints are authoritative.** Enforcement adopts the seeded values as the
  intended product rules; the resulting behavior changes are accepted (see below). We do
  NOT change seeded constraint values in this phase.
- Constraints reach the client by **carrying the full `Constraints` object on the client
  `ServiceDetail`** (approach A) — not flat per-field, not re-parsed client-side.

### Accepted behavior changes (sign-off granted)

Enforcing the seeded constraints diverges from today's hardcodes:

| Service           | Today (hardcoded)         | Seeded constraint | Effect when enforced                                                        |
| ----------------- | ------------------------- | ----------------- | --------------------------------------------------------------------------- |
| house_sitting     | species dog, cat          | all 7 species     | **inert** — `pets.species` is a dog/cat enum, so no other species can exist |
| walk              | maxPets unlimited         | maxDogs 2         | walks cap at 2 dogs                                                         |
| walk              | duration floor 15, no cap | 30–180 min        | walk length clamped                                                         |
| check_in          | duration floor 15, no cap | 15–60 min         | clamped                                                                     |
| training          | duration floor 15, no cap | 30–60 min         | clamped                                                                     |
| check_in/training | interval from duration    | intervalMin 5     | finer slot-start grid                                                       |

## Current state (what exists)

- `Constraints` / `ServicePricingConfig` types: `src/features/pricing/modifier-types.ts`.
  `Constraints = { intervalMin, minDurationMin?, maxDurationMin?, maxDogs?, allowedSpecies, softDistanceWarnMiles? }`.
- `BookingQuotePreview.approvalReasons: ApprovalReason[]` already carried end-to-end
  (`quote-core.ts`); each reason is `{ code, message, severity: "info" | "warn" | "block" }`
  with client-ready `message`. Built by `deriveApprovalWithReasons` (`pricing/distance.ts`).
- `quote-panel.tsx` renders only a generic _"Requires Cal's approval before it is
  confirmed."_ line and a separate admin `warnings` Alert.
- `ServiceDetail` (`service-detail.ts`) carries `slug/name/description/pricingType/defaultDurationMin`
  — **no constraints.**
- Pickers hardcode constraint-shaped values per `pricingType`:
  - `use-booking-scheduler.ts`: `allowedSpecies = house_sitting ? [dog,cat] : [dog]`;
    `maxPets = training ? 1 : null`; `durationMin` clamped only by `Math.max(15, …)`.
  - `pet-assignment.tsx`: already filters by an `allowedSpecies` prop and honors a
    `maxSelect` prop, but the at-cap toggle is a **silent no-op** and `subtitle`/avatar
    assume dog-or-cat only.
  - `quantity-forms.tsx`: hours `NumberStepper` is `min 0.25, step 0.25`, **no max**.
  - `pet-avatar.tsx`: `PetSpecies = "dog" | "cat"`; icon is Cat-or-Dog only.

## Design

### Half 1 — Render approval reasons

In `quote-panel.tsx`, replace the generic approval line with the typed reasons:

- When `preview.approvalReasons` is non-empty, render each as a short row/list item
  styled by `severity`:
  - `block` → destructive/error treatment,
  - `warn` → warning/amber treatment,
  - `info` → muted/neutral treatment.
- Reuse the existing `Alert` component variants where they fit; messages are already
  client-facing prose, rendered verbatim.
- **Fallback:** if `requiresApproval` is true but `approvalReasons` is empty, keep the
  existing generic line so we never show an unexplained-but-silent approval state.
- The admin `warnings` Alert is unchanged (separate concern: override notices).
- No change to amounts, gating, or the `approvalWillReReview` / `priorFinalCents` blocks.

### Half 2 — Enforce constraints

**Plumb constraints to the client.**
Add `constraints: Constraints` to `ServiceDetail`. Populate it wherever a `ServiceDetail`
is built for the booking UI — the self-serve `book/[serviceSlug]/page`, and the admin
create/edit surfaces that construct a `ServiceDetail`. `services-repo` already parses
`pricing_config`, so the constraints object is available at the seam; thread it through
without re-parsing.

**Scheduler (`use-booking-scheduler.ts`).** Replace the hardcodes with constraint reads:

- `allowedSpecies` ← `service.constraints.allowedSpecies`.
- `maxPets` ← `service.constraints.maxDogs ?? null`.
- Duration bounds: derive `minHours`/`maxHours` from `minDurationMin`/`maxDurationMin`
  (÷60) and pass them to the quantity form; keep the existing `Math.max(15, …)` minute
  floor as a backstop.
- `intervalMin`: wire `constraints.intervalMin` into the slot-grid capability that today
  derives interval from chosen duration. (Treat as the start-time grid granularity; keep
  current behavior where a constraint is absent.)

**Duration picker (`quantity-forms.tsx`).** Accept optional `minHours`/`maxHours` and pass
them to the hours `NumberStepper` (`min`/`max`), clamping on change. Copy stays accurate.

**Pet picker (`pet-assignment.tsx`).** Feed `allowedSpecies` and `maxSelect` from
constraints (already prop-driven). Add **at-cap feedback** — when a toggle is blocked by
`maxSelect`, show a brief inline notice (e.g. "Up to N dogs per walk") instead of a silent
no-op. The dog/cat `subtitle` and `PetAvatar` are left as-is.

**No species expansion.** `pets.species` is the Postgres enum `pet_species ('dog','cat')`
(`20260603130000_pets_generalization.sql`) and the creation form/Zod restrict to dog/cat,
so no other species can exist. House-sit's seeded `allowedSpecies: [all 7]` is therefore
inert — the picker filter behaves identically to today. We keep the config value
(authoritative; the P4 editor will surface it) but do NOT widen `PetAvatar`/labels — that
would be speculative code for data the schema forbids.

## Testing

- **Render:** unit tests that `quote-panel` renders a row per `approvalReasons` entry with
  the correct severity treatment, and falls back to the generic line when reasons are empty
  but `requiresApproval` is true.
- **Enforce:** unit tests on scheduler derivation (constraints → `allowedSpecies`,
  `maxPets`, duration bounds, interval) and on the pickers (species filter, at-cap
  feedback, duration clamp). Prefer pure-logic assertions; where the scheduler's existing
  characterization tests cover the hardcodes, **update** them to the constraint-driven
  values — do not delete coverage.
- `tsc --noEmit` clean; pricing + booking unit suites green; pre-commit hook passes with no
  `--no-verify`.

## Out of scope

- **P4** admin pricing editor (rebuild `fieldsToConfig`/`pricingFields`).
- **P2** sourcing of `needyTier` / `anyDogUnder6mo` / `leashManners`.
- Changing seeded constraint **values** (locked: enforce as-is).
- Prod migration / deploy (held by maintainer for a deliberate window).

## Risks / notes

- House-sit's seeded `allowedSpecies: [all 7]` is inert today (dog/cat enum); enforcing it
  is a no-op for the picker. Left in config intentionally — do not "fix" it down.
- Controller policy: the working tree has unrelated uncommitted files (`TEMP.md`,
  `docs/DEV_NOTES.md`, `src/content/marketing.ts`, `SYNC.md`). Stage only this phase's files
  explicitly — never `git commit -am`.

---

_Last reviewed: 2026-06-18_
