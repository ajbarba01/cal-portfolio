"use client";

import { useState } from "react";
import { z } from "zod";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { changePassword } from "@/features/accounts";
import { FIELD_LIMITS } from "@/lib/field-limits";
import {
  useAppForm,
  Form,
  FormRootError,
  submitAction,
} from "@/components/form";

const passwordFormSchema = z
  .object({
    new_password: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(FIELD_LIMITS.password),
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    message: "Passwords don't match.",
    path: ["confirm_password"],
  });

export function PasswordForm() {
  const [saved, setSaved] = useState(false);

  const form = useAppForm(passwordFormSchema, {
    defaultValues: { new_password: "", confirm_password: "" },
  });

  return (
    <Form
      form={form}
      onSubmit={submitAction(
        form,
        async (values) => {
          const result = await changePassword(values.new_password);
          return result.kind === "success"
            ? { ok: true }
            : { ok: false, message: result.message };
        },
        {
          onSuccess: () => {
            form.reset();
            setSaved(true);
          },
        },
      )}
      className="flex flex-col gap-4"
    >
      <FormRootError />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="New password"
          name="new_password"
          type="password"
          autoComplete="new-password"
          maxLength={FIELD_LIMITS.password}
        />

        <FormField
          label="Confirm"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          maxLength={FIELD_LIMITS.password}
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
          {form.formState.isSubmitting ? "Updating…" : "Update password"}
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
