// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewForm } from "./review-form";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: "u1" } } } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
}));

vi.mock("@/features/reviews", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/features/reviews")>();
  return {
    ...mod,
    submitReview: vi.fn().mockResolvedValue({ ok: false, error: "Nope" }),
  };
});

describe("ReviewForm", () => {
  it("preserves body text and shows the error on server failure", async () => {
    const user = userEvent.setup();
    render(<ReviewForm />);
    const body = await screen.findByLabelText(/your review/i);
    await user.type(body, "Great walk today");
    await user.click(screen.getByRole("button", { name: /submit review/i }));
    expect(await screen.findByText("Nope")).toBeInTheDocument();
    expect(body).toHaveValue("Great walk today");
  });

  it("blocks an empty submit client-side", async () => {
    const user = userEvent.setup();
    render(<ReviewForm />);
    await screen.findByLabelText(/your review/i);
    await user.click(screen.getByRole("button", { name: /submit review/i }));
    expect(
      await screen.findByText("Write a few words first"),
    ).toBeInTheDocument();
  });
});
