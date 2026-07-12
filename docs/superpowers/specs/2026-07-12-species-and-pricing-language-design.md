# Species model + pricing language — design (2026-07-12)

Tranche 4 of the [tester-feedback action plan](2026-07-12-tester-feedback-action-plan.md):
**Group B (species model)** and **Group F (pricing language & definitions)**, batched
because both touch pricing labels/config. One spec, two implementation plans.

**Root causes.** (B) Species knowledge lives in exactly one correct place — the pricing
engine already defines 7 species — while the pet form, DB enum, and profile field groups
only know dog/cat, so cat/small-animal owners hit dog-shaped fields and a hardcoded 2-way
radio. (F) Pricing terms ("each cat", "premium night", "needy pet care") have no
definitions anywhere; users guess at meaning.

**Decisions confirmed with the maintainer in-session:**

- Species set = the full **7** the pricing engine already knows (`dog, cat, bird, rodent,
reptile, fish, other`) — the pet form matches the pricing taxonomy exactly rather than
  inventing a smaller "small animal" bucket. One taxonomy, everywhere.
- The **canonical taxonomy moves to a new pets module; pricing imports it** — species is a
  pet-domain concept, not a pricing one.
- **No `isWalkable` abstraction.** "Walkable == dog" is already encoded by the dog-only
  `pet_walk` gate; walk checks stay direct `=== "dog"` predicates rather than a helper that
  pretends the set could grow.
- Fish stay free (never billed) — preserved for free by keeping fish a distinct species
  (the existing `others`-excludes-fish rule in the evaluator still applies).
- Label renames are **drafted for Cal, approved via copy-sync** — not code-shipped in this
  tranche.

---

## Group B — Species model

### B1. Canonical species module — `src/features/pets/species.ts`

Single source of truth for the pet taxonomy. Pure, no runtime deps.

- `SPECIES` — ordered list of the 7 species, each with display `label` + emoji.
- `PetSpecies` — union type of the 7 (replaces the `"dog" | "cat"` currently declared in
  `required-profiles.ts`).
- `billingUnit(species): Unit` — `dog → dog`, `cat → cat`, everything else → `other`. The
  one mapping reconciling the 7-species pet world with the 3-unit billing world.
- **No `isWalkable`** — dog-only stays a direct `=== "dog"` check where needed.

Pricing's `Species`/`Unit` in `modifier-types.ts` **re-export from this module**, and
`config-schemas.ts` `speciesSchema` derives its enum from `SPECIES`, so the zod schema and
the TS type cannot drift. This is the only change to the pricing feature.

### B2. DB + type propagation

- Migration: `ALTER TYPE pet_species ADD VALUE` for `bird, rodent, reptile, fish, other`.
  Additive — existing `dog`/`cat` rows untouched, no data migration. (Note the Postgres
  constraint that `ADD VALUE` cannot run inside a transaction with subsequent use of the
  new value; the plan handles the migration mechanics.)
- `pet-form.tsx`: the species `z.enum` and the `RadioGroup` options are generated from
  `SPECIES` (removes the hardcoded 2-option list at `pet-form.tsx:59-66,183-186`).
- `required-profiles.ts`: `PetSpecies` imported from the module (drops its local
  declaration); the manifest's `pet("pet_walk", "dog")` gate is unchanged.

### B3. Species-conditional fields — `profile-fields.tsx`

- Add optional `species?: PetSpecies[]` to the `FieldGroup` field shape — same predicate
  pattern as `required-profiles`. Omitted = applies to all species (every existing field
  keeps current behavior).
- `friendly_dogs` ("With other dogs", `profile-fields.tsx:275`) → `species: ["dog"]`.
- The field renderer receives the current pet's species and filters the field list.

### B4. Walk stepper gate — `quantity-forms.tsx`

- The house-sitting "Walk time per day" stepper (`quantity-forms.tsx:200-209`) renders only
  when ≥1 **dog** is assigned to the booking, keyed on the assigned-pets data already
  reaching the quantity step (the same signal the `noDogs` pricing condition reads).
- No dogs assigned → stepper hidden and `walkMinutesPerDay` forced to 0.

---

## Group F — Pricing language & definitions

### F1. Tooltip primitive — `src/components/ui/tooltip.tsx`

New component (frontend-design pass). Requirements:

- Hover on pointer devices, **tap-to-toggle on touch**, keyboard-focusable trigger.
- Token-styled to the Trail palette; **shadow-free** per the house rule.
- Radix/shadcn tooltip under the hood.
- Registered in `/showcase` and `COMPONENT_SYSTEM.md` (same-commit doc rule).

### F2. Modifier / breakdown-row descriptions

- Optional `description?: string` on pricing modifiers and breakdown rows (`display.ts`).
- Rendered as an info-tooltip (ⓘ) beside the row label in **both** the pricing breakdown
  and the quote receipt.

### F3. Label copy — drafted, Cal-approved via copy-sync (blocked-on-Cal)

Queued as copy-sync drafts, not shipped in code this tranche:

- "each cat" → **keep the label**, add description "per cat, including the first" (the
  tester's "each additional cat" rename would be wrong — `flat_per_unit` charges every cat
  including the first; "each additional" is the separate `tiered_per_unit` label).
- "each additional animal" → "each additional small animal".
- "premium night" → **"Holiday & peak-date rate"** + description.
- "needy pet care" → **"extra-attention care"** + description; define "long stay" /
  "extended stay".
- Tooltip audit pass for other spots where users would expect a definition.

---

## Scope / sequencing

One spec (this doc), **two implementation plans**:

- **Plan 4a — Species model (Group B):** module + DB migration + form + field predicate +
  walk gate. No new UI primitive; independently shippable without waiting on Cal.
- **Plan 4b — Pricing language (Group F):** tooltip primitive (frontend-design) +
  description wiring + copy drafts for Cal.

B and F meet pricing only at the thin `billingUnit` / `description` seam, so the split keeps
each plan focused and unblocks 4a from Cal's copy approvals.

## Testing

- `species.ts` — pure unit tests: `billingUnit` mapping across all 7 species; `SPECIES`
  shape.
- `required-profiles.test.ts` — extend to non-dog/cat species (small animals get `pet_care`
  but not `pet_walk`).
- `profile-fields` — field-filter test: `friendly_dogs` present for dog, absent for cat.
- `quantity-forms` — walk stepper hidden with no dogs, shown with a dog.
- Pricing evaluator regression: fish still contributes 0 to `others`.
- Tooltip — a11y/interaction test (keyboard focus, touch toggle).

---

_Last reviewed: 2026-07-12_
