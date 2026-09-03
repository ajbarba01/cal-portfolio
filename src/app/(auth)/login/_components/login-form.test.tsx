// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "./login-form";
import {
  SIGN_IN_FAILED,
  SIGN_IN_LINK_EXPIRED,
} from "../../_components/auth-errors";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  // The real hook reads the address bar, so the mock does too: a test sets the
  // query string with `visit` and both the hook and the submit-time read see it.
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const signInWithPassword = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithPassword } }),
}));

function visit(query = "") {
  window.history.replaceState(null, "", `/login${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  visit();
});

async function signIn(password = "password1") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/email/i), "kiche@example.com");
  await user.type(screen.getByLabelText(/password/i), password);
  await user.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("LoginForm", () => {
  it("names the expired link a claim redirect carried in", async () => {
    visit("?error=claim_expired");
    render(<LoginForm />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      SIGN_IN_LINK_EXPIRED,
    );
  });

  it("stays quiet when nothing sent the visitor here", () => {
    render(<LoginForm />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("replaces that reason with the failure the submit produced", async () => {
    signInWithPassword.mockResolvedValueOnce({
      error: {
        message: "Invalid login credentials",
        code: "invalid_credentials",
      },
    });
    visit("?error=claim_expired");
    render(<LoginForm />);
    await signIn("wrong");

    expect(await screen.findByText(SIGN_IN_FAILED)).toBeInTheDocument();
    expect(screen.queryByText(SIGN_IN_LINK_EXPIRED)).not.toBeInTheDocument();
  });

  it("never renders Supabase's own message", async () => {
    signInWithPassword.mockResolvedValueOnce({
      error: {
        message: "Invalid login credentials",
        code: "invalid_credentials",
      },
    });
    render(<LoginForm />);
    await signIn();
    expect(await screen.findByText(SIGN_IN_FAILED)).toBeInTheDocument();
    expect(
      screen.queryByText("Invalid login credentials"),
    ).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("signs in when Enter is pressed in a field", async () => {
    signInWithPassword.mockResolvedValueOnce({ error: null });
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText(/email/i), "kiche@example.com");
    await user.type(screen.getByLabelText(/password/i), "password1{Enter}");
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledOnce());
  });

  it("rejects a malformed email without calling Supabase", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.type(screen.getByLabelText(/password/i), "password1");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns to the deferred booking selection after a successful sign-in", async () => {
    signInWithPassword.mockResolvedValueOnce({ error: null });
    visit("?returnTo=%2Fbook%2Fdog-walking");
    render(<LoginForm />);
    await signIn();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/book/dog-walking"));
  });

  it("falls back to the account home when returnTo points off-site", async () => {
    signInWithPassword.mockResolvedValueOnce({ error: null });
    visit("?returnTo=%2F%2Fevil.example.com");
    render(<LoginForm />);
    await signIn();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/account"));
  });
});
