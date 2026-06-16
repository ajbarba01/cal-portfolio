"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { safeReturnTo } from "@/features/booking/index.client";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { ShimmerCard } from "@/components/ui/shimmer-card";
import { PageContainer } from "@/components/layout/page-container";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
      return;
    }

    // Deferred-auth round-trip: return to the booking selection if a valid
    // returnTo rode in on the query string, else the account home.
    const returnTo = safeReturnTo(
      new URLSearchParams(window.location.search).get("returnTo"),
    );
    router.push(returnTo ?? "/account");
    router.refresh();
  }

  return (
    <PageContainer width="narrow" className="w-full">
      <div className="mx-auto w-full max-w-sm">
        <ShimmerCard className="p-6 sm:p-8">
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            Sign in
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">Welcome back.</p>

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
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
              {isLoading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </ShimmerCard>

        <p className="text-muted-foreground mt-4 text-center text-sm">
          No account?{" "}
          <Suspense
            fallback={<AuthSwitchLink href="/signup">Sign up</AuthSwitchLink>}
          >
            <SignupLink />
          </Suspense>
        </p>
      </div>
    </PageContainer>
  );
}

/**
 * Forwards the raw returnTo param so switching to signup keeps the deferred-auth
 * destination. No validation here — the redirect-time guard (`safeReturnTo`)
 * stays the single validation point.
 */
function SignupLink() {
  const returnTo = useSearchParams().get("returnTo");
  const href = returnTo
    ? `/signup?returnTo=${encodeURIComponent(returnTo)}`
    : "/signup";
  return <AuthSwitchLink href={href}>Sign up</AuthSwitchLink>;
}

function AuthSwitchLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-brand-strong underline underline-offset-4 hover:opacity-70"
    >
      {children}
    </Link>
  );
}
