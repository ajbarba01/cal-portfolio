# Intake Forms Restructure

## Context

Phase 3 of the booking-refactors program shipped reusable Owner / Home / Pet
profiles plus a hard-block booking requirement gate (implemented locally,
**uncommitted, not pushed to prod**). Three follow-on gaps surfaced:

1. The three profile forms are too long — they bundle service-irrelevant fields
   (a quick dog-walk client fills sleeping arrangements; a cat owner sees a
   dog-walk form).
2. The booking flow's requirements section only **deep-links** to
   `/account/forms`; clients must leave the flow to complete profiles.
3. `/account/forms` doesn't show which services need each form, and pet forms
   aren't visibly grouped per pet.

`form_responses` already stores arbitrary `form_key` values + pet scope
(`pet_id`), so finer-grained forms need **no migration** — only registry,
manifest, schema, and UI changes.

This spec covers all three goals plus maintainer-requested additions
(field-level optional/required indicators, an additional-notes catch-all, a
per-form privacy disclaimer).

## Goals

- **G1 — Modularize forms** into a small set of cohesive, reusable forms: shared
  entity "core" forms plus thin service-specific add-ons, for both account- and
  pet-scoped forms. Map Cal's source forms (`FORMS.md`) to shared vs
  service-specific and account vs pet scope. Industry pattern (Time To Pet,
  Precise Petcare, Rover): reusable persistent profiles, fill-once-reuse, thin
  service add-ons, no over-fragmentation, one canonical pet profile.
- **G2 — Inline form completion** in the booking flow: show the compressed
  required forms inline and let the client complete/confirm them without leaving
  the flow, re-checking the gate after each save.
- **G3 — Account-page display**: each form card shows which services require it;
  pet-specific forms grouped in a per-pet accordion.

## Non-Goals

- No SQL migration (arbitrary `form_key` + `pet_id` already supported).
- No new cat-specific fields (`FORMS.md` has none); cats are handled by
  species-gating `pet_walk` off, not by inventing a cat form.
- No pet identity-column (`age`/`sex`/`weight`/`vet_*`) editing UI — out of scope.
- No prod migration push as part of this work (P3 migrations remain local;
  coordinate with maintainer separately).

## Form Decomposition (G1)

Five form keys replace the three monoliths.

### Account-scoped

| Key            | Source (`FORMS.md`)                              | Fields                                                                                                      |
| -------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `owner`        | Owner Form                                       | unchanged: primary owner, additional owners, emergency contacts; expense-auth e-sign stays on this card     |
| `home_access`  | Home Access (shared by check-in + house-sitting) | address, entry_instructions, alarm_instructions, wifi, breaker_location                                     |
| `home_sitting` | House Sitting: Home Care                         | sleeping_arrangements, home_care (mail/plants/trash/recycling), furniture_policy, house_rules, guest_policy |

### Pet-scoped

| Key                               | Source                                                                  | Fields                                                                                                                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pet_care` (core)                 | Per Animal: Medical, Behavior; House-sitting/Check-in: Feeding          | feeding (schedule/amount/location/treats), medical (current_medications/allergies/medical_history/emergency_history/vet_emergency_notes), behavior (friendly_strangers/friendly_dogs/friendly_children/behavior_comments) |
| `pet_walk` (add-on, **dog-only**) | Walks; Check-in Potty & Exercise; House-sitting Exercise/Transportation | route, pace, leash/harness location, off-leash permitted + tag, vehicle restraint instructions, **plus** "how to get in for the walk" (walk has no Home form)                                                             |

### Field-level additions (maintainer request)

- **Optional/required indicator on every field.** Required fields (owner
  name/phone, emergency #1 name/phone/relationship, home address + entry) keep
  Zod `min(1)` enforcement; UI shows an explicit marker for both states
  (required marker + "(optional)" text). Conveyed by text, never color alone
  (a11y floor). Because submit is hard-blocked until required fields are filled,
  the gate's "complete" status implies required fields are present.
- **`additional_notes`** — optional multiline catch-all on **all five** forms.
  (If maintainer prefers, may be omitted on `owner`; default is all five.)
- **Per-form privacy disclaimer** — one static line rendered by `form-card` on
  every form: _"If anything here feels too sensitive to share, you can leave it
  blank or write 'N/A' and reach out to Cal directly — we'll work it out
  together."_ Single source; wording tweakable by Cal.

### Registry / schema / field-group changes

- `form-registry.ts`: drop `home` + `pet` keys; add `home_access`,
  `home_sitting`, `pet_care`, `pet_walk`. Keep `owner`. Keep `emergency`
  (legacy). Each entry keeps `{schema, scope, title}`.
- Schemas: split `home-schema.ts` → `home-access` + `home-sitting`;
  split `pet-form-schema.ts` → `pet-care` + `pet-walk`; add `additional_notes`
  to each. `owner-schema.ts` unchanged except optional `additional_notes`.
- `profile-fields.tsx`: groups per new key; render optional/required indicator.
- Existing local `form_responses` rows under `home`/`pet` keys are orphaned, but
  P3 is uncommitted/local-only — no prod data to migrate. Noted, not handled.

## Manifest + Gate Core (G1, pure)

The manifest generalizes from `Record<PricingType, ProfileKey[]>` to a list of
requirement specs; pet-scoped specs carry an optional `species` predicate.

```ts
type AccountFormKey = "owner" | "home_access" | "home_sitting";
type PetFormKey = "pet_care" | "pet_walk";

type RequiredForm =
  | { key: AccountFormKey; scope: "account" }
  | { key: PetFormKey; scope: "pet"; species?: "dog" }; // omitted = any species

const REQUIRED_PROFILES: Record<PricingType, RequiredForm[]> = {
  house_sitting: [owner, home_access, home_sitting, pet_care, pet_walk(dog)],
  check_in: [owner, home_access, pet_care, pet_walk(dog)],
  walk: [owner, pet_care, pet_walk(dog)],
  training: [owner, pet_care],
  meet_greet: [owner],
};
```

`bookingRequirements()`:

- account entries → one `RequirementItem` each.
- pet entries → loop assigned pets; **skip pets whose species doesn't match the
  predicate** (cats skip `pet_walk`); emit one item per (key, petId).
- vacuous when no pets assigned (unchanged behavior).

`RequirementItem` carries `formKey` (replacing the coarse `profile`), plus
existing `petId`/`petName`/`status`. Inputs generalize:

- `accountForms: Partial<Record<AccountFormKey, string | null>>`
- `petForms: Record<petId, Partial<Record<PetFormKey, string | null>>>`

`statusFor` (complete/stale/missing, `FRESHNESS_WINDOW_DAYS = 180`) and
`requirementsSatisfied` unchanged. `repo.getFormStatuses` returns the richer
per-key/per-pet shape. **TDD this core first.**

A pure reverse-map helper `servicesRequiring(formKey)` (formKey → services that
require it) is added next to the manifest for G3, unit-tested.

## check_in + training pet-awareness (G2 prerequisite, bug fix)

`petAware` in `booking-service-shared.ts` becomes `house_sitting | walk |
check_in | training` (all but `meet_greet`). The dogs/cats **derivation** block
stays gated to house_sitting/walk (their pricing depends on headcount); check_in
and training are hours-only, so they only ownership-validate selected pets and
derive nothing. **Pricing/quantity impact: none** for check_in/training (quote
uses hours).

Pet selection UI must surface for all pet-aware services (it currently shows
only for house_sitting/walk). Per-service cardinality:

- house_sitting / walk / check_in → **multi-select**.
- training → **single-select, dog-only (max 1 dog)** per maintainer ("one dog
  per booking"). Picker filters to species=dog and caps selection at 1.

Verify the pet-picker in `quantity-forms.tsx` / `use-service-booking.ts` keys
off the shared pet-aware notion, not a hardcoded type list.

## Inline Form Completion (G2)

Replace the deep-link-only `RequirementsGate` with inline form-cards, reusing
`form-card` imported via the accounts barrel (`index.client.ts`), not a deep
path (boundaries lint rule).

`form-card` additions (shared by account page + booking flow):

- `status?: "complete" | "stale" | "missing"` drives initial open state:
  **missing → open empty**, **stale → open in edit mode + warning banner**
  ("filled over 6 months ago — review and save to reconfirm"),
  **complete → collapsed** with a Ready badge.
- `onSaved?: () => void` fires after a successful submit so the flow re-checks
  the gate.
- Disclaimer line (above) rendered in the form body — also benefits the account
  page.
- Stale save uses the normal submit path (saves edits **and** bumps
  `submitted_at`) — editing-then-save is the reconfirm. Pure-confirm
  `runConfirmForm` remains for the account page's lighter "still good" action.

Booking-flow gate behavior:

- Render the compressed list: complete items collapsed (Ready), incomplete items
  auto-expanded as editable form-cards.
- Dependencies = account forms (per manifest) **+ per-pet forms (pet_care,
  pet_walk) for each selected pet**.
- After any save, `onSaved` refreshes requirements (re-run the
  `profiles_incomplete` check + refetch statuses via the existing
  `profileRequirements` state). Submit stays hard-blocked until
  `requirementsSatisfied`.
- Same component on public + admin-create surfaces.
- `requirementLabel` + status map updated for the new form keys.

## Account-Page Display (G3)

`/account/forms` (`forms-client.tsx` + `page.tsx`):

- **"Required for" indicator per card** — derived from `servicesRequiring()`.
  Render small service labels (e.g. "Required for: House-sitting, Check-ins").
  Text labels, not color alone.
- **Per-pet accordion grouping** — account-scoped cards (owner, home_access,
  home_sitting) stay top-level; pet-scoped cards group inside a larger accordion
  per pet (heading = pet name), containing that pet's `pet_care` + `pet_walk`
  (`pet_walk` shown only for dogs, matching the gate). Uses existing primitives
  (Surface / ShimmerCard / Eyebrow); no new component, no drop shadows, mobile
  parity. Invoke `frontend-design` before building this UI.

## Testing

- **Pure core first (TDD):** manifest expansion per pricing_type; species
  filtering (cat skips pet_walk); complete/stale/missing; vacuous-when-no-pets;
  `servicesRequiring` reverse map. (Existing `required-profiles.test.ts` +
  `required-profiles.ts`.)
- Gate wiring: `profiles_incomplete` result threading unaffected in shape;
  update fixtures for new keys.
- check_in/training pet-aware: ownership-validate without headcount derivation;
  quote unchanged (assert hours-only price stable).
- Schemas: required enforcement (`min(1)`) on the required fields.
- Gate on **pure unit tests** (`npm run test`). Booking integration tests fail
  environmentally (fixed slots collide with local dev bookings) — not this work.
  Do **not** `supabase db reset`.

## Constraints

- Work on `main`, no worktree. Commit only when asked; subject-line-only
  Conventional Commits, no body/trailer/footer, no internal identifiers.
- TS strict, no `any`; design tokens only; a11y (status by label not color
  alone); no drop shadows; mobile parity. PowerShell mojibakes UTF-8 sources —
  use Edit/Write only.
- App → feature imports go through the feature barrel (`index.client.ts`).
- P3 is uncommitted; prod migrations are local only — coordinate commit/push
  with the maintainer; pause for approval before pushing prod migrations.

## Resolved Decisions

- `additional_notes` on all five forms, including `owner`.
- training pet picker is single-select, dog-only (max 1 dog).
- Disclaimer wording as drafted; Cal may tweak later.
