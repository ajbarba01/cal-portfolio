/**
 * Pure pricing quote dispatcher.
 *
 * Accepts a fully typed `QuoteInput` (discriminated by pricingType), applies
 * the service-specific base + surcharge calculation, then runs the shared
 * modifier pipeline (travel → recurring discount → Kiche discount) in the
 * order defined in DESIGN.md "Computation order".
 *
 * No IO, no clock reads, no side-effects — pure function (#5 ENGINEERING).
 */

import type { QuoteBreakdown, QuoteInput, QuoteLine } from "./types";

// ---------------------------------------------------------------------------
// Named constants (ENGINEERING #8 — no magic numbers)
// ---------------------------------------------------------------------------

/** Minutes of dog walking included per day in a house_sitting stay. */
const INCLUDED_WALK_MINUTES_PER_DAY = 45;

/** Minutes in one 15-min walk block (add-on unit). */
const WALK_BLOCK_MINUTES = 15;

// Derived for documentation: INCLUDED_WALK_MINUTES_PER_DAY / WALK_BLOCK_MINUTES = 3 included blocks/day.

/** Minutes per hour (for driving-time → hourly-rate conversion). */
const MINUTES_PER_HOUR = 60;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Round a fractional cent value to the nearest cent. */
function roundCents(n: number): number {
  return Math.round(n);
}

/**
 * Applies the shared modifier pipeline to an existing line array.
 *
 * Modifiers (DESIGN "Computation order"):
 *   1. Travel — for hourly services only (house_sitting = default off/0).
 *   2. Recurring discount — subtracted from running subtotal after travel.
 *   3. Kiche discount — subtracted from running subtotal after recurring.
 *
 * Each modifier adds a QuoteLine (positive or negative). The running subtotal
 * is the sum of all previously accumulated lines before each modifier.
 */
function applyModifiers(
  lines: QuoteLine[],
  opts: {
    travelCents: number; // 0 = no travel line
    recurringDiscountApplies: boolean;
    recurringDiscountPct: number;
    kichePct: number | undefined;
  },
): QuoteLine[] {
  const result = [...lines];

  // 1. Travel
  if (opts.travelCents > 0) {
    result.push({ label: "Travel", amountCents: opts.travelCents });
  }

  // Running subtotal after base + travel (basis for discount calculations)
  const subtotalAfterTravel = result.reduce((acc, l) => acc + l.amountCents, 0);

  // 2. Recurring discount
  if (opts.recurringDiscountApplies && opts.recurringDiscountPct > 0) {
    const discountCents = roundCents(
      (subtotalAfterTravel * opts.recurringDiscountPct) / 100,
    );
    result.push({
      label: `Recurring discount (−${opts.recurringDiscountPct}%)`,
      amountCents: -discountCents,
    });
  }

  // Running subtotal after recurring (basis for Kiche)
  const subtotalAfterRecurring = result.reduce(
    (acc, l) => acc + l.amountCents,
    0,
  );

  // 3. Kiche discount
  if (opts.kichePct !== undefined && opts.kichePct > 0) {
    const kicheCents = roundCents(
      (subtotalAfterRecurring * opts.kichePct) / 100,
    );
    result.push({
      label: `Kiche discount (−${opts.kichePct}%)`,
      amountCents: -kicheCents,
    });
  }

  return result;
}

/**
 * Computes the travel line amount (cents) for an hourly service.
 *
 * @param roundTripDriveMinutes - Round-trip estimated driving time.
 * @param rateCentsPerHour      - The service's hourly rate.
 */
function computeTravelCents(
  roundTripDriveMinutes: number | undefined,
  rateCentsPerHour: number,
): number {
  if (!roundTripDriveMinutes || roundTripDriveMinutes <= 0) return 0;
  return roundCents(
    (roundTripDriveMinutes / MINUTES_PER_HOUR) * rateCentsPerHour,
  );
}

// ---------------------------------------------------------------------------
// house_sitting
// ---------------------------------------------------------------------------

function quoteHouseSitting(
  input: Extract<QuoteInput, { pricingType: "house_sitting" }>,
): QuoteBreakdown {
  const cfg = input.pricingConfig;
  const { dogs, cats, nights } = input;
  const cantBeLeftAloneDays = input.cantBeLeftAloneDays ?? 0;
  const extraWalk15minBlocksPerDay = input.extraWalk15minBlocksPerDay ?? 0;
  const holidayDays = input.holidayDays ?? 0;

  const lines: QuoteLine[] = [];

  // --- Base rate by pet priority (dog > cat) ---
  // Determines the "base pet" and a per-night base amount.
  const dogIsBase = dogs >= 1;
  const catIsBase = !dogIsBase && cats >= 1;

  // Base line (covers exactly one base pet, or zero if no pets)
  if (dogIsBase) {
    lines.push({
      label: `House sitting base (${nights === 1 ? "1 night" : `${nights} nights`})`,
      amountCents: roundCents(cfg.base_dog_cents_per_night * nights),
    });
  } else if (catIsBase) {
    lines.push({
      label: `House sitting base (${nights === 1 ? "1 night" : `${nights} nights`})`,
      amountCents: roundCents(cfg.base_cat_cents_per_night * nights),
    });
  }
  // else: no pets → no base line (0)

  // --- Extra dogs (only when a dog is the base) ---
  const extraDogs = dogIsBase ? Math.max(0, dogs - 1) : 0;
  if (extraDogs > 0) {
    lines.push({
      label: `Extra dog (${extraDogs})`,
      amountCents: roundCents(
        extraDogs * cfg.extra_dog_cents_per_night * nights,
      ),
    });
  }

  // --- Cats ---
  // When dog is base: ALL cats are surcharged.
  // When cat is base: remaining cats (cats − 1) are surcharged.
  const surchargedCats = dogIsBase ? cats : Math.max(0, cats - 1);
  if (surchargedCats > 0) {
    lines.push({
      label: `Extra cat (${surchargedCats})`,
      amountCents: roundCents(
        surchargedCats * cfg.extra_cat_cents_per_night * nights,
      ),
    });
  }

  // --- Per-day add-ons ---

  if (cantBeLeftAloneDays > 0) {
    lines.push({
      label: `Can't be left alone (${cantBeLeftAloneDays} day${cantBeLeftAloneDays !== 1 ? "s" : ""})`,
      amountCents: roundCents(
        cantBeLeftAloneDays * cfg.cant_be_left_alone_cents_per_day,
      ),
    });
  }

  // Extra walk blocks per day × days (per-day charge)
  // Each `extraWalk15minBlocksPerDay` is already extra blocks per day;
  // cantBeLeftAloneDays is separate. Walk add-on uses explicit
  // `extraWalk15minBlocksPerDay` × days input to stay testable.
  // "days" here is the caller-supplied cantBeLeftAloneDays / holidayDays;
  // the walk add-on rate is per-day, but the caller provides
  // blocks-per-day, not a total days count — so we need an explicit day count.
  // Per the spec, day-based add-ons use explicit input day counts. For walks
  // the day count is implicitly `Math.ceil(nights)` unless a separate field is
  // provided. We accept `extraWalk15minBlocksPerDay` as blocks-per-day and
  // multiply by `Math.ceil(nights)` as the number of full/partial days in the
  // stay. This is consistent with how holidayDays is an explicit total.
  const walkDays = Math.ceil(nights);
  if (extraWalk15minBlocksPerDay > 0 && walkDays > 0) {
    lines.push({
      label: `Extra walks (${extraWalk15minBlocksPerDay} × 15 min/day)`,
      amountCents: roundCents(
        extraWalk15minBlocksPerDay *
          cfg.extra_walk_15min_cents_per_day *
          walkDays,
      ),
    });
  }

  if (holidayDays > 0) {
    lines.push({
      label: `Holiday (${holidayDays} day${holidayDays !== 1 ? "s" : ""})`,
      amountCents: roundCents(holidayDays * cfg.holiday_cents_per_day),
    });
  }

  // --- Modifiers ---
  // DESIGN: house_sitting travel = config-gated, default OFF. Pass 0.
  const finalLines = applyModifiers(lines, {
    travelCents: 0, // house_sitting travel is off by default (open Cal Q)
    recurringDiscountApplies: input.recurringDiscountApplies,
    recurringDiscountPct: input.recurringDiscountPct,
    kichePct: input.kichePct,
  });

  return {
    lines: finalLines,
    finalCents: finalLines.reduce((acc, l) => acc + l.amountCents, 0),
  };
}

// ---------------------------------------------------------------------------
// check_in
// ---------------------------------------------------------------------------

function quoteCheckIn(
  input: Extract<QuoteInput, { pricingType: "check_in" }>,
): QuoteBreakdown {
  const cfg = input.pricingConfig;
  const { hours } = input;

  const rawCents = roundCents(hours * cfg.rate_cents_per_hour);
  const baseCents = Math.max(cfg.minimum_cents, rawCents);

  const lines: QuoteLine[] = [
    {
      label: `Check-in (${hours}h)`,
      amountCents: baseCents,
    },
  ];

  const travelCents = computeTravelCents(
    input.roundTripDriveMinutes,
    cfg.rate_cents_per_hour,
  );

  const finalLines = applyModifiers(lines, {
    travelCents,
    recurringDiscountApplies: input.recurringDiscountApplies,
    recurringDiscountPct: input.recurringDiscountPct,
    kichePct: input.kichePct,
  });

  return {
    lines: finalLines,
    finalCents: finalLines.reduce((acc, l) => acc + l.amountCents, 0),
  };
}

// ---------------------------------------------------------------------------
// walk
// ---------------------------------------------------------------------------

function quoteWalk(
  input: Extract<QuoteInput, { pricingType: "walk" }>,
): QuoteBreakdown {
  const cfg = input.pricingConfig;
  const { hours, dogs } = input;

  const hoursCents = roundCents(hours * cfg.rate_cents_per_hour);
  const dogsCents = dogs * cfg.per_dog_cents;

  const lines: QuoteLine[] = [
    { label: `Walk (${hours}h)`, amountCents: hoursCents },
    {
      label: `Per-dog fee (${dogs} dog${dogs !== 1 ? "s" : ""})`,
      amountCents: dogsCents,
    },
  ];

  const travelCents = computeTravelCents(
    input.roundTripDriveMinutes,
    cfg.rate_cents_per_hour,
  );

  const finalLines = applyModifiers(lines, {
    travelCents,
    recurringDiscountApplies: input.recurringDiscountApplies,
    recurringDiscountPct: input.recurringDiscountPct,
    kichePct: input.kichePct,
  });

  return {
    lines: finalLines,
    finalCents: finalLines.reduce((acc, l) => acc + l.amountCents, 0),
  };
}

// ---------------------------------------------------------------------------
// training
// ---------------------------------------------------------------------------

function quoteTraining(
  input: Extract<QuoteInput, { pricingType: "training" }>,
): QuoteBreakdown {
  const cfg = input.pricingConfig;
  const { hours } = input;

  const baseCents = roundCents(hours * cfg.rate_cents_per_hour);

  const lines: QuoteLine[] = [
    { label: `Training (${hours}h)`, amountCents: baseCents },
  ];

  const travelCents = computeTravelCents(
    input.roundTripDriveMinutes,
    cfg.rate_cents_per_hour,
  );

  const finalLines = applyModifiers(lines, {
    travelCents,
    recurringDiscountApplies: input.recurringDiscountApplies,
    recurringDiscountPct: input.recurringDiscountPct,
    kichePct: input.kichePct,
  });

  return {
    lines: finalLines,
    finalCents: finalLines.reduce((acc, l) => acc + l.amountCents, 0),
  };
}

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

/**
 * Computes an itemized price quote for a booking.
 *
 * Dispatches on `input.pricingType` (exhaustive switch with `never` check),
 * builds the service-specific base lines, then applies the shared modifier
 * pipeline (travel → recurring → Kiche) in the order specified by DESIGN.md.
 *
 * Pure: no IO, no clock reads, deterministic. (#5 ENGINEERING)
 */
export function quote(input: QuoteInput): QuoteBreakdown {
  switch (input.pricingType) {
    case "house_sitting":
      return quoteHouseSitting(input);
    case "check_in":
      return quoteCheckIn(input);
    case "walk":
      return quoteWalk(input);
    case "training":
      return quoteTraining(input);
    default: {
      // Exhaustiveness check — TS errors here if a new PricingType is added
      // without a corresponding case.
      const _exhaustive: never = input;
      throw new Error(
        `Unknown pricingType: ${String((_exhaustive as QuoteInput).pricingType)}`,
      );
    }
  }
}

// Re-export the included-walk constant so tests and callers can reference it
// without importing from the implementation detail.
export { INCLUDED_WALK_MINUTES_PER_DAY, WALK_BLOCK_MINUTES };
