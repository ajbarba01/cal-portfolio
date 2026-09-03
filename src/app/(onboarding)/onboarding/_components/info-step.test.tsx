// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InfoStep } from "./info-step";

vi.mock("@/features/accounts", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/features/accounts")>();
  return {
    ...mod,
    submitOnboarding: vi
      .fn()
      .mockResolvedValue({ ok: false, message: "Server rejected it" }),
  };
});

describe("InfoStep", () => {
  it("keeps every typed value when the server returns an error", async () => {
    const user = userEvent.setup();
    render(<InfoStep />);
    await user.type(screen.getByLabelText("Full name"), "Alex Client");
    await user.type(screen.getByLabelText("Phone"), "3035551234");
    await user.type(screen.getByLabelText("Street address"), "1 Main St");
    await user.type(screen.getByLabelText("ZIP code"), "80401");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText("Server rejected it")).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Alex Client");
    expect(screen.getByLabelText("ZIP code")).toHaveValue("80401");
  });

  // Emergency and vet contact moved to the owner form, which the booking gate
  // requires before the first paid booking. Signup asks for the profile only.
  it("asks for nothing beyond the profile fields", () => {
    render(<InfoStep />);
    expect(screen.queryByLabelText("Contact name")).toBeNull();
    expect(screen.queryByLabelText("Vet name or clinic")).toBeNull();
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
  });

  // The address is stored as one opaque line and never parsed, so an apartment
  // or unit number has to go on that line — the field has to say so, in a hint
  // that survives the first keystroke and reaches a screen reader.
  it("describes on the address field where a unit number goes", () => {
    render(<InfoStep />);
    expect(screen.getByLabelText("Street address")).toHaveAccessibleDescription(
      "Street address, apt or unit",
    );
  });

  it("blocks an incomplete submit client-side with inline errors", async () => {
    const user = userEvent.setup();
    render(<InfoStep />);
    await user.type(screen.getByLabelText("Full name"), "Alex Client");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(
      await screen.findByText("Phone number is required"),
    ).toBeInTheDocument();
    // the typed value is untouched
    expect(screen.getByLabelText("Full name")).toHaveValue("Alex Client");
  });
});
