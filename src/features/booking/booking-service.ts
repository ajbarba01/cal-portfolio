/**
 * Booking orchestration — re-export barrel.
 *
 * Per-concern cores live in sibling `*-core.ts` files (see ADR-0001 / CONTEXT.md):
 * shared deps + schemas in `booking-service-shared.ts`; quote/create/reschedule/
 * cancel/admin-actions/edit each in their own core. This file re-exports them so
 * every existing `from "@/features/booking/booking-service"` / `from "./booking-service"`
 * importer (and `booking/index.ts`) keeps working unchanged.
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

export * from "./booking-service-shared";
export * from "./quote-core";
export * from "./create-core";
export * from "./reschedule-core";
export * from "./cancel-core";
export * from "./admin-actions-core";
export * from "./edit-core";
