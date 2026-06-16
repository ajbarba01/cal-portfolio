"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeReturnTo } from "@/features/booking/index.client";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { ShimmerCard } from "@/components/ui/shimmer-card";
import { TextLink } from "@/components/ui/text-link";
import { PageContainer } from "@/components/layout/page-container";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setIsLoading(true);

    const supabase = createClient();
    // The DB trigger creates the profiles row on auth.users insert — no app insert needed.
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
      return;
    }

    // When email confirmation is disabled (local dev, or a project with
    // confirmations off), signUp returns a live session and the user is already
    // authenticated — there is no email to check. Forward straight to
    // onboarding, carrying any deferred-auth returnTo. Only show the
    // "check your email" screen when no session came back (confirmations on).
    if (data.session) {
      const returnTo = safeReturnTo(
        new URLSearchParams(window.location.search).get("returnTo"),
      );
      const dest = returnTo
        ? `/onboarding?returnTo=${encodeURIComponent(returnTo)}`
        : "/onboarding";
      router.push(dest);
      router.refresh();
      return;
    }

    setIsSuccess(true);
    setIsLoading(false);
  }

  if (isSuccess) {
    return (
      <PageContainer width="narrow" className="w-full">
        <div className="mx-auto w-full max-w-sm">
          <ShimmerCard className="p-6 text-center sm:p-8">
            <Mail
              aria-hidden="true"
              className="text-brand mx-auto size-8"
              strokeWidth={1.5}
            />
            <h1 className="font-heading text-foreground mt-3 text-xl font-semibold">
              Check your email
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              We sent a confirmation link to <strong>{email}</strong>. Click it
              to activate your account.
            </p>
          </ShimmerCard>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow" className="w-full">
      <div className="mx-auto w-full max-w-sm">
        <ShimmerCard className="p-6 sm:p-8">
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            Create account
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Book Cal for walks, check-ins &amp; house-sitting.
          </p>

          <form
            onSubmit={handleSubmit}
            noValidate
            className="mt-5 flex flex-col gap-4"
          >
            <FormField
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <FormField
              label="Password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <FormField
              label="Confirm password"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="brand"
              disabled={isLoading}
              className="mt-1 w-full"
            >
              {isLoading ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </ShimmerCard>

        <p className="text-muted-foreground mt-4 text-center text-sm">
          Have an account?{" "}
          <Suspense
            fallback={<AuthSwitchLink href="/login">Sign in</AuthSwitchLink>}
          >
            <LoginLink />
          </Suspense>
        </p>
      </div>
    </PageContainer>
  );
}

/**
 * Forwards the raw returnTo param so switching to login keeps the deferred-auth
 * destination. No validation here — the redirect-time guard (`safeReturnTo`)
 * stays the single validation point.
 */
function LoginLink() {
  const returnTo = useSearchParams().get("returnTo");
  const href = returnTo
    ? `/login?returnTo=${encodeURIComponent(returnTo)}`
    : "/login";
  return <AuthSwitchLink href={href}>Sign in</AuthSwitchLink>;
}

function AuthSwitchLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return <TextLink href={href}>{children}</TextLink>;
}
