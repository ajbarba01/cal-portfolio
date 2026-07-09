"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { claimAccount } from "@/features/accounts/index.client";

export function ClaimForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const pw = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (pw !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    start(async () => {
      const result = await claimAccount(pw);
      switch (result.kind) {
        case "success":
          // Onboarding middleware routes by onboarding_status from here.
          router.push("/account");
          router.refresh();
          break;
        case "unauthenticated":
          setError("This claim link has expired. Ask Cal to send a new one.");
          break;
        case "validation_error":
          setError(result.message);
          break;
        case "error":
          setError(result.message);
          break;
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Choose a password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
        />
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Setting up…" : "Claim my account"}
      </Button>
    </form>
  );
}
