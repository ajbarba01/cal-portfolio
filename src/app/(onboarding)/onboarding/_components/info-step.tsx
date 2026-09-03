"use client";

import { submitOnboarding, onboardingClientSchema } from "@/features/accounts";
import {
  useAppForm,
  Form,
  FormRootError,
  submitAction,
} from "@/components/form";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { FIELD_LIMITS } from "@/lib/field-limits";

/**
 * Step 1 — the client's profile. RHF + zod validate client-side, so an invalid
 * submit never round-trips (and never resets the form — the old useActionState
 * wiring lost all input on a server validation error). The server re-parses the
 * same schema; submitOnboarding redirects on success.
 *
 * Nothing else is asked for here. Emergency and vet contact belong to the owner
 * form, which the booking gate requires before the first paid booking — the
 * meet & greet that follows this step is free and needs no intake.
 */
export function InfoStep({ returnTo }: { returnTo?: string }) {
  const form = useAppForm(onboardingClientSchema, {
    defaultValues: {
      full_name: "",
      phone: "",
      address: "",
      zip: "",
    },
  });
  const isPending = form.formState.isSubmitting;

  return (
    <Form
      form={form}
      onSubmit={submitAction(form, (values) =>
        submitOnboarding(values, returnTo),
      )}
      className="flex flex-col gap-5"
    >
      <FormSection title="Your profile">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Full name"
            name="full_name"
            type="text"
            autoComplete="name"
            maxLength={FIELD_LIMITS.name}
          />
          <FormField
            label="Phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={FIELD_LIMITS.phone}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Street address"
            name="address"
            type="text"
            autoComplete="street-address"
            hint="Street address, apt or unit"
            maxLength={FIELD_LIMITS.addressLine}
          />
          <FormField
            label="ZIP code"
            name="zip"
            type="text"
            autoComplete="postal-code"
            inputMode="numeric"
            maxLength={10}
          />
        </div>
      </FormSection>

      <FormRootError />

      <Button
        type="submit"
        variant="brand"
        disabled={isPending}
        className="w-full"
      >
        {isPending ? "Saving…" : "Continue →"}
      </Button>
    </Form>
  );
}
