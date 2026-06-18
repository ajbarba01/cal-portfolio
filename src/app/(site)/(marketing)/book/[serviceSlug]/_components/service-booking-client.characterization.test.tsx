// @vitest-environment jsdom

/**
 * Characterization test for ServiceBookingClient — pins the PUBLIC booking
 * flow's rendered step structure BEFORE the shared <BookingFlow> extraction
 * (SP5a Task 10). The public booking page is the load-bearing revenue path, so
 * this render test is the safety net the extraction must keep green: it asserts
 * the steps render in order with their exact headings + the primary CTA gating.
 *
 * Pinned invariants (do not relax — a changed expectation means the public flow
 * changed, which violates the behavior-preserving refactor contract):
 *   - Step 1 calendar heading renders ("1. Pick a day" for a week-slots service)
 *   - Step 2 pets section renders for a pet-aware service (dog-only walk → "Which dogs?")
 *   - Step 3 details/quantities section renders ("Details")
 *   - For a "ready" viewer with no selection: the price box shows the empty
 *     prompt, NOT the Book CTA (no quote yet)
 *   - For a guest viewer: the sign-in GATE panel renders instead of the receipt
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/feedback/toast", () => ({
  useToast: () => ({ add: vi.fn() }),
}));

// Replace only the websocket/Supabase IO surface of the client barrel; the rest
// (Scheduler, PetAssignment, QuantityForm, QuotePanel, helpers) is REAL so the
// render reflects the true step structure.
const { previewQuoteMock, createBookingMock } = vi.hoisted(() => ({
  previewQuoteMock: vi.fn(async () => ({ kind: "not_authenticated" })),
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

import { ServiceBookingClient } from "./service-booking-client";
import { DEFAULT_CONSTRAINTS } from "@/features/booking";

const RULES = {
  bookingOpenMinute: 480,
  bookingCloseMinute: 1080,
  minLeadTimeHours: 2,
  hardMaxAdvanceDays: 90,
};

const WALK_SERVICE = {
  slug: "walk",
  name: "Walk",
  description: null,
  pricingType: "walk" as const,
  defaultDurationMin: 60,
  constraints: DEFAULT_CONSTRAINTS,
};

describe("ServiceBookingClient (characterization)", () => {
  it("renders the stepped flow for a ready, pet-aware viewer (calendar, pets, details)", () => {
    render(
      <ServiceBookingClient
        service={WALK_SERVICE}
        rules={RULES}
        initialBusy={[]}
        authState="ready"
        pets={[]}
        initialSelection={{ start: null, end: null, petIds: [] }}
        myBookingDayKeys={[]}
        formResponses={{}}
        acceptedAuthVersion={null}
        acceptedAuthAt={null}
        viewerDriveBufferMin={0}
      />,
    );

    // Step 1 — calendar (week-slots → "Pick a day").
    // The step number (1) moved to an aria-hidden clay disc; the h2 text is now
    // just the label (SP6 Task 9: step-card heading pattern).
    expect(screen.getByRole("heading", { name: /Pick a day/i })).toBeTruthy();
    // Step 2 — pets (dog-only walk → "Which dogs?")
    expect(screen.getByRole("heading", { name: /Which dogs\?/i })).toBeTruthy();
    // Step 3 — details / quantities
    expect(screen.getByRole("heading", { name: /Details/i })).toBeTruthy();

    // No selection yet → empty price prompt, no Book CTA.
    expect(
      screen.getByText(/Select a day and time to see your price\./i),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Book now/i })).toBeNull();
  });

  it("renders the sign-in gate (not the receipt) for a guest viewer", () => {
    render(
      <ServiceBookingClient
        service={WALK_SERVICE}
        rules={RULES}
        initialBusy={[]}
        authState="guest"
        pets={[]}
        initialSelection={{ start: null, end: null, petIds: [] }}
        myBookingDayKeys={[]}
        formResponses={{}}
        acceptedAuthVersion={null}
        acceptedAuthAt={null}
        viewerDriveBufferMin={0}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /Sign in to book/i }),
    ).toBeTruthy();
    // The price prompt / receipt is gated away for guests.
    expect(
      screen.queryByText(/Select a day and time to see your price\./i),
    ).toBeNull();
  });
});
