"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeReturnTo } from "@/features/booking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
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
      <PageContainer width="read" className="py-12">
        <div className="mx-auto w-full max-w-sm">
          <Card className="gap-3 p-6 text-center sm:p-7">
            <Mail
              aria-hidden="true"
              className="text-brand mx-auto size-8"
              strokeWidth={1.5}
            />
            <CardTitle>Check your email</CardTitle>
            <p className="text-muted-foreground text-sm">
              We sent a confirmation link to <strong>{email}</strong>. Click it
              to activate your account.
            </p>
          </Card>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="read" className="py-12">
      <div className="mx-auto w-full max-w-sm">
        <Card className="gap-5 p-6 sm:p-7">
          <CardHeader>
            <CardTitle>Create account</CardTitle>
            <p className="text-muted-foreground text-sm">
              Book Cal for walks, check-ins &amp; house-sitting.
            </p>
          </CardHeader>

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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm_password">Confirm password</Label>
              <Input
                id="confirm_password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
        </Card>

        <p className="text-muted-foreground mt-4 text-center text-sm">
          Have an account?{" "}
          <Link
            href="/login"
            className="text-brand-strong font-medium hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </PageContainer>
  );
}
