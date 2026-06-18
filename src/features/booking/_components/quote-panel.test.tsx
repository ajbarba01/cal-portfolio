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
  it("renders each typed reason message styled by severity", () => {
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
              code: "distance_unlikely",
              message: "Likely too far.",
              severity: "warn",
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

    const infoAlert = screen
      .getByText("Cal confirms this personally.")
      .closest('[data-slot="alert"]');
    const warnAlert = screen
      .getByText("Likely too far.")
      .closest('[data-slot="alert"]');
    const blockAlert = screen
      .getByText("Beyond the service area.")
      .closest('[data-slot="alert"]');

    expect(infoAlert).toBeInTheDocument();
    expect(warnAlert).toBeInTheDocument();
    expect(blockAlert).toBeInTheDocument();

    // severity → Alert variant mapping (classes from src/components/ui/alert.tsx)
    expect(infoAlert).toHaveClass("text-foreground");
    expect(warnAlert).toHaveClass("text-warning-foreground");
    expect(blockAlert).toHaveClass("text-destructive");
  });

  it("falls back to the generic line when reasons are empty but approval is required", () => {
    render(<QuotePanel preview={preview({ approvalReasons: [] })} />);
    expect(
      screen.getByText(/Requires Cal.s approval before it is confirmed/i),
    ).toBeInTheDocument();
  });

  it("shows no approval text when not required and no reasons", () => {
    render(
      <QuotePanel
        preview={preview({ requiresApproval: false, decision: "auto" })}
      />,
    );
    expect(
      screen.queryByText(/Requires Cal.s approval/i),
    ).not.toBeInTheDocument();
  });
});
