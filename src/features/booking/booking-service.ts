/**
 * Booking orchestration: createBookingCore / cancelBookingCore.
 *
 * "Pure-ish" orchestration layer: accepts injected deps (repo) so it is
 * integration-testable without Next.js machinery. Mirrors the DI split in
 * src/features/accounts/onboarding-action.ts.
 *
 * SECURITY MODEL
 * --------------
 * - The repo passed in MUST be backed by a service-role client (enforced by
 *   the `"use server"` actions.ts entry point). Never call these functions
 *   with a user-session-backed repo — the protected columns would be blocked
 *   by the column-grant guard.
 * - `client_id` is ALWAYS taken from `input.userId` (verified session ID
 *   supplied by the action), never from the client payload.
 * - Money (`final_cents`), `status`, `distance_miles`, `quote_breakdown`,
 *   and `requires_approval` are ALL recomputed server-side from DB-trusted
 *   data. None of these are accepted from the client.
 * - The DB exclusion constraint `no_same_class_overlap` is the final arbiter
 *   of double-booking. Postgres error `23P01` (exclusion_violation) is caught
 *   on insert and surfaced as a `slot_taken` result (ENGINEERING #11).
 *
 * PROFILE WITH NO LAT/LNG
 * -----------------------
 * When the caller's profile has no geocoded coordinates (null lat/lng —
 * possible if onboarding geocoding failed or the ZIP was unknown), we cannot
 * compute a distance. Rather than auto-approving (which could send Cal 200
 * miles away), we force manual approval and store distance_miles = null.
 * This is the safe default: Cal reviews and decides.
 *
 * DISCOUNT_CENTS
 * --------------
 * The `discount_cents` column is set to 0 for all bookings created here.
 * The recurring discount and any future Kiche discount are already reflected
 * in `final_cents` via the quote lines. A separate `discount_cents` snapshot
 * column could be populated from the discount lines in a future pass; for now
 * it is documented but left at 0. Kiche is Cal-applied post-booking.
 */

import { z } from "zod";
import { haversineMiles } from "@/lib/haversine";
import {
  estimateDrivingMinutes,
  deriveApproval,
} from "@/features/pricing/distance";
import { quote } from "@/features/pricing/quote";
import { parsePricingConfig } from "@/features/pricing/config-schemas";
import { expandOccurrences } from "./recurrence";
import { seriesQualifiesForRecurringDiscount } from "./availability";
import { transition } from "./state-machine";
import type { BookingRepository } from "./booking-repository";
import type { QuoteInput } from "@/features/pricing/types";
import type { RecurrenceRule } from "./recurrence";

// ──────────────────────────────────────────────────────────────────────────────
// Input Zod schemas (validate at the boundary — ENGINEERING #11)
// ──────────────────────────────────────────────────────────────────────────────

const recurrenceRuleSchema = z.object({
  freq: z.enum(["daily", "weekly", "monthly"]),
  interval: z.number().int().min(1),
  count: z.number().int().positive().optional(),
  until: z.coerce.date().optional(),
});

/**
 * Booking request input schema.
 *
 * The client supplies ONLY: which service, time window, quantities, and an
 * optional recurrence rule. All money, status, distance, and approval fields
 * are recomputed server-side.
 */
const createBookingInputSchema = z.object({
  userId: z.string().uuid(),
  serviceSlug: z.string().min(1),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  /**
   * Service-specific quantities. Accepted as a loose record and threaded into
   * the QuoteInput discriminated union after the service's pricingType is known.
   * Zod validates the shape after dispatch (via parsePricingConfig + quote).
   */
  quantities: z.record(z.string(), z.unknown()),
  /** Weekly recurrence rule. MVP UI exposes weekly only; daily/monthly accepted for future use. */
  recurringRule: recurrenceRuleSchema.nullable(),
});

const cancelBookingInputSchema = z.object({
  userId: z.string().uuid(),
  bookingId: z.string().uuid(),
});

// ──────────────────────────────────────────────────────────────────────────────
// Result types (discriminated union — no throwing across the boundary)
// ──────────────────────────────────────────────────────────────────────────────

export type CreateBookingResult =
  | { kind: "success"; bookingIds: string[] }
  | { kind: "refuse"; reason: string }
  | { kind: "slot_taken" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

export type CancelBookingResult =
  | { kind: "success" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

// ──────────────────────────────────────────────────────────────────────────────
// Deps
// ──────────────────────────────────────────────────────────────────────────────

export interface BookingServiceDeps {
  repo: BookingRepository;
}

// ──────────────────────────────────────────────────────────────────────────────
// createBookingCore
// ──────────────────────────────────────────────────────────────────────────────

export type CreateBookingInput = z.input<typeof createBookingInputSchema>;

/**
 * Core booking creation logic (testable via DI, no Next.js machinery).
 *
 * Pipeline:
 *  1. Validate input.
 *  2. Load service, settings, profile lat/lng from DB.
 *  3. Compute distance + approval decision.
 *  4. Expand occurrences (1 or N for recurring).
 *  5. Quote each occurrence.
 *  6. Derive initial status via state machine.
 *  7. Insert all rows via service role; catch 23P01 → slot_taken.
 */
export async function createBookingCore(
  deps: BookingServiceDeps,
  rawInput: CreateBookingInput,
): Promise<CreateBookingResult> {
  // 1. Validate
  const parseResult = createBookingInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return {
      kind: "validation_error",
      message: parseResult.error.message,
    };
  }
  const input = parseResult.data;
  const { repo } = deps;

  // 2. Load from DB
  const [service, settings, profileLatLng] = await Promise.all([
    repo.getServiceBySlug(input.serviceSlug),
    repo.getSettings(),
    repo.getProfileLatLng(input.userId),
  ]);

  if (!service) {
    return {
      kind: "error",
      message: `Service '${input.serviceSlug}' not found`,
    };
  }

  // Validate pricing_config before any quoting.
  let pricingConfig: ReturnType<typeof parsePricingConfig>;
  try {
    pricingConfig = parsePricingConfig(
      service.pricing_type,
      service.pricing_config,
    );
  } catch (e) {
    return {
      kind: "error",
      message: `Invalid pricing_config for service '${input.serviceSlug}': ${String(e)}`,
    };
  }

  // 3. Distance + approval
  const origin = { lat: settings.origin_lat, lng: settings.origin_lng };
  let distanceMiles: number | null = null;
  let requiresApproval: boolean;

  if (profileLatLng.lat === null || profileLatLng.lng === null) {
    // Unknown coordinates → force manual approval (safe default; documented above).
    requiresApproval = true;
  } else {
    distanceMiles = haversineMiles(origin, {
      lat: profileLatLng.lat,
      lng: profileLatLng.lng,
    });
    const oneWayMin = estimateDrivingMinutes(distanceMiles, {
      roadFactor: settings.road_factor,
      avgSpeedMph: settings.avg_speed_mph,
    });
    const decision = deriveApproval(oneWayMin, {
      autoApproveMin: settings.auto_approve_threshold_min,
      hardCutoffMin: settings.hard_cutoff_min,
    });

    if (decision === "refuse") {
      return {
        kind: "refuse",
        reason: `Client location is too far (${oneWayMin.toFixed(0)} min one-way). Hard cutoff is ${settings.hard_cutoff_min} min.`,
      };
    }

    requiresApproval =
      decision === "manual" || service.requires_approval === true;
  }

  // If the service itself requires approval, ensure it's flagged regardless of distance.
  if (service.requires_approval) {
    requiresApproval = true;
  }

  // 4. Recurrence
  const occurrences = input.recurringRule
    ? expandOccurrences(input.startsAt, input.recurringRule as RecurrenceRule)
    : [input.startsAt];

  const durationMs = input.endsAt.getTime() - input.startsAt.getTime();

  const seriesId = occurrences.length > 1 ? crypto.randomUUID() : null;

  // Check recurring discount eligibility.
  const recurringDiscountApplies = seriesQualifiesForRecurringDiscount(
    occurrences,
    service.pricing_type,
    { recurringMinOccurrences: settings.recurring_min_occurrences },
  );

  // 5–6. Quote each occurrence + derive status
  const statResult = transition("draft", "submit", { requiresApproval });
  if ("error" in statResult) {
    return { kind: "error", message: statResult.error };
  }
  const status = statResult.state;

  // Compute round-trip drive minutes for quote (hourly services only;
  // house_sitting passes 0 — travel is off by default per DESIGN).
  const oneWayMin =
    distanceMiles !== null
      ? estimateDrivingMinutes(distanceMiles, {
          roadFactor: settings.road_factor,
          avgSpeedMph: settings.avg_speed_mph,
        })
      : 0;
  const roundTripDriveMinutes =
    service.pricing_type === "house_sitting" ? 0 : 2 * oneWayMin;

  const insertRows = occurrences.map((occStart) => {
    const occEnd = new Date(occStart.getTime() + durationMs);

    const quoteInput = buildQuoteInput({
      pricingType: service.pricing_type,
      pricingConfig,
      quantities: input.quantities,
      roundTripDriveMinutes,
      recurringDiscountApplies,
      recurringDiscountPct: settings.recurring_discount_pct,
    });

    const breakdown = quote(quoteInput);

    return {
      client_id: input.userId,
      service_id: service.id,
      starts_at: occStart.toISOString(),
      ends_at: occEnd.toISOString(),
      series_id: seriesId,
      status,
      concurrency: service.concurrency,
      distance_miles: distanceMiles,
      quote_inputs: quoteInput as unknown as Record<string, unknown>,
      quote_breakdown: breakdown as unknown as Record<string, unknown>,
      final_cents: breakdown.finalCents,
      requires_approval: requiresApproval,
      discount_cents: 0, // see DISCOUNT_CENTS note in module header
    };
  });

  // 7. Insert — catch exclusion_violation (23P01) → slot_taken
  try {
    const ids = await repo.insertBookings(insertRows);
    return { kind: "success", bookingIds: ids };
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === "23P01") {
      return { kind: "slot_taken" };
    }
    throw e;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// cancelBookingCore
// ──────────────────────────────────────────────────────────────────────────────

export type CancelBookingInput = z.input<typeof cancelBookingInputSchema>;

/**
 * Core booking cancellation logic (testable via DI, no Next.js machinery).
 *
 * Authenticates ownership (client_id === userId OR admin check in actions.ts).
 * Refunds are MANUAL by Cal — no automatic refund logic here.
 *
 * @see actions.ts for admin-override path.
 */
export async function cancelBookingCore(
  deps: BookingServiceDeps,
  rawInput: CancelBookingInput,
): Promise<CancelBookingResult> {
  const parseResult = cancelBookingInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return { kind: "error", message: parseResult.error.message };
  }
  const input = parseResult.data;
  const { repo } = deps;

  const booking = await repo.getBookingById(input.bookingId);
  if (!booking) {
    return { kind: "not_found" };
  }

  // Ownership check. Admin bypass happens in the "use server" action wrapper.
  if (booking.client_id !== input.userId) {
    return { kind: "forbidden" };
  }

  const result = transition(booking.status, "cancel", {
    requiresApproval: false, // context not needed for cancel
  });

  if ("error" in result) {
    return { kind: "error", message: result.error };
  }

  await repo.updateBookingStatus(input.bookingId, result.state);
  return { kind: "success" };
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Assembles a `QuoteInput` discriminated union from the service's pricing type,
 * validated config, and the quantities supplied in the request.
 *
 * The `quantities` record is cast into the expected shape per pricingType.
 * Invalid quantities (e.g. missing `hours`) will cause `quote()` to produce
 * a nonsensical result — the action layer is responsible for validating
 * quantities per service before calling `createBookingCore`. A future pass
 * can add per-type Zod schemas here.
 */
function buildQuoteInput(opts: {
  pricingType: string;
  pricingConfig: unknown;
  quantities: Record<string, unknown>;
  roundTripDriveMinutes: number;
  recurringDiscountApplies: boolean;
  recurringDiscountPct: number;
}): QuoteInput {
  const shared = {
    roundTripDriveMinutes: opts.roundTripDriveMinutes,
    recurringDiscountApplies: opts.recurringDiscountApplies,
    recurringDiscountPct: opts.recurringDiscountPct,
    applyKiche: false, // Kiche is Cal-applied post-booking; never auto-applied at submit
  };

  const q = opts.quantities;

  switch (opts.pricingType) {
    case "house_sitting":
      return {
        pricingType: "house_sitting",
        pricingConfig: opts.pricingConfig as QuoteInput["pricingConfig"],
        dogs: (q.dogs as number) ?? 0,
        cats: (q.cats as number) ?? 0,
        nights: (q.nights as number) ?? 1,
        cantBeLeftAloneDays: q.cantBeLeftAloneDays as number | undefined,
        walkMinutesPerDay: q.walkMinutesPerDay as number | undefined,
        holidayDays: q.holidayDays as number | undefined,
        ...shared,
      } as QuoteInput;

    case "check_in":
      return {
        pricingType: "check_in",
        pricingConfig: opts.pricingConfig as QuoteInput["pricingConfig"],
        hours: (q.hours as number) ?? 1,
        ...shared,
      } as QuoteInput;

    case "walk":
      return {
        pricingType: "walk",
        pricingConfig: opts.pricingConfig as QuoteInput["pricingConfig"],
        hours: (q.hours as number) ?? 1,
        dogs: (q.dogs as number) ?? 1,
        ...shared,
      } as QuoteInput;

    case "training":
      return {
        pricingType: "training",
        pricingConfig: opts.pricingConfig as QuoteInput["pricingConfig"],
        hours: (q.hours as number) ?? 1,
        ...shared,
      } as QuoteInput;

    default:
      throw new Error(`Unknown pricingType: ${opts.pricingType}`);
  }
}
