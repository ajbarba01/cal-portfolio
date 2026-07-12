// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";

vi.mock("@/features/accounts", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/features/accounts")>();
  return {
    ...mod,
    updateProfile: vi
      .fn()
      .mockResolvedValue({ kind: "error", message: "Server rejected it." }),
    changePassword: vi.fn().mockResolvedValue({ kind: "success" }),
  };
});

const { updateProfile, changePassword } = await import("@/features/accounts");

describe("ProfileForm", () => {
  it("preserves edited values and shows the error on server failure", async () => {
    const user = userEvent.setup();
    render(
      <ProfileForm
        initialValues={{
          full_name: "Alex Smith",
          phone: "3035551234",
          address: "1 Main St",
          zip: "80202",
        }}
      />,
    );

    const nameInput = screen.getByLabelText(/full name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Alex Newname");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Server rejected it.")).toBeInTheDocument();
    expect(nameInput).toHaveValue("Alex Newname");
    expect(updateProfile).toHaveBeenCalled();
  });
});

describe("PasswordForm", () => {
  it("never calls changePassword and shows an inline mismatch error", async () => {
    const user = userEvent.setup();
    render(<PasswordForm />);

    await user.type(screen.getByLabelText(/new password/i), "password123");
    await user.type(screen.getByLabelText(/confirm/i), "password456");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(
      await screen.findByText("Passwords don't match."),
    ).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });
});
