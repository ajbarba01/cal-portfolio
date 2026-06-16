"use client";

import { useActionState } from "react";
import { completeOnboarding } from "@/features/accounts";
import type { OnboardingFormState } from "@/features/accounts";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { FIELD_LIMITS } from "@/lib/field-limits";

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

      <FormSection title="Your profile">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Full name"
            name="full_name"
            type="text"
            autoComplete="name"
            maxLength={FIELD_LIMITS.name}
            error={errors.full_name}
            required
          />
          <FormField
            label="Phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={FIELD_LIMITS.phone}
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
            maxLength={FIELD_LIMITS.addressLine}
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
      </FormSection>

      <FormSection title="Emergency contact">
        <FormField
          label="Contact name"
          name="contact_name"
          type="text"
          maxLength={FIELD_LIMITS.name}
          error={errors.contact_name}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Contact phone"
            name="contact_phone"
            type="tel"
            maxLength={FIELD_LIMITS.phone}
            error={errors.contact_phone}
            required
          />
          <FormField
            label="Relationship"
            name="contact_relationship"
            type="text"
            placeholder="e.g. Parent, Spouse, Friend"
            maxLength={FIELD_LIMITS.relationship}
            error={errors.contact_relationship}
            required
          />
        </div>
      </FormSection>

      <FormSection title="Veterinarian">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Vet name or clinic"
            name="vet_name"
            type="text"
            maxLength={FIELD_LIMITS.name}
            error={errors.vet_name}
            required
          />
          <FormField
            label="Vet phone"
            name="vet_phone"
            type="tel"
            maxLength={FIELD_LIMITS.phone}
            error={errors.vet_phone}
            required
          />
        </div>
      </FormSection>

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
