// @vitest-environment jsdom

/**
 * The list sends each switch its OWN modifier id. Every discount used to be the
 * Kiche one, so a mis-threaded id here would silently apply the wrong discount —
 * and the price it writes is the price the client is charged.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/feedback/toast", () => ({
  useToast: () => ({ add: vi.fn() }),
}));
const setManualApplied = vi.fn(
  async (_bookingId: string, _modifierId: string, _applied: boolean) => ({
    kind: "success" as const,
    applied: true,
    newFinalCents: 1250,
    refundedCents: 0,
  }),
);
// Wrapped rather than passed directly: the factory is hoisted above the spy's
// declaration, so it may only reach it when a test actually calls the action.
vi.mock("@/features/booking/index.client", () => ({
  setManualApplied: (bookingId: string, modifierId: string, applied: boolean) =>
    setManualApplied(bookingId, modifierId, applied),
}));

import { AdminManualDiscounts } from "./admin-manual-discounts";
import type { ManualDiscountRow } from "@/features/booking";

const BOOKING = "00000000-0000-4000-8000-000000000002";

const KICHE: ManualDiscountRow = {
  id: "kiche",
  label: "Kiche discount (−25%)",
  applied: true,
  currentFinalCents: 1875,
  toggledFinalCents: 2500,
  refundIfApplyCents: 0,
  paidCents: 0,
};

const FRIENDS: ManualDiscountRow = {
  id: "friends_family",
  label: "Friends & Family (−50%)",
  applied: false,
  currentFinalCents: 2500,
  toggledFinalCents: 1250,
  refundIfApplyCents: 0,
  paidCents: 0,
};

function renderList() {
  return render(
    <AdminManualDiscounts bookingId={BOOKING} rows={[KICHE, FRIENDS]} />,
  );
}

describe("AdminManualDiscounts", () => {
  it("names each switch by its config label and shows its state", () => {
    renderList();
    const switches = screen.getAllByRole("switch");
    expect(switches.map((el) => el.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
    ]);
    expect(
      screen.getByRole("switch", { name: "Friends & Family (−50%)" }),
    ).toBeTruthy();
  });

  it("applies the discount the switch belongs to", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(
      screen.getByRole("switch", { name: "Friends & Family (−50%)" }),
    );
    await waitFor(() => {
      expect(screen.getByText("Apply Friends & Family (−50%)?")).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: "Apply discount" }));

    await waitFor(() => {
      expect(setManualApplied).toHaveBeenCalledWith(
        BOOKING,
        "friends_family",
        true,
      );
    });
  });

  it("does nothing until Cal confirms", async () => {
    const user = userEvent.setup();
    setManualApplied.mockClear();
    renderList();

    await user.click(
      screen.getByRole("switch", { name: "Kiche discount (−25%)" }),
    );
    await waitFor(() => {
      expect(screen.getByText("Remove Kiche discount (−25%)?")).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(setManualApplied).not.toHaveBeenCalled();
  });
});
