// @vitest-environment jsdom

/**
 * BookingSuccessPanel (U1) — pins the terminal success state's contract:
 * copy variant by requiresApproval, the recap line, the "View my bookings"
 * link target, and that "Book another" invokes the reset callback.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { BookingSuccessPanel } from "./booking-flow";

describe("BookingSuccessPanel", () => {
  it("requiresApproval=true → 'Booking requested' + approval copy", () => {
    render(
      <BookingSuccessPanel
        requiresApproval={true}
        summary="Walk · Mon, Jun 16 · 1 hr · Juniper"
        onBookAnother={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /Booking requested/i }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Cal approves requests within a day/i),
    ).toBeTruthy();
    expect(
      screen.getByText("Walk · Mon, Jun 16 · 1 hr · Juniper"),
    ).toBeTruthy();
  });

  it("requiresApproval=false → 'Booking confirmed' copy variant", () => {
    render(
      <BookingSuccessPanel
        requiresApproval={false}
        summary={null}
        onBookAnother={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /Booking confirmed/i }),
    ).toBeTruthy();
    expect(screen.queryByText(/Cal approves requests/i)).toBeNull();
  });

  it("links to /account/bookings and resets via Book another", () => {
    const onBookAnother = vi.fn();
    render(
      <BookingSuccessPanel
        requiresApproval={true}
        summary={null}
        onBookAnother={onBookAnother}
      />,
    );

    const link = screen.getByRole("link", { name: /View my bookings/i });
    expect(link.getAttribute("href")).toBe("/account/bookings");

    fireEvent.click(screen.getByRole("button", { name: /Book another/i }));
    expect(onBookAnother).toHaveBeenCalledTimes(1);
  });
});
