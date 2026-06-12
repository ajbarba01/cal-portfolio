// @vitest-environment jsdom

/**
 * BookingSuccessPanel (U1) — pins the terminal success state's contract:
 * copy variant by requiresApproval, the recap line, the "View my bookings"
 * link target, and that "Book another" invokes the reset callback.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { BookingSuccessPanel, PolicyLine } from "./booking-flow";

/** Minimal BookingRuleSettings stub — required fields + optional policy fields. */
const BASE_RULES = {
  bookingOpenMinute: 390,
  bookingCloseMinute: 1320,
  minLeadTimeHours: 0,
  hardMaxAdvanceDays: 180,
} as const;

/**
 * PolicyLine (U6) — pins the refund phrasing so it matches the emails.ts copy
 * ("I refund {pct}%") rather than the incorrect "keep {pct}%" wording.
 */
describe("PolicyLine", () => {
  it("renders refund phrasing — 'cancellations refund {pct}%'", () => {
    render(
      <PolicyLine
        rules={{
          ...BASE_RULES,
          cancellationFullRefundHours: 48,
          lateCancelRefundPct: 50,
        }}
      />,
    );
    // Must say "refund" not "keep"
    expect(screen.getByText(/refund 50%/i)).toBeTruthy();
    expect(screen.queryByText(/keep 50%/i)).toBeNull();
  });

  it("renders null when either field is absent", () => {
    const { container } = render(
      <PolicyLine rules={{ ...BASE_RULES, cancellationFullRefundHours: 48 }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("reflects settings-driven values (not hardcoded)", () => {
    render(
      <PolicyLine
        rules={{
          ...BASE_RULES,
          cancellationFullRefundHours: 24,
          lateCancelRefundPct: 75,
        }}
      />,
    );
    expect(screen.getByText(/24h before/i)).toBeTruthy();
    expect(screen.getByText(/refund 75%/i)).toBeTruthy();
  });
});

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
