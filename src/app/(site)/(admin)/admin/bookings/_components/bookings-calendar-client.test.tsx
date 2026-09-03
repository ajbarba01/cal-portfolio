// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { BookingCalendarRow } from "@/features/admin/index.client";

import { BookingsCalendarClient } from "./bookings-calendar-client";

// The Multiswitch measures its indicator through a ResizeObserver, which jsdom
// does not implement.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => "/admin/bookings",
  useSearchParams: () => new URLSearchParams(""),
}));

const bookings: BookingCalendarRow[] = [
  {
    id: "booking-1",
    client_id: "client-1",
    client_name: "Jane Doe",
    service_name: "Dog Walk",
    status: "confirmed",
    starts_at: "2026-09-12T21:00:00.000Z",
    ends_at: "2026-09-12T21:30:00.000Z",
    final_cents: 4500,
    payment_status: "paid",
  },
];

/** Denver midnight on September 1 2026 — the window `?month=2026-09` loads. */
const SEPTEMBER_START = "2026-09-01T06:00:00.000Z";

/** Denver midnight on October 1 2026 — what `?month=2026-10` would load. */
const OCTOBER_START = "2026-10-01T06:00:00.000Z";

function renderHub() {
  return render(
    <BookingsCalendarClient
      bookings={bookings}
      monthStartIso={SEPTEMBER_START}
      nowIso="2026-09-12T18:00:00.000Z"
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BookingsCalendarClient month navigation", () => {
  // Two month names are on screen — the hub's own caption above the grid, and
  // the grid's own — so the assertions count them: the defect they guard is the
  // two disagreeing, not either one being absent.
  it("captions the month the window was loaded for", () => {
    renderHub();
    expect(screen.getAllByText(/September 2026/)).toHaveLength(2);
  });

  it("moves both captions and asks for the new month's rows on Next Month", async () => {
    const user = userEvent.setup();
    renderHub();

    await user.click(screen.getByRole("button", { name: /next month/i }));

    // The hub's caption follows the grid immediately rather than staying a
    // month behind on the window the page was loaded with.
    expect(screen.getAllByText(/October 2026/)).toHaveLength(2);
    expect(screen.queryByText(/September 2026/)).not.toBeInTheDocument();
    // And the rows follow too: without the `?month=` round trip the grid would
    // be showing October over September's bookings.
    expect(push).toHaveBeenCalledWith("/admin/bookings?month=2026-10", {
      scroll: false,
    });
  });

  it("hides the day panel for a day left behind by Next Month", async () => {
    const user = userEvent.setup();
    const { container, rerender } = renderHub();

    const day12 = container.querySelector<HTMLButtonElement>(
      '[data-day-key="2026-09-12"]',
    );
    if (!day12) throw new Error("no month cell for 2026-09-12");
    await user.click(day12);
    expect(screen.getByText(/Sat, Sep 12 · time of day/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /next month/i }));

    // The server round trip lands: October's rows (none on Sept 12) replace
    // September's, while the day itself is still "selected".
    rerender(
      <BookingsCalendarClient
        bookings={[]}
        monthStartIso={OCTOBER_START}
        nowIso="2026-09-12T18:00:00.000Z"
      />,
    );

    // The stale heading, and the false "no bookings" reading it drags in for
    // a day that had one, must not linger once October is on screen.
    expect(
      screen.queryByText(/Sat, Sep 12 · time of day/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/No bookings to show for this day\./),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Pick a day above to see its bookings\./),
    ).toBeInTheDocument();
  });
});
