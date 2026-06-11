/**
 * createBookingMutation — auth-free, runtime-free orchestration for booking creation.
 *
 * Holds the logic that lives between the action adapter (auth + dep construction)
 * and the pure core (createBookingCore): calls the core, then attempts a
 * best-effort confirmation email via the injected Notifier. No auth(), no
 * getUser(), no revalidatePath().
 *
 * The action (actions.ts) remains the sole entry point: it authenticates,
 * builds deps, and delegates here. This layer is extracted purely for
 * testability — it can be exercised with stub deps and no Next.js runtime.
 */

import { z } from "zod";
import { createBookingCore } from "../create-core";
import type { BookingRepository } from "../booking-repository";
import type { Notifier } from "@/features/notifications";
import type { CreateBookingInput, CreateBookingResult } from "../create-core";
import type { MutationPolicy } from "../mutation-policy";

// ──────────────────────────────────────────────────────────────────────────────
// Narrow schema for the confirmation-email DB row
// ──────────────────────────────────────────────────────────────────────────────

const confirmationRowSchema = z.object({
  starts_at: z.string(),
  ends_at: z.string(),
  final_cents: z.number(),
  services: z.object({ name: z.string() }).nullable(),
});

export type ConfirmationRow = z.infer<typeof confirmationRowSchema>;

// ──────────────────────────────────────────────────────────────────────────────
// Deps
// ──────────────────────────────────────────────────────────────────────────────

export interface CreateBookingMutationDeps {
  repo: BookingRepository;
  notifier: Notifier;
  /**
   * Load the booking row needed to build the confirmation email.
   * Injected so the mutation is testable without a live Supabase client.
   * Returns null when the row is unavailable (email step is skipped).
   */
  loadConfirmationRow(bookingId: string): Promise<unknown>;
  now: Date;
}

// ──────────────────────────────────────────────────────────────────────────────
// Input (CreateBookingInput + caller identity for email)
// ──────────────────────────────────────────────────────────────────────────────

export interface CreateBookingMutationInput extends CreateBookingInput {
  /** Authenticated user's email address — used to address the confirmation. */
  userEmail: string | undefined;
}

// ──────────────────────────────────────────────────────────────────────────────
// Mutation
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Execute the create-booking orchestration with injected deps.
 *
 * 1. Calls createBookingCore (pure logic, all money/status computed server-side).
 * 2. On success, attempts a best-effort confirmation email via notifier.notify();
 *    any failure in the email path is caught and logged — it NEVER alters the result.
 */
export async function createBookingMutation(
  deps: CreateBookingMutationDeps,
  input: CreateBookingMutationInput,
  policy?: MutationPolicy,
): Promise<CreateBookingResult> {
  const { repo, notifier, loadConfirmationRow, now } = deps;
  const { userEmail, ...coreInput } = input;

  const result = await createBookingCore({ repo, now }, coreInput, policy);

  // Best-effort confirmation email — a failed send NEVER alters the result.
  // For a multi-occurrence series we send one confirmation for the first
  // occurrence (the series, not each individual row) — this is intentional.
  if (result.kind === "success") {
    try {
      const firstBookingId = result.bookingIds[0];
      if (firstBookingId && userEmail) {
        const rawRow = await loadConfirmationRow(firstBookingId);
        const parsed = confirmationRowSchema.safeParse(rawRow);
        if (parsed.success) {
          const row = parsed.data;
          const serviceName = row.services?.name ?? "Booking";
          const settings = await repo.getSettings();
          await notifier.notify({
            type: "booking_confirmed",
            payload: {
              to: userEmail,
              serviceName,
              startsAt: new Date(row.starts_at),
              endsAt: new Date(row.ends_at),
              finalCents: row.final_cents,
              cancellationFullRefundHours:
                settings.cancellation_full_refund_hours,
              lateCancelRefundPct: settings.late_cancel_refund_pct,
            },
          });
        }
      }
    } catch (e: unknown) {
      console.error(
        "createBookingMutation: error sending confirmation email:",
        e,
      );
    }
  }

  return result;
}
