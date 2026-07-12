"use client";

import { z } from "zod";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { claimAccount } from "@/features/accounts/index.client";
import { FIELD_LIMITS } from "@/lib/field-limits";
import type { FormActionResult } from "@/lib/form-action-result";
import {
  useAppForm,
  Form,
  FormRootError,
  submitAction,
} from "@/components/form";

const claimSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

export function ClaimForm() {
  const router = useRouter();

  const form = useAppForm(claimSchema, {
    defaultValues: { password: "", confirm: "" },
  });

  async function submit(
    values: z.infer<typeof claimSchema>,
  ): Promise<FormActionResult> {
    const result = await claimAccount(values.password);
    switch (result.kind) {
      case "success":
        return { ok: true };
      case "unauthenticated":
        return {
          ok: false,
          message: "This claim link has expired. Ask Cal to send a new one.",
        };
      case "validation_error":
        return { ok: false, message: result.message };
      case "error":
        return { ok: false, message: result.message };
    }
  }

  const isPending = form.formState.isSubmitting;

  return (
    <Form
      form={form}
      onSubmit={submitAction(form, submit, {
        onSuccess: () => {
          // Onboarding middleware routes by onboarding_status from here.
          router.push("/account");
          router.refresh();
        },
      })}
      className="flex flex-col gap-4"
    >
      <FormRootError />

      <FormField
        label="Choose a password"
        name="password"
        type="password"
        autoComplete="new-password"
        maxLength={FIELD_LIMITS.password}
      />

      <FormField
        label="Confirm password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        maxLength={FIELD_LIMITS.password}
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Setting up…" : "Claim my account"}
      </Button>
    </Form>
  );
}
