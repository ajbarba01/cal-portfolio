"use client";

import { useState } from "react";
import { completeOnboarding } from "@/features/accounts/onboarding-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/layout/page-container";

export default function OnboardingPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const form = new FormData(e.currentTarget);
    // Deferred-auth round-trip: honor a same-origin returnTo if present.
    const returnTo =
      new URLSearchParams(window.location.search).get("returnTo") ?? undefined;

    try {
      await completeOnboarding(
        {
          profile: {
            full_name: form.get("full_name") as string,
            phone: form.get("phone") as string,
            address: form.get("address") as string,
            zip: form.get("zip") as string,
          },
          emergency: {
            contact_name: form.get("contact_name") as string,
            contact_phone: form.get("contact_phone") as string,
            contact_relationship: form.get("contact_relationship") as string,
            vet_name: form.get("vet_name") as string,
            vet_phone: form.get("vet_phone") as string,
          },
        },
        returnTo,
      );
    } catch (err) {
      // completeOnboarding redirects on success; an error here means a server-side failure.
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setIsLoading(false);
    }
  }

  return (
    <PageContainer width="read" className="py-10">
      <h1 className="text-foreground mb-2 text-2xl font-semibold">
        Welcome — let&apos;s get you set up
      </h1>
      <p className="text-muted-foreground mb-8 text-sm">
        Fill in your profile and emergency info before making a booking.
      </p>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {/* Profile */}
        <fieldset className="bg-card border-border flex flex-col gap-4 rounded-xl border p-5">
          <legend className="text-brand-strong mb-1 text-xs font-semibold tracking-wide uppercase">
            Your profile
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                name="full_name"
                type="text"
                autoComplete="name"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="address">Street address</Label>
              <Input
                id="address"
                name="address"
                type="text"
                autoComplete="street-address"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="zip">ZIP code</Label>
              <Input
                id="zip"
                name="zip"
                type="text"
                autoComplete="postal-code"
                inputMode="numeric"
                maxLength={10}
                required
              />
            </div>
          </div>
        </fieldset>

        {/* Emergency contact */}
        <fieldset className="bg-card border-border flex flex-col gap-4 rounded-xl border p-5">
          <legend className="text-brand-strong mb-1 text-xs font-semibold tracking-wide uppercase">
            Emergency contact
          </legend>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact_name">Contact name</Label>
            <Input id="contact_name" name="contact_name" type="text" required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact_phone">Contact phone</Label>
              <Input
                id="contact_phone"
                name="contact_phone"
                type="tel"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact_relationship">Relationship</Label>
              <Input
                id="contact_relationship"
                name="contact_relationship"
                type="text"
                placeholder="e.g. Parent, Spouse, Friend"
                required
              />
            </div>
          </div>
        </fieldset>

        {/* Veterinarian */}
        <fieldset className="bg-card border-border flex flex-col gap-4 rounded-xl border p-5">
          <legend className="text-brand-strong mb-1 text-xs font-semibold tracking-wide uppercase">
            Veterinarian
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vet_name">Vet name or clinic</Label>
              <Input id="vet_name" name="vet_name" type="text" required />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vet_phone">Vet phone</Label>
              <Input id="vet_phone" name="vet_phone" type="tel" required />
            </div>
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        <Button type="submit" disabled={isLoading} className="w-full">
          {isLoading ? "Saving…" : "Complete setup"}
        </Button>
      </form>
    </PageContainer>
  );
}
