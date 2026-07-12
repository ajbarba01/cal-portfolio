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
    await user.type(screen.getByLabelText("Contact name"), "Sam Friend");
    await user.type(screen.getByLabelText("Contact phone"), "3035555678");
    await user.type(screen.getByLabelText("Relationship"), "Friend");
    await user.type(screen.getByLabelText("Vet name or clinic"), "FR Vet");
    await user.type(screen.getByLabelText("Vet phone"), "3035559999");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText("Server rejected it")).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Alex Client");
    expect(screen.getByLabelText("ZIP code")).toHaveValue("80401");
    expect(screen.getByLabelText("Vet phone")).toHaveValue("3035559999");
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
