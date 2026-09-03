// @vitest-environment jsdom

/**
 * The availability painter's mutation wiring.
 *
 * The four scheduler callbacks are the whole of B17: each one awaits its server
 * action inside the optimistic transition and has to say something when the
 * action refuses, because an optimistic paint that silently snaps back explains
 * nothing. Declining the cancel confirm is Cal's own answer, not a refusal, so
 * that path stays quiet.
 *
 * The confirm's per-booking line is pinned here too: the gate matches on instant
 * overlap, so a house-sit that began days earlier lands in a list that offers to
 * cancel it at a full refund — the line has to name the day it started on, and
 * must not offer a refund at all while payments are off.
 *
 * The multi-day scope is the other half: the two day toggles read and write the
 * WHOLE selection, so a switch that showed one day's state would silently flip
 * the rest.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";

const {
  paymentsEnabled,
  toastAdd,
  cancelBookingMock,
  createWindowsBatchMock,
  setWindowUnavailableMock,
  setOvernightNightsBatchMock,
  setPremiumDaysBatchMock,
} = vi.hoisted(() => ({
  paymentsEnabled: { value: true },
  toastAdd: vi.fn(),
  cancelBookingMock: vi.fn(),
  createWindowsBatchMock: vi.fn(),
  setWindowUnavailableMock: vi.fn(),
  setOvernightNightsBatchMock: vi.fn(),
  setPremiumDaysBatchMock: vi.fn(),
}));

vi.mock("@/components/feedback/toast", () => ({
  useToast: () => ({ add: toastAdd }),
}));

// The kill-switch is a build-time constant, so a getter is the only way to run
// both modes in one file.
vi.mock("@/lib/payments-enabled", () => ({
  get PAYMENTS_ENABLED() {
    return paymentsEnabled.value;
  },
}));

// Replace the four server actions; `bookingsInWindowSlice` is the real pure
// predicate, so the cancel gate under test is the one that ships.
vi.mock("@/features/admin/index.client", async () => {
  const { bookingsInWindowSlice } =
    await import("@/features/admin/window-slice");
  return {
    bookingsInWindowSlice,
    createWindowsBatch: createWindowsBatchMock,
    setWindowUnavailable: setWindowUnavailableMock,
    setOvernightNightsBatch: setOvernightNightsBatchMock,
    setPremiumDaysBatch: setPremiumDaysBatchMock,
  };
});

// Only the cancel action is replaced — Scheduler, the confirm dialog and the
// day classification stay real so the render exercises the true wiring.
vi.mock("@/features/booking/index.client", async (importActual) => {
  const actual =
    await importActual<typeof import("@/features/booking/index.client")>();
  return { ...actual, cancelBooking: cancelBookingMock };
});

import { AvailabilityClient } from "./availability-client";
import type { AdminBusyRangeView } from "@/features/admin/index.client";
import type { BookingRuleSettings } from "@/features/booking/index.client";

/** Noon in Denver on 2026-07-08 — the month the grid opens on. */
const NOW_ISO = "2026-07-08T18:00:00.000Z";

const RULES: BookingRuleSettings = {
  bookingOpenMinute: 480,
  bookingCloseMinute: 1080,
  minLeadTimeHours: 2,
  hardMaxAdvanceDays: 90,
};

/** A house-sit running noon Jul 14 → noon Jul 16, Denver. */
const STAY: AdminBusyRangeView = {
  bookingId: "stay-1",
  startsAt: "2026-07-14T18:00:00.000Z",
  endsAt: "2026-07-16T18:00:00.000Z",
  status: "confirmed",
  clientId: "client-1",
  clientName: "Jane Doe",
  finalCents: 24000,
  pets: [],
};

type ClientProps = Parameters<typeof AvailabilityClient>[0];

function renderClient(props: Partial<ClientProps> = {}) {
  return render(
    <AvailabilityClient
      initialWindows={[]}
      initialBusy={[]}
      initialNights={[]}
      initialPremiumDays={[]}
      rules={RULES}
      nowIso={NOW_ISO}
      {...props}
    />,
  );
}

/** Click the month cell for `dayNumber` (rdp renders day buttons inside <td>). */
function selectDay(container: HTMLElement, dayNumber: string) {
  const cell = Array.from(
    container.querySelectorAll<HTMLButtonElement>("td button"),
  ).find((b) => !b.disabled && b.textContent?.trim() === dayNumber);
  if (!cell) throw new Error(`no selectable month cell for day ${dayNumber}`);
  fireEvent.click(cell);
}

beforeEach(() => {
  vi.clearAllMocks();
  paymentsEnabled.value = true;
});

afterEach(cleanup);

describe("AvailabilityClient mutation feedback", () => {
  it("toasts once when the server refuses a mutation", async () => {
    setPremiumDaysBatchMock.mockResolvedValue({
      kind: "error",
      message: "Something went wrong. Please try again.",
    });

    const { container } = renderClient();
    selectDay(container, "15");
    fireEvent.click(screen.getByRole("switch", { name: /Premium day/ }));

    await waitFor(() => expect(toastAdd).toHaveBeenCalledTimes(1));
    expect(toastAdd).toHaveBeenCalledWith({
      type: "error",
      title: "Couldn't save",
      description: "Something went wrong. Please try again.",
    });
  });

  it("says nothing and changes nothing when the cancel confirm is declined", async () => {
    const { container } = renderClient({
      initialBusy: [STAY],
      initialNights: ["2026-07-15"],
    });
    selectDay(container, "15");
    fireEvent.click(
      screen.getByRole("switch", { name: /Overnight available/ }),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Keep bookings" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Keep bookings" }),
      ).not.toBeInTheDocument(),
    );
    expect(setOvernightNightsBatchMock).not.toHaveBeenCalled();
    expect(cancelBookingMock).not.toHaveBeenCalled();
    expect(toastAdd).not.toHaveBeenCalled();
  });
});

describe("AvailabilityClient cancel confirm", () => {
  it("dates a stay that started before the day being edited", async () => {
    const { container } = renderClient({
      initialBusy: [STAY],
      initialNights: ["2026-07-15"],
    });
    selectDay(container, "15");
    fireEvent.click(
      screen.getByRole("switch", { name: /Overnight available/ }),
    );

    expect(
      await screen.findByText(/^Jane Doe · Jul 14, 12:00\s?PM$/),
    ).toBeInTheDocument();
  });

  it("leaves the date off a stay that started on the day being edited", async () => {
    const { container } = renderClient({
      initialBusy: [STAY],
      initialNights: ["2026-07-14"],
    });
    selectDay(container, "14");
    fireEvent.click(
      screen.getByRole("switch", { name: /Overnight available/ }),
    );

    expect(
      await screen.findByText(/^Jane Doe · 12:00\s?PM$/),
    ).toBeInTheDocument();
  });

  it("toasts when a cancel inside the confirm is refused", async () => {
    cancelBookingMock.mockResolvedValue({
      kind: "error",
      message: "Something went wrong. Please try again.",
    });

    const { container } = renderClient({
      initialBusy: [STAY],
      initialNights: ["2026-07-15"],
    });
    selectDay(container, "15");
    fireEvent.click(
      screen.getByRole("switch", { name: /Overnight available/ }),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /^Cancel 1 & block$/ }),
    );

    await waitFor(() => expect(toastAdd).toHaveBeenCalledTimes(1));
    expect(toastAdd).toHaveBeenCalledWith({
      type: "error",
      title: "Couldn't save",
      description: "Something went wrong. Please try again.",
    });
    // The block never ran, and the dialog stays open on a refused cancel.
    expect(setOvernightNightsBatchMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Keep bookings" }),
    ).toBeInTheDocument();
  });
});

describe("AvailabilityClient multi-day scope", () => {
  it("applies a day toggle to every selected day", async () => {
    setPremiumDaysBatchMock.mockResolvedValue({ kind: "success" });

    const { container } = renderClient();
    selectDay(container, "15");
    selectDay(container, "17");
    fireEvent.click(screen.getByRole("switch", { name: /Premium day/ }));

    await waitFor(() => expect(setPremiumDaysBatchMock).toHaveBeenCalled());
    expect(setPremiumDaysBatchMock).toHaveBeenCalledWith(
      ["2026-07-15", "2026-07-17"],
      true,
    );
  });

  it("states the scope of the next action once several days are picked", () => {
    const { container } = renderClient();
    selectDay(container, "15");
    selectDay(container, "17");

    expect(
      screen.getByRole("heading", { name: "2 days selected" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Applies to all selected days"),
    ).toBeInTheDocument();
  });

  it("announces the count as the selection changes", () => {
    // The heading above is out of view for anyone working inside the grid, so
    // the live region under it is what actually reports a keyboard selection.
    const { container } = renderClient();
    const readOut = () =>
      container.querySelector('p[aria-live="polite"][aria-atomic="true"]')
        ?.textContent;

    expect(readOut()).toBe("No days selected");

    selectDay(container, "15");
    expect(readOut()).toBe("Jul 15");

    selectDay(container, "17");
    expect(readOut()).toBe("2 days selected · Jul 15, 17");
  });

  it("reads a toggle as on only when every selected day is on", async () => {
    setPremiumDaysBatchMock.mockResolvedValue({ kind: "success" });

    const { container } = renderClient({ initialPremiumDays: ["2026-07-15"] });
    selectDay(container, "15");
    const premium = screen.getByRole("switch", { name: /Premium day/ });
    expect(premium).toBeChecked();

    // Adding a day that is NOT premium has to drop the switch to off, so the
    // next click means "make them all premium" rather than "clear the one".
    selectDay(container, "17");
    expect(premium).not.toBeChecked();

    fireEvent.click(premium);
    await waitFor(() => expect(setPremiumDaysBatchMock).toHaveBeenCalled());
    expect(setPremiumDaysBatchMock).toHaveBeenCalledWith(
      ["2026-07-15", "2026-07-17"],
      true,
    );
  });
});

describe("AvailabilityClient cancel confirm with payments off", () => {
  it("names the bookings without offering a refund", async () => {
    paymentsEnabled.value = false;

    const { container } = renderClient({
      initialBusy: [STAY],
      initialNights: ["2026-07-15"],
    });
    selectDay(container, "15");
    fireEvent.click(
      screen.getByRole("switch", { name: /Overnight available/ }),
    );

    expect(
      await screen.findByText(/^Jane Doe · Jul 14, 12:00\s?PM$/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/refund/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$240\.00/)).not.toBeInTheDocument();
  });
});
