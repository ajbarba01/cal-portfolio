// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PetForm } from "./pet-form";
import type { PetFormActions } from "./pet-form";

// PhotoCropField pulls in browser-only image APIs; stub it — this form's photo
// path is not under test here (photo is local state, not a form value).
vi.mock("./photo-crop-field", () => ({
  PhotoCropField: () => <div data-testid="photo-crop-stub" />,
}));

function stubActions(overrides?: Partial<PetFormActions>): PetFormActions {
  return {
    create: vi
      .fn()
      .mockResolvedValue({ kind: "error", message: "Save failed." }),
    update: vi.fn().mockResolvedValue({ kind: "success" }),
    uploadPhoto: vi.fn().mockResolvedValue({ kind: "success" }),
    ...overrides,
  };
}

describe("PetForm", () => {
  it("preserves typed values and shows the error when create fails", async () => {
    const user = userEvent.setup();
    const actions = stubActions();
    render(<PetForm onSaved={vi.fn()} actions={actions} />);

    const nameInput = screen.getByLabelText(/name/i);
    await user.type(nameInput, "Fido");
    await user.click(screen.getByRole("button", { name: /add pet/i }));

    expect(await screen.findByText("Save failed.")).toBeInTheDocument();
    expect(nameInput).toHaveValue("Fido");
    expect(actions.create).toHaveBeenCalled();
  });

  it("blocks an empty name client-side without calling create", async () => {
    const user = userEvent.setup();
    const actions = stubActions();
    render(<PetForm onSaved={vi.fn()} actions={actions} />);

    await user.click(screen.getByRole("button", { name: /add pet/i }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(actions.create).not.toHaveBeenCalled();
  });
});
