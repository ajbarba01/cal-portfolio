// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignupCard } from "./signup-card";
import { GENERIC_FAILURE } from "../../_components/auth-errors";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  // The real hook reads the address bar, so the mock does too: a test sets the
  // query string with `visit` and both the hook and the submit-time read see it.
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

function visit(query = "") {
  window.history.replaceState(null, "", `/signup${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  visit();
});

const signUp = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signUp } }),
}));

async function fillIn(password: string, confirm = password) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/^email$/i), "kiche@example.com");
  await user.type(screen.getByLabelText(/^password$/i), password);
  await user.type(screen.getByLabelText(/confirm password/i), confirm);
  await user.click(screen.getByRole("button", { name: /create account/i }));
}

describe("SignupCard", () => {
  it("refuses a password under eight characters", async () => {
    render(<SignupCard />);
    await fillIn("short12");

    expect(
      await screen.findByText("Use at least 8 characters"),
    ).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("accepts a password of exactly eight characters", async () => {
    signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    render(<SignupCard />);
    await fillIn("eight888");

    await waitFor(() => expect(signUp).toHaveBeenCalledOnce());
  });

  it("reports a mismatched confirmation at the confirm field", async () => {
    render(<SignupCard />);
    await fillIn("password1", "password2");

    expect(
      await screen.findByText("Passwords do not match."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(signUp).not.toHaveBeenCalled();
  });

  it("never renders Supabase's own message", async () => {
    signUp.mockResolvedValueOnce({
      data: { session: null },
      error: { message: "Signups not allowed", code: "signup_disabled" },
    });
    render(<SignupCard />);
    await fillIn("password1");

    expect(await screen.findByText(GENERIC_FAILURE)).toBeInTheDocument();
    expect(screen.queryByText("Signups not allowed")).not.toBeInTheDocument();
  });

  it("shows the sent-email panel when no session comes back", async () => {
    signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    render(<SignupCard />);
    await fillIn("password1");

    expect(
      await screen.findByRole("heading", { name: "Check your email" }),
    ).toBeInTheDocument();
    expect(screen.getByText("kiche@example.com")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("carries a usable returnTo into onboarding when a session comes back", async () => {
    signUp.mockResolvedValueOnce({
      data: { session: { access_token: "t" } },
      error: null,
    });
    visit("?returnTo=%2Fbook%2Fdog-walking");
    render(<SignupCard />);
    await fillIn("password1");

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        "/onboarding?returnTo=%2Fbook%2Fdog-walking",
      ),
    );
  });

  it("drops an off-site returnTo on the way to onboarding", async () => {
    signUp.mockResolvedValueOnce({
      data: { session: { access_token: "t" } },
      error: null,
    });
    visit("?returnTo=%2F%2Fevil.example.com");
    render(<SignupCard />);
    await fillIn("password1");

    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding"));
  });
});
