/**
 * Pure booking state machine.
 *
 * Models the lifecycle of a booking as a total transition function. All inputs
 * are passed in; no IO, no clock reads, no side-effects. (#5 ENGINEERING)
 *
 * STATE MODEL
 * -----------
 * `BookingState` = `'draft' | BookingStatus`.
 *
 * `'draft'` is an in-memory pre-insert sentinel — it is NEVER persisted to the
 * database. It represents the absence of a booking record and is the only state
 * from which `submit` is valid. All other states are the Postgres
 * `booking_status` enum values.
 *
 * This sentinel approach keeps `transition` a single total pure function:
 * every booking creation goes through `draft + submit → <first DB status>`.
 *
 * SIDE-EFFECTS / PROJECTIONS (NOT states)
 * ----------------------------------------
 * `quote`, `prepay`, and `reminder` are NOT booking states. They are
 * side-effects or projections:
 *   - Payment status is a separate `payment_status` projection written only by
 *     the Stripe webhook.
 *   - Reminders are tracked via a `reminder_sent_at` timestamp column, not a
 *     status transition.
 *
 * STATE DIAGRAM (authoritative — mirrors DESIGN.md)
 * --------------------------------------------------
 *   draft + submit
 *     ├── requiresApproval=true  → pending_approval
 *     └── requiresApproval=false → confirmed
 *   pending_approval + approve  → confirmed
 *   pending_approval + decline  → declined    (terminal)
 *   pending_approval + cancel   → cancelled   (terminal)
 *   confirmed + complete        → completed   (terminal)
 *   confirmed + cancel          → cancelled   (terminal)
 *   confirmed + no_show         → no_show     (terminal; writes a client_debits row)
 *   completed | declined | cancelled | no_show + any → {error}
 */

// ---------------------------------------------------------------------------
// Types — closed unions mirroring the DB enum exactly
// ---------------------------------------------------------------------------

/**
 * The five booking statuses persisted in the `booking_status` Postgres enum.
 * Mirror this union exactly; never add values here without a DB migration.
 */
export type BookingStatus =
  | "pending_approval"
  | "confirmed"
  | "completed"
  | "declined"
  | "cancelled"
  | "no_show";

/**
 * In-memory pre-insert sentinel prepended to the DB status union.
 * `'draft'` is NEVER persisted — it represents the absence of a booking record.
 * The machine accepts it as the starting state for the `submit` event.
 */
export type BookingState = "draft" | BookingStatus;

/** Events that drive the state machine. */
export type BookingEvent =
  | "submit"
  | "approve"
  | "decline"
  | "complete"
  | "cancel"
  | "no_show";

/**
 * Context passed to every `transition` call.
 * Only the `submit` event reads `requiresApproval`; all other events ignore it
 * but the caller always supplies it for a uniform function signature.
 *
 * `requiresApproval` is derived upstream (Phase 3 distance pipeline / admin
 * flag) — this module never computes it.
 */
export interface TransitionContext {
  requiresApproval: boolean;
}

/**
 * Discriminated result union returned by `transition`.
 *
 * Callers narrow on `'state' in result` (success) or `'error' in result`
 * (invalid transition).  The function NEVER throws — invalid (state, event)
 * pairs always return `{ error }`.
 */
export type TransitionResult = { state: BookingStatus } | { error: string };

// ---------------------------------------------------------------------------
// Named constants
// ---------------------------------------------------------------------------

/**
 * Terminal booking statuses. Once a booking reaches any of these states no
 * further transitions are valid.
 */
export const TERMINAL_STATUSES: ReadonlySet<BookingStatus> =
  new Set<BookingStatus>(["completed", "declined", "cancelled", "no_show"]);

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/**
 * Applies a single booking event to a current state and returns the new state
 * or an error description.
 *
 * Total function: NEVER throws. Invalid (state, event) pairs return
 * `{ error: <descriptive message> }` so callers can surface the reason to the
 * UI or log it without try/catch.
 *
 * @param state - Current booking state (use `'draft'` for a new, unsaved booking).
 * @param event - The event to apply.
 * @param ctx   - Transition context; only `submit` reads `requiresApproval`.
 */
export function transition(
  state: BookingState,
  event: BookingEvent,
  ctx: TransitionContext,
): TransitionResult {
  // Terminal guard — checked first so the per-state switch stays clean.
  if (state !== "draft" && TERMINAL_STATUSES.has(state)) {
    return {
      error: `Booking is in terminal state '${state}'; '${event}' is not allowed.`,
    };
  }

  switch (state) {
    case "draft": {
      if (event === "submit") {
        return {
          state: ctx.requiresApproval ? "pending_approval" : "confirmed",
        };
      }
      return {
        error: `Event '${event}' is not valid from state 'draft'; only 'submit' is allowed.`,
      };
    }

    case "pending_approval": {
      switch (event) {
        case "approve":
          return { state: "confirmed" };
        case "decline":
          return { state: "declined" };
        case "cancel":
          return { state: "cancelled" };
        default:
          return {
            error: `Event '${event}' is not valid from state 'pending_approval'; allowed: approve, decline, cancel.`,
          };
      }
    }

    case "confirmed": {
      switch (event) {
        case "complete":
          return { state: "completed" };
        case "cancel":
          return { state: "cancelled" };
        case "no_show":
          return { state: "no_show" };
        default:
          return {
            error: `Event '${event}' is not valid from state 'confirmed'; allowed: complete, cancel, no_show.`,
          };
      }
    }

    // Terminal states are caught by the guard above; these cases exist only so
    // TypeScript can narrow the default branch to `never` for exhaustiveness.
    case "completed":
    case "declined":
    case "cancelled":
    case "no_show":
      // Unreachable at runtime — the terminal guard returns early.
      return {
        error: `Booking is in terminal state '${state}'; '${event}' is not allowed.`,
      };

    default: {
      // Exhaustiveness check — TS errors here if BookingState gains a new value
      // without a corresponding case above.
      const _exhaustive: never = state;
      return {
        error: `Unknown booking state: '${String(_exhaustive)}'.`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Status display
// ---------------------------------------------------------------------------

/**
 * The `Badge` variants a booking status can resolve to. A subset of the badge
 * kit's full variant list, named identically so a pill can be spread straight
 * onto `<Badge variant={…}>`.
 */
export type BookingStatusPillVariant =
  | "default"
  | "pending"
  | "available"
  | "destructive";

/** A booking status rendered as a badge: visible text plus the variant token. */
export interface BookingStatusPill {
  readonly label: string;
  readonly variant: BookingStatusPillVariant;
}

const STATUS_PILLS: Record<BookingStatus, BookingStatusPill> = {
  pending_approval: { label: "Pending approval", variant: "pending" },
  confirmed: { label: "Confirmed", variant: "available" },
  completed: { label: "Completed", variant: "default" },
  declined: { label: "Declined", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "destructive" },
  no_show: { label: "No-show", variant: "destructive" },
};

/**
 * Maps a booking status to its display label and badge variant. Pure data — no
 * JSX and no color values; the UI layer turns the variant into design tokens.
 *
 * The admin bookings row is the canonical map: it is the only one of the four
 * shipping copies that covers all six statuses. The account view disagrees on
 * `completed` and `no_show` and the admin client-detail map omits `no_show`
 * entirely; both are drift, and both lose here.
 *
 * The returned object is the shared entry, not a copy, so its fields are
 * readonly — the per-view maps this replaces each built a fresh object.
 */
export function bookingStatusPill(status: BookingStatus): BookingStatusPill {
  return STATUS_PILLS[status];
}
