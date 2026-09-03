// @vitest-environment jsdom

/**
 * useServiceBooking — the state behind the public booking flow.
 *
 * Three invariants carry the flow and none of them are visible in the rendered
 * output, so they are asserted here directly:
 *   - nothing is bookable until a selection derives a real instant;
 *   - `onSelectionChange` keeps a stable identity, because the Scheduler
 *     subscribes to it in an effect and a new function every render turns that
 *     subscription into a render loop;
 *   - the live quote is debounced, so dragging across the time grid does not
 *     issue a server request per cell.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Router + toast are side-effect sinks the hook only writes to — stub them.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/feedback/toast", () => ({
  useToast: () => ({ add: vi.fn() }),
}));

// The data hooks open Supabase Realtime channels (websockets) that cannot run
// in jsdom; stub them to static, empty sources. Everything else in the client
// barrel (date helpers, capabilities, scheduler-data, validateStayRange, …) is
// the real implementation — only the IO surface is replaced.
// vi.hoisted so these exist when the hoisted vi.mock factory below runs.
const { previewQuoteMock, createBookingMock } = vi.hoisted(() => ({
  previewQuoteMock: vi.fn(async (_input: { startsAt: Date }) => ({
    kind: "not_authenticated",
  })),
  createBookingMock: vi.fn(),
}));

vi.mock("@/features/booking/index.client", async (importActual) => {
  const actual =
    await importActual<typeof import("@/features/booking/index.client")>();
  return {
    ...actual,
    useAvailability: () => ({
      openWindows: [],
      openSlots: [],
      loading: false,
      error: null,
    }),
    useBusyRanges: () => ({ busy: [], refresh: vi.fn() }),
    useOvernightNights: () => ({
      overnightNights: new Set<string>(),
      loading: false,
      error: null,
    }),
    previewQuote: previewQuoteMock,
    createBooking: createBookingMock,
  };
});

// denverMidnight is the real helper (the importActual spread leaves it
// un-mocked) — used to compute the expected derived instant below.
import { denverMidnight } from "@/features/booking/index.client";
import type { ScheduleSelectionState } from "@/features/booking/index.client";
import { DEFAULT_CONSTRAINTS } from "@/features/booking";
import type { Constraints } from "@/features/pricing";
import { useServiceBooking } from "./use-service-booking";
import type { UseServiceBookingInput } from "./use-service-booking";

// ── Input builders ────────────────────────────────────────────────────────────

const RULES = {
  bookingOpenMinute: 480,
  bookingCloseMinute: 1080,
  minLeadTimeHours: 2,
  hardMaxAdvanceDays: 90,
};

/** Realistic walk constraints: dog-only, 30–180 min, max 2 dogs, 15-min grid. */
const WALK_CONSTRAINTS: Constraints = {
  intervalMin: 15,
  minDurationMin: 30,
  maxDurationMin: 180,
  maxDogs: 2,
  allowedSpecies: ["dog"],
};

function walkInput(
  overrides?: Partial<UseServiceBookingInput>,
): UseServiceBookingInput {
  return {
    service: {
      slug: "walk",
      name: "Walk",
      description: null,
      pricingType: "walk",
      defaultDurationMin: 60,
      constraints: WALK_CONSTRAINTS,
    },
    rules: RULES,
    initialBusy: [],
    authState: "ready",
    pets: [],
    initialSelection: { start: null, end: null, petIds: [] },
    myBookingDayKeys: [],
    ...overrides,
  };
}

/** A week-slots service whose petsOk is unconditionally true (no pets required). */
function meetGreetInput(): UseServiceBookingInput {
  return walkInput({
    service: {
      slug: "meet-greet",
      name: "Meet & Greet",
      description: null,
      pricingType: "meet_greet",
      defaultDurationMin: 30,
      constraints: DEFAULT_CONSTRAINTS,
    },
  });
}

const DAY_KEY = "2026-07-01";
const CELL_MINUTE = 540; // 09:00 Denver
const CELL = `${DAY_KEY}@${CELL_MINUTE}`;
/** The instant that cell must derive to, via the real Denver-midnight helper. */
const EXPECTED_START_MS =
  denverMidnight(DAY_KEY).getTime() + CELL_MINUTE * 60_000;

/** The Scheduler's selection state with one time-grid cell drafted. */
function selectionWithCell(cellId: string): ScheduleSelectionState {
  return {
    selectedDays: new Set<string>(),
    anchorDay: null,
    focusedWeekStart: "2026-06-28",
    gridDraft: new Set([cellId]),
    inspectedBookingId: null,
  };
}

describe("useServiceBooking", () => {
  beforeEach(() => {
    previewQuoteMock.mockClear();
  });

  it("starts with nothing selected and nothing bookable", () => {
    const { result } = renderHook(() => useServiceBooking(walkInput()));

    expect(result.current.hasSelection).toBe(false);
    expect(result.current.bookEnabled).toBe(false);
    expect(result.current.startsAt).toBeNull();
  });

  it("keeps onSelectionChange identity stable across an unrelated state change", () => {
    const { result, rerender } = renderHook(() =>
      useServiceBooking(walkInput()),
    );
    const first = result.current.onSelectionChange;

    // A plain re-render must not change the identity…
    rerender();
    expect(result.current.onSelectionChange).toBe(first);

    // …and neither must a genuine controlled-input state change, which forces a
    // re-render with new `selectedPetIds`. This is the real guard: it fails if a
    // future edit adds a per-render-changing dependency to the callback, and the
    // Scheduler's effect subscription then re-fires on every render.
    act(() => {
      result.current.onPetIdsChange(["pet-1"]);
    });
    expect(result.current.onSelectionChange).toBe(first);
  });

  it("derives the Denver instant a week-slot cell stands for", () => {
    const { result } = renderHook(() => useServiceBooking(walkInput()));

    act(() => {
      result.current.onSelectionChange(selectionWithCell(CELL));
    });

    expect(result.current.hasSelection).toBe(true);
    // A cell id carries a wall-clock day and minute; the booking is stored as an
    // instant, and Denver's offset is what stands between them.
    expect(result.current.startsAt?.getTime()).toBe(EXPECTED_START_MS);
    expect(result.current.endsAt?.getTime()).toBeGreaterThan(EXPECTED_START_MS);
  });

  it("debounces the live quote and quotes the instant it derived", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useServiceBooking(meetGreetInput()));
      act(() => {
        result.current.onSelectionChange(selectionWithCell(CELL));
      });

      // Not yet — the debounce window has not elapsed, so a drag across the grid
      // does not become one server round-trip per cell.
      await act(async () => {
        vi.advanceTimersByTime(399);
      });
      expect(previewQuoteMock).not.toHaveBeenCalled();

      // One more millisecond crosses the threshold and the preview fires once.
      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(previewQuoteMock).toHaveBeenCalledTimes(1);
      expect(previewQuoteMock.mock.calls[0]?.[0].startsAt.getTime()).toBe(
        EXPECTED_START_MS,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("issues one quote for a run of selections inside the debounce window", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useServiceBooking(meetGreetInput()));

      for (const minute of [540, 555, 570]) {
        act(() => {
          result.current.onSelectionChange(
            selectionWithCell(`${DAY_KEY}@${minute}`),
          );
        });
        await act(async () => {
          vi.advanceTimersByTime(100);
        });
      }
      await act(async () => {
        vi.advanceTimersByTime(400);
      });

      expect(previewQuoteMock).toHaveBeenCalledTimes(1);
      // The last cell wins — the debounce drops the intermediate selections
      // rather than quoting a stale one.
      expect(previewQuoteMock.mock.calls[0]?.[0].startsAt.getTime()).toBe(
        denverMidnight(DAY_KEY).getTime() + 570 * 60_000,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
