"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { updateProfile, profileSchema } from "@/features/accounts";
import type { ProfileInput } from "@/features/accounts";
import { FIELD_LIMITS } from "@/lib/field-limits";
import {
  useAppForm,
  Form,
  FormRootError,
  submitAction,
} from "@/components/form";

interface ProfileFormProps {
  initialValues: ProfileInput;
}

export function ProfileForm({ initialValues }: ProfileFormProps) {
  const [saved, setSaved] = useState(false);

  const form = useAppForm(profileSchema, { defaultValues: initialValues });

  return (
    <Form
      form={form}
      onSubmit={submitAction(
        form,
        async (values) => {
          const result = await updateProfile(values);
          return result.kind === "success"
            ? { ok: true }
            : { ok: false, message: result.message };
        },
        {
          onSuccess: () => setSaved(true),
        },
      )}
      className="flex flex-col gap-4"
    >
      <FormRootError />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Full name"
          name="full_name"
          type="text"
          autoComplete="name"
          maxLength={FIELD_LIMITS.name}
          required
        />

        <FormField
          label="Phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          maxLength={FIELD_LIMITS.phone}
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
          required
        />

        <FormField
          label="ZIP code"
          name="zip"
          type="text"
          autoComplete="postal-code"
          inputMode="numeric"
          maxLength={10}
          required
        />
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="brand"
          disabled={form.formState.isSubmitting}
          className="self-start"
          onClick={() => setSaved(false)}
        >
          {form.formState.isSubmitting ? "Saving…" : "Save changes"}
        </Button>
        {saved && (
          <span
            role="status"
            className="text-status-available-foreground inline-flex items-center gap-1 text-sm font-medium"
          >
            <Check className="size-4" strokeWidth={3} aria-hidden="true" />
            Saved
          </span>
        )}
      </div>
    </Form>
  );
}
