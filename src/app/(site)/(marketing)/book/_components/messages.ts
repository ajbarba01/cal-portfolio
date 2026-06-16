/**
 * Pure result-to-message mapping for the /book flow.
 *
 * No IO, no React, no DB — testable with plain Vitest.
 * The client component calls these and renders the returned text + tone.
 */

import type {
  PreviewActionResult,
  CreateBookingResult,
  BookingQuotePreview,
} from "@/features/booking";

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

    case "blocked_debt":
      return {
        tone: "error",
        text: `You have an outstanding balance of ${formatCents(result.owedCents)}. Please settle it before booking.`,
      };

    case "onboarding_incomplete":
      return {
        tone: "info",
        text: "Complete your onboarding before booking.",
      };

    case "profiles_incomplete":
      return {
        tone: "info",
        text: "Complete your required profiles before booking.",
      };

    case "validation_error":
      return { tone: "error", text: result.message };

    case "error":
      return { tone: "error", text: result.message };
  }
}

/** Formats integer cents as a USD string (plain text, no locale surprises). */
function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Success-panel summary (U1) ────────────────────────────────────────────────

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** "Mon, Jun 16" in America/Denver. */
function formatDenverDay(d: Date): string {
  return d.toLocaleDateString("en-US", {
    timeZone: "America/Denver",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * One-line recap for the booking success panel, e.g.
 *   "Walk · Mon, Jun 16 · 1.5 hr · Juniper"
 *   "House sitting · Mon, Jun 16 – Thu, Jun 19 · 3 nights · Juniper, Moss"
 *
 * Pure string composition — duration/nights derived from the instants so the
 * line always matches what was actually booked.
 */
export function bookingSuccessSummary(args: {
  serviceName: string;
  mode: "week-slots" | "month-range";
  startsAt: Date;
  endsAt: Date;
  petNames: string[];
}): string {
  const { serviceName, mode, startsAt, endsAt, petNames } = args;
  const parts: string[] = [serviceName];

  if (mode === "month-range") {
    const nights = Math.round(
      (endsAt.getTime() - startsAt.getTime()) / MS_PER_DAY,
    );
    parts.push(
      `${formatDenverDay(startsAt)} – ${formatDenverDay(endsAt)}`,
      `${nights} night${nights === 1 ? "" : "s"}`,
    );
  } else {
    const minutes = Math.round(
      (endsAt.getTime() - startsAt.getTime()) / MS_PER_MIN,
    );
    // 60 → "1 hr", 90 → "1.5 hr", 45 → "45 min".
    const duration = minutes < 60 ? `${minutes} min` : `${minutes / 60} hr`;
    parts.push(formatDenverDay(startsAt), duration);
  }

  if (petNames.length > 0) parts.push(petNames.join(", "));
  return parts.join(" · ");
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

    case "blocked_debt":
      return {
        kind: "message",
        message: {
          tone: "error",
          text: `You have an outstanding balance of ${formatCents(result.owedCents)}. Please settle it before booking.`,
        },
      };

    case "onboarding_incomplete":
      return {
        kind: "message",
        message: {
          tone: "info",
          text: "Complete your onboarding before booking.",
        },
      };

    case "profiles_incomplete":
      return {
        kind: "message",
        message: {
          tone: "info",
          text: "Complete your required profiles before booking.",
        },
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
