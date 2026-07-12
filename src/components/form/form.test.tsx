// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { z } from "zod";
import { useAppForm } from "./use-app-form";
import { Form, FormRootError } from "./form";
import { submitAction } from "./submit-action";
import type { FormActionResult } from "@/lib/form-action-result";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
});

function Harness({
  action,
  onSuccess,
}: {
  action: (v: { name: string }) => Promise<FormActionResult>;
  onSuccess?: () => void;
}) {
  const form = useAppForm(schema, { defaultValues: { name: "" } });
  const { formState } = form;
  return (
    <Form form={form} onSubmit={submitAction(form, action, { onSuccess })}>
      <input aria-label="Name" {...form.register("name")} />
      {formState.errors.name && <div>{formState.errors.name.message}</div>}
      <FormRootError />
      <button type="submit">Save</button>
    </Form>
  );
}

describe("Form + submitAction", () => {
  it("maps server fieldErrors onto fields and focuses the first", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      fieldErrors: { name: "Taken" },
    } satisfies FormActionResult);
    const user = userEvent.setup();
    render(<Harness action={action} />);
    await user.type(screen.getByLabelText("Name"), "Kiche");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveFocus());
    // typed value survives the server error — the tester's bug class
    expect(screen.getByLabelText("Name")).toHaveValue("Kiche");
  });

  it("renders a message as the root error via FormRootError", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      message: "Something broke",
    } satisfies FormActionResult);
    const user = userEvent.setup();
    render(<Harness action={action} />);
    await user.type(screen.getByLabelText("Name"), "Kiche");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Something broke")).toBeInTheDocument();
  });

  it("calls onSuccess when the action succeeds", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<Harness action={action} onSuccess={onSuccess} />);
    await user.type(screen.getByLabelText("Name"), "Kiche");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });

  it("never calls the action when client validation fails", async () => {
    const action = vi.fn();
    const user = userEvent.setup();
    render(<Harness action={action} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });
});
