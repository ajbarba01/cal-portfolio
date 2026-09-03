// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewClientForm } from "./new-client-form";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const toastAdd = vi.fn();
vi.mock("@/components/feedback/toast", () => ({
  useToast: () => ({ add: (...args: unknown[]) => toastAdd(...args) }),
}));

const createUnclaimedClient = vi.fn();
vi.mock("@/features/admin/index.client", () => ({
  createUnclaimedClient: (...args: unknown[]) => createUnclaimedClient(...args),
}));

describe("NewClientForm", () => {
  it("shows the email_exists message and a link to the existing client, and preserves typed values", async () => {
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
      await screen.findByText("A client with this email already exists."),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: /open their existing profile instead/i,
    });
    expect(link).toHaveAttribute("href", "/admin/clients/existing-id");
    expect(screen.getByLabelText(/full name/i)).toHaveValue("Jane Doe");
    expect(screen.getByLabelText(/^email$/i)).toHaveValue("jane@example.com");
    expect(push).not.toHaveBeenCalled();
  });

  it("shows only the email_exists message, no link, when no existing client id is known", async () => {
    createUnclaimedClient.mockResolvedValueOnce({
      kind: "email_exists",
      clientId: null,
    });
    const user = userEvent.setup();
    render(<NewClientForm />);
    await user.type(screen.getByLabelText(/full name/i), "Jane Doe");
    await user.type(screen.getByLabelText(/^email$/i), "jane@example.com");
    await user.click(screen.getByRole("button", { name: /create client/i }));

    expect(
      await screen.findByText("A client with this email already exists."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", {
        name: /open their existing profile instead/i,
      }),
    ).not.toBeInTheDocument();
  });

  // Admin-side the service-area gate warns and nothing else: the client was
  // created, so the success navigation has to happen either way.
  it("warns but still navigates when the ZIP is outside the service area", async () => {
    createUnclaimedClient.mockResolvedValueOnce({
      kind: "success",
      clientId: "new-id",
      isOutsideServiceArea: true,
    });
    const user = userEvent.setup();
    render(<NewClientForm />);
    await user.type(screen.getByLabelText(/full name/i), "Jane Doe");
    await user.type(screen.getByLabelText(/^email$/i), "jane@example.com");
    await user.type(screen.getByLabelText(/zip/i), "81301");
    await user.click(screen.getByRole("button", { name: /create client/i }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/admin/clients/new-id"),
    );
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        description: "That address is outside Cal's service area.",
      }),
    );
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

  it("shows the onboarding-status label, not the raw enum value", () => {
    render(<NewClientForm />);
    expect(screen.getByText("Approved (skip onboarding)")).toBeInTheDocument();
    expect(screen.queryByText("approved")).not.toBeInTheDocument();
  });
});
