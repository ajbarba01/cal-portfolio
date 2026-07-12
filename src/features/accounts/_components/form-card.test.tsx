// @vitest-environment jsdom

/**
 * RHF migration coverage for FormCard (Task 7). Pins the two load-bearing
 * behaviors the tester flagged for the old useActionState wiring:
 *   - a server-side validation_error keeps the typed value in the field and
 *     renders the message (not a blank, reset form)
 *   - client-side (zod) validation blocks the injected onSubmit entirely and
 *     surfaces inline field errors when required fields are empty
 */

import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormCard } from "./form-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

async function openCard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /start/i }));
}

describe("FormCard (owner, RHF)", () => {
  it("keeps the typed value and renders a server validation message", async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      kind: "validation_error" as const,
      message: "bad",
    });
    const user = userEvent.setup();
    render(
      <FormCard formKey="owner" existing={undefined} onSubmit={onSubmit} />,
    );
    await openCard(user);

    await user.type(screen.getByLabelText("Owner name"), "Fido Owner");
    await user.type(screen.getByLabelText("Phone"), "555-0100");
    await user.type(screen.getByLabelText("Contact name"), "Jane Doe");
    await user.type(screen.getByLabelText("Contact phone"), "555-0200");
    await user.type(screen.getByLabelText("Relationship"), "Spouse");

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(await screen.findByText("bad")).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Owner name")).toHaveValue("Fido Owner");
  });

  it("never calls onSubmit when required fields are empty; shows inline errors", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <FormCard formKey="owner" existing={undefined} onSubmit={onSubmit} />,
    );
    await openCard(user);

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(
      await screen.findByText("Owner name is required"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
