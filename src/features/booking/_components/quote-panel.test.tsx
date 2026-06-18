// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { QuotePanel } from "./quote-panel";
import type { BookingQuotePreview } from "@/features/booking/booking-service";

function preview(over: Partial<BookingQuotePreview> = {}): BookingQuotePreview {
  return {
    breakdown: {
      lines: [{ label: "Base", amountCents: 5000 }],
      finalCents: 5000,
    },
    finalCents: 5000,
    distanceMiles: 3,
    requiresApproval: true,
    decision: "manual",
    approvalReasons: [],
    warnings: [],
    requirements: [],
    ...over,
  } as BookingQuotePreview;
}

describe("QuotePanel approval reasons", () => {
  it("renders each typed reason message", () => {
    render(
      <QuotePanel
        preview={preview({
          approvalReasons: [
            {
              code: "service_manual_only",
              message: "Cal confirms this personally.",
              severity: "info",
            },
            {
              code: "distance_refuse",
              message: "Beyond the service area.",
              severity: "block",
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("Cal confirms this personally.")).toBeTruthy();
    expect(screen.getByText("Beyond the service area.")).toBeTruthy();
  });

  it("falls back to the generic line when reasons are empty but approval is required", () => {
    render(<QuotePanel preview={preview({ approvalReasons: [] })} />);
    expect(
      screen.getByText(/Requires Cal.s approval before it is confirmed/i),
    ).toBeTruthy();
  });

  it("shows no approval text when not required and no reasons", () => {
    render(
      <QuotePanel
        preview={preview({ requiresApproval: false, decision: "auto" })}
      />,
    );
    expect(screen.queryByText(/Requires Cal.s approval/i)).toBeNull();
  });
});
