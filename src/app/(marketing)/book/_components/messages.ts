/**
 * Pure result-to-message mapping for the /book flow.
 *
 * No IO, no React, no DB — testable with plain Vitest.
 * The client component calls these and renders the returned text + tone.
 */

import type { CreateBookingResult } from "@/features/booking/actions";
import type { PreviewActionResult } from "@/features/booking/quote-action";
import type { BookingQuotePreview } from "@/features/booking/booking-service";

// ── Tone ─────────────────────────────────────────────────────────────────────

export type MessageTone = "success" | "error" | "info";

export interface UserMessage {
  tone: MessageTone;
  /** Plain text only — never HTML. The renderer escapes it. */
  text: string;
  /**
   * Optional structured call-to-action the renderer turns into a real element
   * (e.g. a `/login` link), so message text stays plain and injection-free.
   */
  action?: "login";
}

// ── createBooking result ──────────────────────────────────────────────────────

/**
 * Maps a CreateBookingResult + the last successful preview's requiresApproval
 * flag to a user-facing message.
 *
 * "confirmed vs pending" rule:
 *   - success + requiresApproval=false → "Booked and confirmed!"
 *   - success + requiresApproval=true  → "Request submitted — pending Cal's approval"
 */
export function createResultMessage(
  result: CreateBookingResult,
  requiresApproval: boolean,
): UserMessage {
  switch (result.kind) {
    case "success":
      return requiresApproval
        ? { tone: "info", text: "Request submitted — pending Cal's approval." }
        : { tone: "success", text: "Booked and confirmed!" };

    case "slot_taken":
      return {
        tone: "error",
        text: "That slot was just taken — pick another time.",
      };

    case "unavailable":
      return { tone: "error", text: result.reason };

    case "refuse":
      return { tone: "error", text: result.reason };

    case "validation_error":
      return { tone: "error", text: result.message };

    case "error":
      return { tone: "error", text: result.message };
  }
}

// ── previewQuote result ───────────────────────────────────────────────────────

/** Discriminated result for the quote preview path. */
export type PreviewMessageResult =
  | { kind: "quote"; preview: BookingQuotePreview }
  | { kind: "message"; message: UserMessage };

/**
 * Maps a PreviewActionResult to either a quote (render the breakdown) or a
 * user-facing message (render the error/info banner).
 *
 * - `not_authenticated` → "info" tone prompting login
 * - `success`           → `{ kind: "quote", preview }`
 * - everything else     → `{ kind: "message", message }`
 */
export function previewResultMessage(
  result: PreviewActionResult,
): PreviewMessageResult {
  switch (result.kind) {
    case "not_authenticated":
      return {
        kind: "message",
        message: {
          tone: "info",
          text: "Please log in to get a quote.",
          action: "login",
        },
      };

    case "success":
      return { kind: "quote", preview: result.preview };

    case "refuse":
      return {
        kind: "message",
        message: { tone: "error", text: result.reason },
      };

    case "validation_error":
      return {
        kind: "message",
        message: { tone: "error", text: result.message },
      };

    case "error":
      return {
        kind: "message",
        message: { tone: "error", text: result.message },
      };
  }
}
