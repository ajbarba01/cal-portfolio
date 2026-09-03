// @vitest-environment jsdom

/**
 * The prepay CTA's two gates.
 *
 * The payments kill-switch has to be exercised in both positions: with it off
 * there is no way to pay online, so the control must not render at all — a
 * disabled or hidden-but-present button would still be reachable, and the
 * balance beside it keeps reading as owed either way. The second gate is the
 * balance itself: a settled booking offers nothing to prepay.
 *
 * Both gates sit after the hooks in the component, so a render is the only way
 * to prove the hook order does not depend on the flag.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The kill-switch is a build-time constant, so a getter is the only way to run
// both modes in one file.
const { paymentsEnabled } = vi.hoisted(() => ({
  paymentsEnabled: { value: true },
}));

vi.mock("@/lib/payments-enabled", () => ({
  get PAYMENTS_ENABLED() {
    return paymentsEnabled.value;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// `createPrepayIntent` is a server action that pulls in the Stripe SDK and
// next/headers; nothing here clicks the button, so the module is replaced
// rather than loaded.
vi.mock("@/features/payments/index.client", () => ({
  createPrepayIntent: vi.fn(),
}));

import { PrepayButton } from "./prepay-button";

describe("PrepayButton", () => {
  it("renders the prepay control while payments are on and a balance is owed", () => {
    paymentsEnabled.value = true;

    render(<PrepayButton bookingId="booking-1" owedCents={4500} />);

    expect(
      screen.getByRole("button", { name: "Prepay for this booking" }),
    ).toBeEnabled();
  });

  it("renders nothing at all while the payments kill-switch is off", () => {
    paymentsEnabled.value = false;

    const { container } = render(
      <PrepayButton bookingId="booking-1" owedCents={4500} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders nothing for a booking with nothing left to pay", () => {
    paymentsEnabled.value = true;

    const { container } = render(
      <PrepayButton bookingId="booking-1" owedCents={0} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
