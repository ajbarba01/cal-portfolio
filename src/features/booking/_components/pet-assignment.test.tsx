// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PetAssignment, type AssignablePet } from "./pet-assignment";

const pets: AssignablePet[] = [
  {
    id: "a",
    name: "Rex",
    species: "dog",
    breed: null,
    notes: null,
    photoUrl: null,
  },
  {
    id: "b",
    name: "Milo",
    species: "dog",
    breed: null,
    notes: null,
    photoUrl: null,
  },
  {
    id: "c",
    name: "Spot",
    species: "dog",
    breed: null,
    notes: null,
    photoUrl: null,
  },
];

describe("PetAssignment cap feedback", () => {
  it("shows an at-cap notice and does not add beyond maxSelect", () => {
    const onChange = vi.fn();
    render(
      <PetAssignment
        pets={pets}
        allowedSpecies={["dog"]}
        selected={["a", "b"]}
        onChange={onChange}
        onPetAdded={() => {}}
        maxSelect={2}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Spot/ }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/up to 2/i)).toBeInTheDocument();
  });
});
