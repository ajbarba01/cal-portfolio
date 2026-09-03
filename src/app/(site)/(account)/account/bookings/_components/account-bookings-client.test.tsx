// @vitest-environment jsdom

/**
 * The hub's two views must show the same set. The calendar used to be built
 * from the unfiltered bookings while the day list read the filtered ones, so a
 * filtered-out booking still highlighted its day and opening that day found
 * nothing. Both are now built from `filtered`.
 *
 * Second guard: the stored quote breakdown reaches the booking row, which is
 * the only place a client can see a discount Cal applied.
 */

import { beforeAll, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/feedback/toast", () => ({
  useToast: () => ({ add: vi.fn() }),
}));

import {
  AccountBookingsClient,
  type AccountBookingRow,
} from "./account-bookings-client";

// The Multiswitch measures its indicator through a ResizeObserver, which jsdom
// does not implement.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// Mid-June 2026, so both bookings below are future days on the visible month.
const NOW_ISO = "2026-06-15T18:00:00.000Z";
const MONTH_START_ISO = "2026-06-01T00:00:00.000Z";

function booking(overrides: Partial<AccountBookingRow>): AccountBookingRow {
  return {
    id: "b1",
    starts_at: "2026-06-20T16:00:00.000Z",
    ends_at: "2026-06-20T17:00:00.000Z",
    status: "confirmed",
    final_cents: 5000,
    paid_cents: 5000,
    service_name: "Walk",
    service_slug: "walk",
    ...overrides,
  };
}

/** Day numbers of the cells the month grid is drawing as booked. */
function bookedDayNumbers(): string[] {
  return screen.getAllByTitle("Booked").map((cell) => cell.textContent ?? "");
}

describe("AccountBookingsClient calendar", () => {
  it("drops a filtered-out booking's day from the calendar", async () => {
    const user = userEvent.setup();
    render(
      <AccountBookingsClient
        bookings={[
          booking({ id: "confirmed-one" }),
          booking({
            id: "cancelled-one",
            status: "cancelled",
            starts_at: "2026-06-25T16:00:00.000Z",
            ends_at: "2026-06-25T17:00:00.000Z",
          }),
        ]}
        monthStartIso={MONTH_START_ISO}
        nowIso={NOW_ISO}
        cancellationFullRefundHours={48}
      />,
    );

    expect(bookedDayNumbers()).toEqual(["20", "25"]);

    await user.click(
      screen.getByRole("combobox", { name: "Filter by status" }),
    );
    await user.click(await screen.findByRole("option", { name: "Confirmed" }));

    expect(bookedDayNumbers()).toEqual(["20"]);
  });
});

describe("AccountBookingsClient booking row", () => {
  it("shows the stored breakdown lines, so an applied discount is visible", async () => {
    const user = userEvent.setup();
    render(
      <AccountBookingsClient
        bookings={[
          booking({
            quoteBreakdown: {
              lines: [
                { label: "Walk base", amountCents: 10000 },
                { label: "Friends & Family (−50%)", amountCents: -5000 },
              ],
              finalCents: 5000,
            },
          }),
        ]}
        monthStartIso={MONTH_START_ISO}
        nowIso={NOW_ISO}
        cancellationFullRefundHours={48}
      />,
    );

    await user.click(screen.getByRole("button", { name: "List" }));

    expect(screen.getByText("Friends & Family (−50%)")).toBeInTheDocument();
    expect(screen.getByText("-$50.00")).toBeInTheDocument();
  });
});
