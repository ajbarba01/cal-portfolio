// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClaimForm } from "./claim-form";
import { GENERIC_FAILURE } from "../../_components/auth-errors";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const claimAccount = vi.fn();
vi.mock("@/features/accounts/index.client", () => ({
  claimAccount: (...args: unknown[]) => claimAccount(...args),
}));

describe("ClaimForm", () => {
  it("shows a mismatch error at confirm and never calls claimAccount", async () => {
    const user = userEvent.setup();
    render(<ClaimForm />);
    await user.type(screen.getByLabelText(/choose a password/i), "password1");
    await user.type(screen.getByLabelText(/confirm password/i), "password2");
    await user.click(screen.getByRole("button", { name: /claim my account/i }));
    expect(
      await screen.findByText("Passwords do not match."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(claimAccount).not.toHaveBeenCalled();
  });

  it("renders an unauthenticated failure as a root error", async () => {
    claimAccount.mockResolvedValueOnce({ kind: "unauthenticated" });
    const user = userEvent.setup();
    render(<ClaimForm />);
    await user.type(screen.getByLabelText(/choose a password/i), "password1");
    await user.type(screen.getByLabelText(/confirm password/i), "password1");
    await user.click(screen.getByRole("button", { name: /claim my account/i }));
    expect(
      await screen.findByText(
        "This claim link has expired. Ask Cal to send a new one.",
      ),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("never renders the SDK's own message when the claim fails", async () => {
    claimAccount.mockResolvedValueOnce({
      kind: "error",
      message: "New password should be different from the old password.",
    });
    const user = userEvent.setup();
    render(<ClaimForm />);
    await user.type(screen.getByLabelText(/choose a password/i), "password1");
    await user.type(screen.getByLabelText(/confirm password/i), "password1");
    await user.click(screen.getByRole("button", { name: /claim my account/i }));
    expect(await screen.findByText(GENERIC_FAILURE)).toBeInTheDocument();
    expect(
      screen.queryByText(/New password should be different/),
    ).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
