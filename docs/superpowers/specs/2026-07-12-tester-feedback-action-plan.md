# Tester-feedback action plan (2026-07-12)

Triage of the `docs/DEV_NOTES.md` "## now" snapshot (tester feedback + maintainer todos).
Every item was evaluated against the codebase; decisions below were confirmed with the
maintainer in-session. Grouped by shared surface so each group can become one spec/plan
cycle. Architectural causes preferred over symptom patches throughout.

**Legend:** each item lists the original note, the verdict (evaluated, not taken at face
value), and the agreed action.

---

## A. Form system standardization — _architectural, highest priority_

**Root cause:** every form hand-rolls `useState` + `useTransition` + ad-hoc error
rendering. Server-action round-trips discard client state; required-field indicators
differ per form.

**Decision:** adopt **react-hook-form + `@hookform/resolvers/zod`** (zod schemas already
exist for every form via the form registry). Build one RHF-aware `Form`/`FormField`
layer in the component system, then **migrate all forms in this pass** — onboarding
first (worst offender), then booking, contact, account, admin.

| Item (source)                                                                                                      | Verdict                                    | Action                                                             |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------ |
| "need proper form validation and standardization throughout site… onboarding form clears all information on error" | Confirmed; architectural                   | RHF adoption + full migration                                      |
| "When not filling in required information, the information that was entered was cleared"                           | Same root cause                            | Fixed by client-side validation before submit + preserved state    |
| "random ass indicator when you don't fill out a required input in contact page" (was NOT-MVP)                      | Same root cause — promoted into this group | One required-indicator + error-message convention in the RHF layer |

## B. Species model — _architectural_

**Root cause:** species knowledge exists in exactly one correct place (booking gate:
`pet_walk` is dog-only in `required-profiles.ts`) and is missing everywhere else.

**Decision:** small pure **species-capability module** (species → walkable? → applicable
form fields), consumed by pet forms, profile field groups, and booking quantity forms.
Species set expands to **dog + cat + small animals**.

| Item                                            | Verdict                                                                                               | Action                                                                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Pet besides cat and dog?"                      | Confirmed — pet form hardcodes dog/cat radio while pricing copy already says "each additional animal" | Expand species options (dog, cat, small-animal set); trace every `species` reader (pricing per-species tiers, walk gate, DB constraint) in the plan |
| "shouldn't allow you to add walk time for cats" | Confirmed — house-sitting "Walk time per day" stepper shows regardless of assigned pets               | Hide walk stepper when no dogs assigned (mind flow ordering: pet assignment vs quantities)                                                          |
| "'With other dogs' shows up on form for cat"    | Confirmed — `pet_care` field groups are species-agnostic                                              | Species-conditional fields in field-group config (same predicate pattern as `required-profiles.ts`)                                                 |

## C. Client self-service lifecycle

| Item                                                                 | Verdict                                                                                       | Action                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "can't cancel a booking"                                             | Confirmed — `cancelBookingCore` + full refund/debt policy math exist but are wired admin-only | **Client cancel, always allowed pre-start**, with confirm-preview: full refund / late partial refund (`needsCalReview` flags remainder for Cal) / fee owed when unpaid (`computeCancellationDebtCents`). New `clientCanCancelBooking` predicate (cancel policy ≠ edit policy — paid bookings ARE cancellable). Pulls the highest-value slice of the booking-mutation-overhaul roadmap forward |
| "Can't edit or delete a review… at least within a timeframe"         | Confirmed — `submitReview` only                                                               | Owner can **edit + delete own review anytime, no window** (industry standard: Google/Yelp/Rover). Rover-imported reviews excluded                                                                                                                                                                                                                                                             |
| "There should be a link to make an inquiry on 'your inquiries' page" | Confirmed — list/edit/resolve only                                                            | Add new-inquiry CTA linking to contact form. Trivial                                                                                                                                                                                                                                                                                                                                          |
| "Didn't actually let me book even though it said available"          | No repro                                                                                      | **Investigation task**: gather tester details, check logs, reproduce against availability logic before any fix                                                                                                                                                                                                                                                                                |

## D. Address & service area

| Item                                                          | Verdict                                                       | Action                                                                                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "No field for apartment / unit"                               | Confirmed — single free-text address line + ZIP               | Optional `address_line2` (column, schema, onboarding, admin display)                                                                                              |
| "max distance away you can live… pop up if zip outside range" | Agreed; no service-area concept exists — build once, properly | Admin-configured **ZIP allowlist** setting + pure `isInServiceArea(zip)`; **warn on address save + out-of-area bookings force requires-approval** (no hard block) |

## E. Admin service config

| Item                                                                                 | Verdict                                                       | Action                                                                                                                                       |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| "requires approval won't save without default duration — should I just do 1 minute?" | Validation bug/design fault — never answer with a magic value | Investigate why services editor requires default duration for nights-based services; make duration required only where the scheduler uses it |
| "there should be a max 'max hours cal can be away'"                                  | Stepper already caps at 24 (meaningless)                      | Clamp bounds to **0–12 hours**                                                                                                               |

## F. Pricing language & definitions

**Mechanism (kills 5 items):** optional `description` on pricing modifiers/breakdown
rows, rendered as an info-tooltip (tap on touch) in the pricing breakdown and quote
receipt. Plus a general tooltip pass wherever users would expect one.

| Item                                                                       | Verdict                                                                                                                                                                                       | Action                                                                                                    |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| "'each cat' confusing, maybe 'each additional cat'"                        | Tester's rename would be **wrong**: `flat_per_unit` cat pricing charges every cat incl. the first ("each additional" is the separate `tiered_per_unit` label). Confusion real, fix is clarity | Keep label; add description "per cat, including the first"                                                |
| "'each additional animal' → 'each additional small animal'"                | Agreed; consistent with species scope                                                                                                                                                         | Label change                                                                                              |
| "is 'premium night' too confusing?"                                        | Agreed                                                                                                                                                                                        | Draft rename **"Holiday & peak-date rate"** + description; Cal approves via copy-sync                     |
| "Long stay, extended stay, needy pet care should be defined" (×2, deduped) | Agreed                                                                                                                                                                                        | Descriptions via the tooltip mechanism; draft "needy pet care" → **"extra-attention care"**; Cal approves |
| "tooltips for some hovers" (maintainer)                                    | Pricing terms for sure + wherever users expect                                                                                                                                                | Tooltip primitive in component system + audit pass for expected-tooltip spots                             |

## G. Content & copy

| Item                                                                            | Verdict                                                                                                                                       | Action                                                                                                                                          |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| "the 764 number is not ASPCA, it's Pet Poison Control"                          | **Confirmed correctness bug** — resources page lists (855) 764-7661 (Pet Poison Helpline) under ASPCA's name; tap-to-call dials it as "ASPCA" | Split into two correctly-attributed entries: ASPCA APCC (888) 426-4435; Pet Poison Helpline (855) 764-7661. **Ship immediately**                |
| "replace 23 yrs old with 150+ pets served"                                      | Copy change (`about.stat.age`)                                                                                                                | Copy-sync change                                                                                                                                |
| "remove walks included leash manners" / "remove training included anxious dogs" | Copy removals (`service.walk.included.3`, `service.training.included.4`)                                                                      | Copy-sync removals                                                                                                                              |
| "more FAQ questions"                                                            | Needs content                                                                                                                                 | Draft FAQ candidates from tester-confusion themes (pricing terms, approval flow, service area, cancellation policy); Cal approves via copy-sync |
| "replace all gallery pictures with the new set"                                 | Blocked on asset delivery                                                                                                                     | Run `/gallery-sync` once Cal's edited album is exported. **Blocked-on-Cal**                                                                     |
| "no fade in for comments"                                                       | Reviews section missing the reveal treatment other marketing sections have                                                                    | Add matching reveal animation                                                                                                                   |

## H. Platform & ops

| Item                                         | Verdict                                                                                     | Action                                                                                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "ensure owing system"                        | Verification + surface audit                                                                | Audit `client-balance` projection + cancel/debt paths against two invariants: **client never overcharged; never wrongly blocked from booking**. Map + fill gaps in admin balance-modification surfaces (adjust/waive) |
| "email system and notification settings"     | Feature exists (booking emails, reminder/completion crons); settings absent                 | Verify all emails fire end-to-end in prod; **admin notification toggles** (client prefs later); **prettify email templates** in the same pass                                                                         |
| "Why is Emergency contact and Vet required?" | Requirement is correct for a solo sitter (answer: by design) — the friction point is timing | **Optional at onboarding, hard-required before first booking confirm** (the `owner` form gate already exists); verify current onboarding behavior first                                                               |
| "stripe deployment"                          | —                                                                                           | **Parked** — out of scope this pass (maintainer decision)                                                                                                                                                             |

---

## Suggested sequencing

1. **Quick wins, ship now:** ASPCA fix · inquiry CTA · max-away 0–12 clamp · stat swap · included-line removals · reviews fade-in
2. **Group A (form system)** — biggest root cause; unblocks consistent UX everywhere
3. **Group C cancel + Group H owing audit together** — both touch refund/debt paths; verify once
4. **Group B species + Group F pricing language together** — both touch pricing labels/config
5. **Group D service area · Group E admin config · Group H notifications** — independent, any order
6. **Blocked-on-Cal:** gallery assets · FAQ approval · wording sign-offs (batch into one Cal review)
7. **Investigation (parallel anytime):** "didn't let me book" availability bug

Each numbered tranche = one spec/plan cycle per repo workflow.

---

_Last reviewed: 2026-07-12_
