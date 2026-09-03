// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { submitInquiry } from "@/features/inquiries";
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
  afterEach(() => {
    window.history.replaceState({}, "", "/contact");
  });

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

  it("links the sent-message confirmation straight at the live booking entry", async () => {
    vi.mocked(submitInquiry).mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<ContactForm heading="Contact" intro="hi" replyNote="soon" />);
    await user.type(screen.getByLabelText(/^name$/i), "Alex");
    await user.type(screen.getByLabelText(/^email$/i), "a@b.com");
    await user.type(screen.getByLabelText(/^phone$/i), "3035551234");
    await user.type(screen.getByLabelText(/^message$/i), "Hello Cal");
    await user.click(screen.getByRole("button", { name: /send/i }));
    // /book permanently redirects; link the destination, not the redirect.
    expect(
      await screen.findByRole("link", { name: /check availability/i }),
    ).toHaveAttribute("href", "/services");
  });

  it("names the reference a visitor arrived from in the subject", async () => {
    window.history.replaceState({}, "", "/contact?ref=Abby");
    render(<ContactForm heading="Contact" intro="hi" replyNote="soon" />);
    await waitFor(() =>
      expect(screen.getByLabelText(/^subject/i)).toHaveValue("Abby"),
    );
  });

  it("leaves the subject alone when there is no reference in the URL", async () => {
    render(<ContactForm heading="Contact" intro="hi" replyNote="soon" />);
    expect(screen.getByLabelText(/^subject/i)).toHaveValue("");
  });

  it("blocks an empty submit client-side", async () => {
    const user = userEvent.setup();
    render(<ContactForm heading="Contact" intro="hi" replyNote="soon" />);
    await user.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
  });
});
