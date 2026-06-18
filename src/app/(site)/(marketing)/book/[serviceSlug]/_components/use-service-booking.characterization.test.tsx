// @vitest-environment jsdom

/**
 * Characterization test for useServiceBooking — pins the load-bearing, thinly
 * covered invariants BEFORE the shared `useBookingScheduler` extraction
 * (SP3b A13). This hook had NO prior automated coverage (the booking
 * "integration" tests exercise the service CORE, never the React hooks), so
 * these assertions are the safety net the extraction must keep green.
 *
 * Pinned invariants (do not relax — a changed expectation means behavior
 * changed, which violates the behavior-preserving refactor contract):
 *   - no selection initially → booking disabled
 *   - `onSelectionChange` identity is STABLE across re-render (deps `[mode]`);
 *     an unstable identity re-fires Scheduler's effect subscription → render
 *     loop (the exact SP3a regression, commit 99040d4)
 *   - selecting a "dayKey@minute" week-slot cell derives `startsAt`
 *   - the live quote is debounced ~400ms before the server preview fires
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
// the REAL implementation — only the IO surface is replaced.
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

// denverMidnight is the REAL helper (importActual spread keeps it un-mocked) —
// used to compute the expected derived instant in the debounce/derivation test.
import { denverMidnight } from "@/features/booking/index.client";
import { DEFAULT_CONSTRAINTS } from "@/features/booking";
import { useServiceBooking } from "./use-service-booking";
import type { UseServiceBookingInput } from "./use-service-booking";

// ── Input builders ────────────────────────────────────────────────────────────

const RULES = {
  bookingOpenMinute: 480,
  bookingCloseMinute: 1080,
  minLeadTimeHours: 2,
  hardMaxAdvanceDays: 90,
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
      constraints: DEFAULT_CONSTRAINTS,
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

const CELL = "2026-07-01@540"; // 09:00 Denver on 2026-07-01
// The instant a 540-minute cell on 2026-07-01 must derive to (real denverMidnight).
const EXPECTED_START_MS = denverMidnight("2026-07-01").getTime() + 540 * 60_000;

describe("useServiceBooking (characterization)", () => {
  beforeEach(() => {
    previewQuoteMock.mockClear();
  });

  it("derives no selection initially and disables booking", () => {
    const { result } = renderHook(() => useServiceBooking(walkInput()));
    expect(result.current.hasSelection).toBe(false);
    expect(result.current.bookEnabled).toBe(false);
  });

  it("keeps onSelectionChange identity stable across an unrelated state change (no render loop)", () => {
    const { result, rerender } = renderHook(() =>
      useServiceBooking(walkInput()),
    );
    const first = result.current.onSelectionChange;
    // A plain re-render must not change the identity…
    rerender();
    expect(result.current.onSelectionChange).toBe(first);
    // …and neither must a genuine controlled-input state change (which forces a
    // re-render with new `selectedPetIds`). This is the real guard: it fails if a
    // future edit adds a per-render-changing dep (selectedPetIds/petsOk/etc.) to
    // the `useCallback([mode])` in use-booking-scheduler.ts.
    act(() => {
      result.current.onPetIdsChange(["pet-1"]);
    });
    expect(result.current.onSelectionChange).toBe(first);
  });

  it("derives startsAt from a 'dayKey@minute' week-slot cell selection", () => {
    const { result } = renderHook(() => useServiceBooking(walkInput()));
    act(() => {
      result.current.onSelectionChange({
        gridDraft: new Set([CELL]),
        selectedDays: new Set(),
      } as never);
    });
    expect(result.current.hasSelection).toBe(true);
  });

  it("debounces the live quote ~400ms and derives the correct startsAt instant", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useServiceBooking(meetGreetInput()));
      act(() => {
        result.current.onSelectionChange({
          gridDraft: new Set([CELL]),
          selectedDays: new Set(),
        } as never);
      });
      // Not yet — the debounce window has not elapsed.
      await act(async () => {
        vi.advanceTimersByTime(399);
      });
      expect(previewQuoteMock).not.toHaveBeenCalled();
      // One more ms crosses the 400ms threshold → the server preview fires once.
      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(previewQuoteMock).toHaveBeenCalledTimes(1);
      // And it quoted against the correctly-derived (Denver-anchored) instant —
      // guards the cell-parse + denverMidnight derivation, not just hasSelection.
      const input = previewQuoteMock.mock.calls[0][0];
      expect(input.startsAt.getTime()).toBe(EXPECTED_START_MS);
    } finally {
      vi.useRealTimers();
    }
  });
});
