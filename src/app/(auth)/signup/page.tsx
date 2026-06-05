"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { safeReturnTo } from "@/features/booking/return-to";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/layout/page-container";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
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
      <PageContainer width="read" className="py-12">
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-foreground mb-4 text-2xl font-semibold">
            Check your email
          </h1>
          <p className="text-muted-foreground text-sm">
            We sent a confirmation link to <strong>{email}</strong>. Click it to
            activate your account.
          </p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="read" className="py-12">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-foreground mb-6 text-2xl font-semibold">
          Create account
        </h1>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <Button type="submit" disabled={isLoading} className="mt-2 w-full">
            {isLoading ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="text-muted-foreground mt-4 text-sm">
          Have an account?{" "}
          <Link href="/login" className="hover:text-foreground underline">
            Sign in
          </Link>
        </p>
      </div>
    </PageContainer>
  );
}
