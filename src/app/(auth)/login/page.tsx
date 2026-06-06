"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { safeReturnTo } from "@/features/booking/return-to";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
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
    <PageContainer width="read" className="py-12">
      <div className="mx-auto w-full max-w-sm">
        <Card className="gap-5 p-6 sm:p-7">
          <div className="flex flex-col gap-1">
            <h1 className="text-foreground text-xl font-semibold">Sign in</h1>
            <p className="text-muted-foreground text-sm">
              Welcome back to Cal Barba.
            </p>
          </div>

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
                autoComplete="current-password"
                required
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
              {isLoading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Card>

        <p className="text-muted-foreground mt-4 text-center text-sm">
          No account?{" "}
          <Link
            href="/signup"
            className="text-brand-strong font-medium hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </PageContainer>
  );
}
