# Source deferred pricing inputs — design

Wire the three dormant pricing-engine inputs to real data so their modifiers fire:
`anyDogUnder6mo`, `needyTier`, and `leashManners`. These were left at defaults in
`buildQuoteInput` during the engine-core work; the modifiers exist in every seeded
config but never trigger because no caller supplies their inputs.

This is the pricing overhaul's P2. It changes quote amounts, so it ships behind a
behavioral sign-off + coordinated deploy (same gate as the engine-core and
constraints work).

## Goal

Make the seeded-but-dormant modifiers fire from honest, well-sourced data:

| Input            | Modifier(s) fired                                                                   | Source (this design)                             |
| ---------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| `anyDogUnder6mo` | `puppy_household` (house-sit −$10/night), `puppy_training` (check_in/training −15%) | structured pet birthdate, derived at booking     |
| `needyTier`      | `needy` (house-sit +$5/night × tier)                                                | per-booking "max hours Cal can be away" → ladder |
| `leashManners`   | `leash_manners` (walk +$10/h)                                                       | per-booking walk opt-in toggle                   |

`others` / fish exclusion is **inert** and out of scope: pets are dog/cat by the DB
enum (locked decision), so `others` is always 0. No work; recorded here so it is not
mistaken for a gap.

## Sourcing model (decided)

Hybrid: structured pet data where the fact is objective and reusable; per-booking
input where it varies by stay or is a service choice.

- **`anyDogUnder6mo` → structured birthdate.** Puppy status is objective, reusable
  across bookings, and must not be client-gameable (it gates discounts). It lives on
  the pet, and the booking derives the flag from the dog's age at the booking start.
- **`needyTier` → per-booking.** Neediness varies per stay and is framed as a care
  fact owners report honestly ("how long can Cal be away?"), not a raw surcharge dial.
- **`leashManners` → per-booking.** A walk service add-on, not a pet attribute.

## 1. `anyDogUnder6mo` — structured birthdate

### Data

- Migration: `alter table pets add column if not exists birthdate date;` (nullable).
- The orphaned freeform `age` text column (added 2026-06-16, wired to no form) is left
  as-is — replacing/dropping it is unrelated cleanup, out of scope.

### Write path

- `petSchema` (`account-actions.ts`) gains `birthdate: z.string().date().optional()`
  (HTML date input emits `YYYY-MM-DD`; empty string coerces to `undefined`).
- `Pet` interface gains `birthdate: string | null`.
- `PetForm` gains a native date input (`type="date"`), placed with the existing
  identity fields (name/species/breed). Optional — existing pets have no birthdate and
  stay valid.
- The admin on-behalf pet actions reuse `petSchema`, so they inherit the field with no
  extra work.

### Read path + derivation

- `getPetsByIds` (booking-repository) returns `birthdate` alongside `id`/`species`;
  the `BookingRepository` type and the Supabase select are updated.
- A pure helper `isUnderSixMonths(birthdate: string | null, asOf: Date): boolean`
  returns false for null/unparseable input. Age computed against `asOf` (the booking's
  `input.startsAt`), counting calendar months, so a pet whose 6-month mark is on or
  before the stay is no longer "under 6mo".
- `computeBookingArtifacts` derives
  `anyDogUnder6mo = ownedPets.some(p => p.species === "dog" && isUnderSixMonths(p.birthdate, input.startsAt))`
  and passes it to `buildQuoteInput` as a new opt. Derived for every pet-aware service
  (house_sitting / walk / check_in / training), since all assign pets; walk's config
  has no puppy modifier, so the flag is simply unused there.

### Default behavior

- Null birthdate → `isUnderSixMonths` false → no puppy discount. Conservative: a client
  who has not recorded a birthdate does not silently receive a discount.

## 2. `needyTier` — per-booking "max hours Cal can be away"

### Input

- New house-sit quantity field `maxHoursAway: number` on `HouseSittingExtras`
  (`quantity-forms.tsx`), rendered as a `StepperField` ("Max hours Cal can be away",
  hours). Added to `houseSittingQuantitiesSchema` (`z.number().min(0).optional()`) and
  emitted by `quantitiesToRecord`.
- `cantBeLeftAloneDays` is untouched: it is a different axis (which overnight days Cal
  must stay on-site) and is independently wired to nothing today.

### Ladder

- Pure helper `needyTierFromHoursAway(maxHoursAway: number | undefined): 0|1|2|3|4`:

  | max hours Cal can be away | needyTier |
  | ------------------------- | --------- |
  | `≥ 8` or undefined        | 0         |
  | `[6, 8)`                  | 1         |
  | `[4, 6)`                  | 2         |
  | `[2, 4)`                  | 3         |
  | `< 2`                     | 4         |

- Default UI value is `8` (→ tier 0, no surcharge), so a client who does not lower it
  sees no change.
- Derived in `buildQuoteInput`'s house_sitting case from `q.data.maxHoursAway`. Fires
  the `needy` ladder modifier (+$5/night × `min(needyTier, maxTier=4)`).

## 3. `leashManners` — per-booking walk opt-in

- New walk quantity field `leashManners: boolean` on the walk state shape
  (`quantity-forms.tsx`), rendered as a `Switch` ("Leash manners (+$10/h)"). Added to
  `walkQuantitiesSchema` (`z.boolean().optional()`) and emitted by `quantitiesToRecord`.
- Set in `buildQuoteInput`'s walk case from `q.data.leashManners`. Fires the
  `per_hour_addon` `leash_manners` modifier (+$10/h).
- Default off → no change for clients who do not opt in.

## 4. Round-trip surfaces

Every booking entry point must carry the new fields end-to-end (UI → wire record →
quote). The persisted `quote_inputs` jsonb is the **`QuoteInput`** itself (see
`create-core.ts` / `edit-core.ts`), and `QuoteInput` already carries `needyTier`,
`leashManners`, and (new) `anyDogUnder6mo` natively — so the durable record needs no
new carry-through field, and reconstruction reads those native fields.

Create surfaces (collect → wire record → quote):

- **Client create** — `use-service-booking.ts`, `quantity-forms.tsx`.
- **Admin create** — `use-admin-create-booking.ts`.

Edit surfaces (reconstruct UI state from stored `QuoteInput`, then re-quote):

- **Client edit** — `use-edit-booking.ts`; reconstruction helper(s)
  `quantitiesFromQuoteInputs` (edit-core.ts) and the standalone
  `quantity-state-from-quote-inputs.ts`.
- **Admin edit** — mirrors client edit.

Reconstruction rules:

- **`leashManners`** — native `QuoteInput` boolean; map 1:1 back to the walk toggle.
  Exact round-trip.
- **`maxHoursAway` / `needyTier`** — the durable truth is `needyTier` (0–4), not the raw
  hours. Seed the "max hours Cal can be away" stepper from `needyTier` via a
  representative inverse (`0→8, 1→7, 2→5, 3→3, 4→1`). This is **price-exact**: each
  representative maps back through the ladder to the same tier, so a re-quote reproduces
  the identical `needy` surcharge. The displayed hours may differ from the client's
  original entry within the bucket; that is cosmetic, by design (the tier is what
  prices).

Pre-existing note (not fixed here): `quantitiesFromQuoteInputs` lists
`cantBeLeftAloneDays` / `walkMinutesPerDay`, which the engine-core `buildQuoteInput` no
longer emits (`walkMinutesPerDay` became `exerciseMinutesPerDay`). Those keys are
vestigial and do not round-trip today. P2 does not depend on or repair that path; the
new fields round-trip via the native `QuoteInput` fields above.

Birthdate has no booking-flow surface — it is pet-profile data, derived server-side.

## 5. Engine wiring summary

- `buildQuoteInput` gains one opt (`anyDogUnder6mo`) and derives `needyTier` /
  `leashManners` from the validated per-type quantities. `QuoteInput` already carries
  all three fields; the engine already consumes them (`evaluate.ts`). No engine change.
- `computeBookingArtifacts` derives `anyDogUnder6mo` from `ownedPets` + `input.startsAt`
  and threads it through.

## 6. Testing

- **Pure helpers (new):** `needyTierFromHoursAway` (boundary cases at 2/4/6/8 and
  undefined), `isUnderSixMonths` (null, exactly-6-months boundary, under, over,
  unparseable).
- **`build-quote-input.test.ts`:** house-sit needy surcharge fires by `maxHoursAway`;
  walk leash add-on fires by toggle; `anyDogUnder6mo` opt drives puppy modifiers; all
  three default off → unchanged quotes.
- **`quantity-state-from-quote-inputs.test.ts`:** `leashManners` round-trips exactly;
  `needyTier` reconstructs to a representative `maxHoursAway` that re-quotes to the same
  tier (price-exact).
- Engine-side consumption is already covered by `evaluate.test.ts`; not re-tested.
- DB-integration suites (repo/admin) are not a per-task gate (need the seeded local
  stack); per-task gate is touched unit suites + `tsc`.

## Out of scope

- Dropping/replacing the orphaned `pets.age` column.
- Repurposing `cantBeLeftAloneDays`.
- Any species expansion beyond dog/cat (locked).
- Admin-set needyTier override (per-booking client framing is the decision).

## Behavioral impact (gate before deploy)

Adds three new ways a quote can move from its current value:

- Puppy discounts fire on house_sitting / check_in / training when an assigned dog has
  a birthdate under 6 months at the stay start.
- Needy surcharge fires on house_sitting when the client lowers "max hours Cal can be
  away" below 8.
- Leash-manners add-on bills on walks when the client opts in.

All three are off by default, so existing booking behavior is unchanged unless a client
supplies the new data. Ships behind a maintainer behavioral sign-off + coordinated
migration + deploy, consistent with the prior pricing phases.

_Last reviewed: 2026-06-18_
