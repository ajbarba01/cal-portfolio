/**
 * createBookingMutation — auth-free, runtime-free orchestration for booking creation.
 *
 * Holds the logic that lives between the action adapter (auth + dep construction)
 * and the pure core (createBookingCore): calls the core, then hands the new
 * booking to the injected confirmation sender. No auth(), no getUser(), no
 * revalidatePath().
 *
 * The actions (actions.ts) remain the sole entry points: they authenticate,
 * build deps, and delegate here — the self-serve create and the admin
 * on-behalf create both, so neither can drift from the other. This layer is
 * extracted purely for testability: it can be exercised with stub deps and no
 * Next.js runtime.
 */

import { createBookingCore } from "../create-core";
import type { BookingRepository } from "../booking-repository";
import type { CreateBookingInput, CreateBookingResult } from "../create-core";
import type { MutationPolicy } from "../mutation-policy";

// ──────────────────────────────────────────────────────────────────────────────
// Deps
// ──────────────────────────────────────────────────────────────────────────────

export interface CreateBookingMutationDeps {
  repo: BookingRepository;
  /**
   * Send the confirmation email for a created booking. Injected so the mutation
   * stays testable without a live Supabase client. The sender decides for
   * itself whether the booking's stored status warrants an email, and is
   * best-effort: it never throws and never reports failure.
   */
  sendConfirmation(bookingId: string): Promise<void>;
  now: Date;
}

// ──────────────────────────────────────────────────────────────────────────────
// Mutation
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Execute the create-booking orchestration with injected deps.
 *
 * 1. Calls createBookingCore (pure logic, all money/status computed server-side).
 * 2. On success, hands the booking to the confirmation sender; any failure in
 *    the email path is caught and logged — it NEVER alters the result.
 */
export async function createBookingMutation(
  deps: CreateBookingMutationDeps,
  input: CreateBookingInput,
  policy?: MutationPolicy,
): Promise<CreateBookingResult> {
  const { repo, sendConfirmation, now } = deps;

  const result = await createBookingCore({ repo, now }, input, policy);

  // Best-effort confirmation email — a failed send NEVER alters the result.
  // For a multi-occurrence series we send one confirmation for the first
  // occurrence (the series, not each individual row) — this is intentional.
  if (result.kind === "success") {
    const firstBookingId = result.bookingIds[0];
    if (firstBookingId) {
      try {
        await sendConfirmation(firstBookingId);
      } catch (e: unknown) {
        console.error(
          "createBookingMutation: error sending confirmation email:",
          e,
        );
      }
    }
  }

  return result;
}
