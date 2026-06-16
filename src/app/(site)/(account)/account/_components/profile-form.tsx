"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { updateProfile } from "@/features/accounts";
import type { ProfileInput } from "@/features/accounts";
import { FIELD_LIMITS } from "@/lib/field-limits";

interface ProfileFormProps {
  initialValues: ProfileInput;
}

export function ProfileForm({ initialValues }: ProfileFormProps) {
  const [values, setValues] = useState<ProfileInput>(initialValues);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValues((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("idle");
    setMessage(null);

    startTransition(async () => {
      const result = await updateProfile(values);
      if (result.kind === "success") {
        setStatus("success");
        setMessage("Profile updated.");
      } else {
        setStatus("error");
        setMessage(result.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Full name"
          name="full_name"
          type="text"
          autoComplete="name"
          maxLength={FIELD_LIMITS.name}
          value={values.full_name}
          onChange={handleChange}
          required
        />

        <FormField
          label="Phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          maxLength={FIELD_LIMITS.phone}
          value={values.phone}
          onChange={handleChange}
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
          value={values.address}
          onChange={handleChange}
          required
        />

        <FormField
          label="ZIP code"
          name="zip"
          type="text"
          autoComplete="postal-code"
          inputMode="numeric"
          maxLength={10}
          value={values.zip}
          onChange={handleChange}
          required
        />
      </div>

      {status === "error" && message && (
        <p role="alert" className="text-destructive text-sm">
          {message}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="brand"
          disabled={isPending}
          className="self-start"
        >
          {isPending ? "Saving…" : "Save changes"}
        </Button>
        {status === "success" && (
          <span
            role="status"
            className="text-status-available-foreground inline-flex items-center gap-1 text-sm font-medium"
          >
            <Check className="size-4" strokeWidth={3} aria-hidden="true" />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
