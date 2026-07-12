// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactForm } from "./contact-form";

vi.mock("@/components/feedback/toast", () => ({
  useToast: () => ({ add: vi.fn() }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  }),
}));
vi.mock("@/features/inquiries", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/features/inquiries")>();
  return {
    ...mod,
    submitInquiry: vi.fn().mockResolvedValue({ ok: false, error: "Nope" }),
  };
});

describe("ContactForm", () => {
  it("preserves input and shows the error on server failure", async () => {
    const user = userEvent.setup();
    render(<ContactForm heading="Contact" intro="hi" replyNote="soon" />);
    await user.type(screen.getByLabelText(/^name$/i), "Alex");
    await user.type(screen.getByLabelText(/^email$/i), "a@b.com");
    await user.type(screen.getByLabelText(/^phone$/i), "3035551234");
    await user.type(screen.getByLabelText(/^message$/i), "Hello Cal");
    await user.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByText("Nope")).toBeInTheDocument();
    expect(screen.getByLabelText(/^message$/i)).toHaveValue("Hello Cal");
  });

  it("blocks an empty submit client-side", async () => {
    const user = userEvent.setup();
    render(<ContactForm heading="Contact" intro="hi" replyNote="soon" />);
    await user.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
  });
});
