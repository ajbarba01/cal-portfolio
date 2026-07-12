// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewClientForm } from "./new-client-form";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/components/feedback/toast", () => ({
  useToast: () => ({ add: vi.fn() }),
}));

const createUnclaimedClient = vi.fn();
vi.mock("@/features/admin", () => ({
  createUnclaimedClient: (...args: unknown[]) => createUnclaimedClient(...args),
}));

describe("NewClientForm", () => {
  it("shows the email_exists message on the email field and preserves typed values", async () => {
    createUnclaimedClient.mockResolvedValueOnce({
      kind: "email_exists",
      clientId: "existing-id",
    });
    const user = userEvent.setup();
    render(<NewClientForm />);
    await user.type(screen.getByLabelText(/full name/i), "Jane Doe");
    await user.type(screen.getByLabelText(/^email$/i), "jane@example.com");
    await user.click(screen.getByRole("button", { name: /create client/i }));

    expect(
      await screen.findByText(
        "A client with this email already exists. Open their existing profile instead.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toHaveValue("Jane Doe");
    expect(screen.getByLabelText(/^email$/i)).toHaveValue("jane@example.com");
    expect(push).not.toHaveBeenCalled();
  });

  it("blocks an empty submit client-side", async () => {
    const user = userEvent.setup();
    render(<NewClientForm />);
    await user.click(screen.getByRole("button", { name: /create client/i }));
    expect(
      await screen.findByText("Full name is required"),
    ).toBeInTheDocument();
    expect(createUnclaimedClient).not.toHaveBeenCalled();
  });
});
