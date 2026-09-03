// @vitest-environment jsdom

/**
 * FormCard — the disclosure that carries one intake form.
 *
 * Two things are load-bearing. Every card starts collapsed and says whether it
 * has been filled in, because a client meets a stack of them at once and the
 * stack is only readable if the open one is the one they chose. And a rejected
 * submission keeps what was typed: these fields hold a door code and a vet's
 * number, and a form that blanks itself on a server error loses them.
 */

import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormCard } from "./form-card";
import type { FormResponseLike } from "./form-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const noopSubmit = vi.fn(async () => ({ kind: "success" as const }));

const savedResponse: FormResponseLike = {
  data: {
    contact_name: "Mark Doe",
    contact_phone: "555-0100",
    contact_relationship: "Spouse",
    vet_name: "Aspen Animal Clinic",
    vet_phone: "555-0200",
  },
};

/** The card's own toggle while it is closed, whatever it currently says. */
function closedToggle(): HTMLElement {
  return screen.getByRole("button", { expanded: false });
}

async function openCard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /start/i }));
}

describe("FormCard (disclosure)", () => {
  it.each([
    ["a saved response", savedResponse],
    ["no response yet", undefined],
  ])("starts collapsed with %s", (_label, existing) => {
    render(
      <FormCard
        formKey="emergency"
        existing={existing}
        onSubmit={noopSubmit}
      />,
    );

    expect(closedToggle()).toBeInTheDocument();
    expect(screen.queryByRole("button", { expanded: true })).toBeNull();
  });

  it("opens on the toggle and reports the new state on it", async () => {
    const user = userEvent.setup();
    render(
      <FormCard
        formKey="emergency"
        existing={savedResponse}
        onSubmit={noopSubmit}
      />,
    );

    await user.click(closedToggle());

    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
  });

  it("names the form it holds, so a stack of collapsed cards is readable", () => {
    render(
      <FormCard
        formKey="emergency"
        existing={undefined}
        onSubmit={noopSubmit}
      />,
    );

    // The title comes from the registry entry rather than the caller.
    expect(
      screen.getByText("Emergency contact & vet info"),
    ).toBeInTheDocument();
  });

  it.each([
    ["Not started", undefined],
    ["Completed", savedResponse],
  ])("says %s on a collapsed card", (label, existing) => {
    render(
      <FormCard
        formKey="emergency"
        existing={existing}
        onSubmit={noopSubmit}
      />,
    );

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

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
    await user.type(
      screen.getByLabelText("Vet name or clinic"),
      "Aspen Animal",
    );
    await user.type(screen.getByLabelText("Vet phone"), "555-0300");

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

  // The vet block used to be appended after every field group, which put it
  // below the "Anything else" catch-all — the last question on the form was a
  // required one sitting under the box for everything that had no box.
  it("asks for the vet before the catch-all notes", async () => {
    const user = userEvent.setup();
    render(
      <FormCard formKey="owner" existing={undefined} onSubmit={vi.fn()} />,
    );
    await openCard(user);

    const groups = screen
      .getAllByRole("group")
      .map((group) => group.textContent ?? "");

    expect(
      groups.findIndex((text) => text.startsWith("Veterinarian")),
    ).toBeGreaterThan(
      groups.findIndex((text) => text.startsWith("Second emergency contact")),
    );
    expect(
      groups.findIndex((text) => text.startsWith("Veterinarian")),
    ).toBeLessThan(
      groups.findIndex((text) => text.startsWith("Anything else")),
    );
  });

  // Vet contact used to be collected by the deleted signup step; the owner form
  // is now the only surface that captures it, so it has to be required here.
  it("requires the vet contact", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <FormCard formKey="owner" existing={undefined} onSubmit={onSubmit} />,
    );
    await openCard(user);

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(
      await screen.findByText("Veterinarian name is required"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
