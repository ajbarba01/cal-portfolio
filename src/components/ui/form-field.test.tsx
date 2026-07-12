// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { z } from "zod";
import { useAppForm, Form } from "@/components/form";
import { FormField } from "./form-field";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
});

function RhfHarness() {
  const form = useAppForm(schema, { defaultValues: { name: "" } });
  return (
    <Form form={form} onSubmit={() => {}}>
      <FormField label="Name" name="name" type="text" />
      <button type="submit">Save</button>
    </Form>
  );
}

describe("FormField", () => {
  it("controlled mode still renders a passed error", () => {
    render(<FormField label="Zip" name="zip" type="text" error="Bad zip" />);
    expect(screen.getByText("Bad zip")).toBeInTheDocument();
  });

  it("RHF mode wires value + validation from form context", async () => {
    const user = userEvent.setup();
    render(<RhfHarness />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "Kiche");
    expect(screen.getByLabelText("Name")).toHaveValue("Kiche");
    // onTouched + errored → live re-validation clears the message
    expect(screen.queryByText("Name is required")).not.toBeInTheDocument();
  });

  it("renders the muted optional suffix", () => {
    render(<FormField label="Breed" name="breed" type="text" optional />);
    expect(screen.getByText("optional")).toBeInTheDocument();
  });
});
