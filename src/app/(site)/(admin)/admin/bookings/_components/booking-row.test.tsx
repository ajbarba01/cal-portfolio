// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { BookingCalendarRow } from "@/features/admin/index.client";

import { BookingRow } from "./booking-row";

function row(overrides: Partial<BookingCalendarRow> = {}): BookingCalendarRow {
  return {
    id: "booking-1",
    client_id: "client-1",
    client_name: "Jane Doe",
    service_name: "Meet & Greet",
    status: "confirmed",
    starts_at: "2026-09-12T21:00:00.000Z",
    ends_at: "2026-09-12T21:30:00.000Z",
    final_cents: 0,
    payment_status: "unpaid",
    ...overrides,
  };
}

function renderRow(booking: BookingCalendarRow) {
  render(
    <BookingRow
      booking={booking}
      onApprove={vi.fn()}
      onDecline={vi.fn()}
      onCancel={vi.fn()}
      pending={false}
    />,
  );
}

describe("BookingRow payment pill", () => {
  it("says nothing about payment on a booking that costs nothing", () => {
    renderRow(row({ final_cents: 0, payment_status: "unpaid" }));
    expect(screen.queryByText("Unpaid")).not.toBeInTheDocument();
    // The status and the amount still read normally.
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
  });

  it("shows the pill as soon as there is something to collect", () => {
    renderRow(row({ final_cents: 4500, payment_status: "unpaid" }));
    expect(screen.getByText("Unpaid")).toBeInTheDocument();
  });

  it("shows a paid pill on a paid booking", () => {
    renderRow(row({ final_cents: 4500, payment_status: "paid" }));
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });
});
