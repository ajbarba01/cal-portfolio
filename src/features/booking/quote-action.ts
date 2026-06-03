"use server";

/**
 * Server action: read-only booking quote preview.
 *
 * Returns a BookingQuotePreview that is GUARANTEED to match the quote_breakdown
 * that createBookingCore would persist for the same input. Both call
 * computeBookingQuoteCore internally — no separate computation path exists.
 *
 * SECURITY MODEL
 * --------------
 * - Requires an authenticated session. Returns `not_authenticated` if none.
 * - All money/approval recomputed server-side from DB-trusted data.
 *   The client payload is never trusted for amounts or decisions.
 * - Uses the SERVICE ROLE client (same as createBooking) so the read
 *   is not gated by RLS row-visibility rules.
 *
 * GUARD ENFORCEMENT
 * -----------------
 * The preview does NOT enforce passesGuards or fitsWindow — it is a
 * read-only price estimate. createBookingCore enforces both before inserting.
 * Callers should surface a "this slot may not be available" notice separately.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createSupabaseBookingRepository } from "./booking-repository";
import { computeBookingQuoteCore } from "./booking-service";
import type { PreviewResult } from "./booking-service";
import type { CreateBookingInput } from "./booking-service";

// NOTE: do NOT re-export PreviewResult here — a "use server" module may export
// only async functions; a `export type { … }` re-export crashes module eval.
// Import it from ./booking-service directly.

/** Subset of CreateBookingInput the caller supplies (userId comes from session). */
export type PreviewBookingInput = Omit<CreateBookingInput, "userId">;

/** Extended result that carries auth status before the PreviewResult. */
export type PreviewActionResult = { kind: "not_authenticated" } | PreviewResult;

/**
 * Server action: compute a read-only booking quote preview.
 *
 * Returns the same breakdown that createBookingCore would persist for identical
 * input (single source of truth — both call computeBookingQuoteCore).
 *
 * @param input - Caller-supplied booking params (no userId — taken from session).
 * @returns     - PreviewActionResult discriminated union.
 */
export async function previewQuote(
  input: PreviewBookingInput,
): Promise<PreviewActionResult> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return { kind: "not_authenticated" };
  }

  const svcClient = createServiceClient();
  const repo = createSupabaseBookingRepository(svcClient);

  return computeBookingQuoteCore(
    { repo, now: new Date() },
    { ...input, userId: user.id },
  );
}
