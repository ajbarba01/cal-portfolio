// @vitest-environment jsdom

/**
 * Characterization test for FormCard — pins the load-bearing invariants BEFORE
 * and AFTER the extraction from forms-client.tsx (Task 3, SP5a).
 *
 * Pinned invariants (do not relax — a changed expectation means behavior
 * changed, which violates the behavior-preserving refactor contract):
 *   - form label is rendered in the card header
 *   - "Completed" status pill shown when existing response is present
 *   - cards always start collapsed (the client expands the ones to fill)
 *   - "Not started" status + Start button when no existing response
 *   - clicking the toggle opens the card (aria-expanded reflects state)
 */

import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FormCard } from "./form-card";
import type { FormResponseLike } from "./form-card";

// Stub Next.js router — not used by FormCard but transitively imported by deps
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const existingResponse: FormResponseLike = {
  data: {
    contact_name: "Mark Doe",
    contact_phone: "555-0100",
    contact_relationship: "Spouse",
    vet_name: "Aspen Animal Clinic",
    vet_phone: "555-0200",
  },
};

const noopSubmit = vi.fn(async () => ({ kind: "success" as const }));

describe("FormCard", () => {
  it("renders the form label in the card header", () => {
    render(
      <FormCard
        formKey="emergency"
        existing={undefined}
        onSubmit={noopSubmit}
      />,
    );
    expect(screen.getByText("Emergency contact & vet info")).toBeTruthy();
  });

  it('shows "Completed" status pill when existing response is present', () => {
    render(
      <FormCard
        formKey="emergency"
        existing={existingResponse}
        onSubmit={noopSubmit}
      />,
    );
    // Card starts closed because existing response is present
    expect(screen.getByText("Completed")).toBeTruthy();
  });

  it('shows "Not started" status when no existing response (card starts collapsed)', () => {
    render(
      <FormCard
        formKey="emergency"
        existing={undefined}
        onSubmit={noopSubmit}
      />,
    );
    expect(screen.getByText("Not started")).toBeTruthy();
  });

  it("shows Edit button (aria-expanded false) when existing response; card starts closed", () => {
    render(
      <FormCard
        formKey="emergency"
        existing={existingResponse}
        onSubmit={noopSubmit}
      />,
    );
    const btn = screen.getByRole("button", { name: /edit/i });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows Start button (aria-expanded false) when no existing response; card starts collapsed", () => {
    render(
      <FormCard
        formKey="emergency"
        existing={undefined}
        onSubmit={noopSubmit}
      />,
    );
    const btn = screen.getByRole("button", { name: /start/i });
    expect(btn.getAttribute("aria-expanded")).toBe("false");

    // Expanding shows the Close affordance.
    fireEvent.click(btn);
    expect(
      screen
        .getByRole("button", { name: /close/i })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("toggles open on Edit button click (aria-expanded flips to true)", () => {
    render(
      <FormCard
        formKey="emergency"
        existing={existingResponse}
        onSubmit={noopSubmit}
      />,
    );
    const btn = screen.getByRole("button", { name: /edit/i });
    expect(btn.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(btn);

    // After click: card is open; button label changes to "Close"
    const closeBtn = screen.getByRole("button", { name: /close/i });
    expect(closeBtn.getAttribute("aria-expanded")).toBe("true");
  });
});
