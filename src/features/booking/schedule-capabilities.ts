/**
 * Per-context capability objects — the expandability seam gating which
 * scheduler parts mount. Pass one of these presets (or a custom object)
 * into the scheduler to enable/disable day-selection, intraday painting,
 * overnight mode, editing, and week navigation.
 *
 * `intervalMinutes` is intentionally omitted from BOOK_WALK_CAPABILITIES.
 * The caller fills it in at runtime based on the selected service duration.
 */

export interface SchedulerCapabilities {
  /** How many calendar days the user may select. */
  daySelection: "none" | "single" | "range" | "multi";
  /** Whether intraday time-slot painting is supported. */
  intraday: "none" | "free-paint" | "fixed-interval";
  /**
   * Slot size in minutes for "fixed-interval" mode.
   * Caller must supply this when daySelection = "single" + intraday = "fixed-interval".
   */
  intervalMinutes?: number;
  /** Whether overnight (multi-night stay) booking is enabled. */
  overnight: boolean;
  /** Whether the user can edit/clear existing selections. */
  editable: boolean;
  /** Whether the week-navigation controls are shown. */
  weekNavigable: boolean;
  /** Whether the admin can mark/unmark days as premium (holiday surcharge days). */
  premiumMarkable: boolean;
  /**
   * Whether busy (booked) days can be clicked for inspection even when editable
   * is false. Used by the admin Bookings hub (INSPECT_CAPABILITIES) so booked
   * cells are selectable/inspectable. Public booking presets leave this unset
   * (busy stays disabled there).
   */
  inspectable?: boolean;
}

/** Admin view: full multi-select + free intraday painting, overnight, editable. */
export const ADMIN_CAPABILITIES: SchedulerCapabilities = {
  daySelection: "multi",
  intraday: "free-paint",
  overnight: true,
  editable: true,
  weekNavigable: true,
  premiumMarkable: true,
};

/**
 * House-sitting booking: range selection, no intraday slots, no week nav.
 * Overnight is handled at the booking level, not via intraday slots.
 */
export const BOOK_HOUSE_SITTING_CAPABILITIES: SchedulerCapabilities = {
  daySelection: "range",
  intraday: "none",
  overnight: false,
  editable: false,
  weekNavigable: false,
  premiumMarkable: false,
};

/**
 * Read-only inspection: single-day selection drives a read DayTimeline; no
 * intraday painting, no overnight, no editing, no premium marking. Mounts
 * MonthGrid + DayTimeline purely for inspection (the admin Bookings hub).
 * Because `editable` is false, the DayPanel returns null and the month/timeline
 * surfaces never mutate.
 */
export const INSPECT_CAPABILITIES: SchedulerCapabilities = {
  daySelection: "single",
  intraday: "none",
  overnight: false,
  editable: false,
  weekNavigable: true,
  premiumMarkable: false,
  inspectable: true,
};

/**
 * Walk booking: single day + fixed-interval time slots + week nav.
 * Set `intervalMinutes` to the service duration before passing to the scheduler.
 */
export const BOOK_WALK_CAPABILITIES: SchedulerCapabilities = {
  daySelection: "single",
  intraday: "fixed-interval",
  overnight: false,
  editable: false,
  weekNavigable: true,
  premiumMarkable: false,
};
