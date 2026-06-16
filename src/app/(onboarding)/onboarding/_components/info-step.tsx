"use client";

import { useActionState } from "react";
import { completeOnboarding } from "@/features/accounts";
import type { OnboardingFormState } from "@/features/accounts";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Surface } from "@/components/ui/surface";

const INITIAL: OnboardingFormState = { status: "idle" };

/**
 * Step 1 — profile + emergency info form. Bound to completeOnboarding via
 * useActionState: validation errors come back as state and render inline under
 * each field; on success the action redirects (framework-handled, no try/catch).
 */
export function InfoStep({ returnTo }: { returnTo?: string }) {
  const [state, formAction, isPending] = useActionState(
    completeOnboarding,
    INITIAL,
  );
  const errors = state.status === "error" ? state.fieldErrors : {};

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {returnTo ? (
        <input type="hidden" name="returnTo" value={returnTo} />
      ) : null}

      <Surface
        as="fieldset"
        variant="plain"
        className="flex flex-col gap-4 p-5"
      >
        <legend className="text-brand-strong mb-1 text-xs font-semibold tracking-wide uppercase">
          Your profile
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Full name"
            name="full_name"
            type="text"
            autoComplete="name"
            error={errors.full_name}
            required
          />
          <FormField
            label="Phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            error={errors.phone}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Street address"
            name="address"
            type="text"
            autoComplete="street-address"
            error={errors.address}
            required
          />
          <FormField
            label="ZIP code"
            name="zip"
            type="text"
            autoComplete="postal-code"
            inputMode="numeric"
            maxLength={10}
            error={errors.zip}
            required
          />
        </div>
      </Surface>

      <Surface
        as="fieldset"
        variant="plain"
        className="flex flex-col gap-4 p-5"
      >
        <legend className="text-brand-strong mb-1 text-xs font-semibold tracking-wide uppercase">
          Emergency contact
        </legend>
        <FormField
          label="Contact name"
          name="contact_name"
          type="text"
          error={errors.contact_name}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Contact phone"
            name="contact_phone"
            type="tel"
            error={errors.contact_phone}
            required
          />
          <FormField
            label="Relationship"
            name="contact_relationship"
            type="text"
            placeholder="e.g. Parent, Spouse, Friend"
            error={errors.contact_relationship}
            required
          />
        </div>
      </Surface>

      <Surface
        as="fieldset"
        variant="plain"
        className="flex flex-col gap-4 p-5"
      >
        <legend className="text-brand-strong mb-1 text-xs font-semibold tracking-wide uppercase">
          Veterinarian
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Vet name or clinic"
            name="vet_name"
            type="text"
            error={errors.vet_name}
            required
          />
          <FormField
            label="Vet phone"
            name="vet_phone"
            type="tel"
            error={errors.vet_phone}
            required
          />
        </div>
      </Surface>

      <Button
        type="submit"
        variant="brand"
        disabled={isPending}
        className="w-full"
      >
        {isPending ? "Saving…" : "Continue →"}
      </Button>
    </form>
  );
}
