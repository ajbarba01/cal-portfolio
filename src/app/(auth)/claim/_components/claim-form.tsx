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
import { GENERIC_FAILURE } from "../../_components/auth-errors";

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
        // The password rules, written by this app in its own voice.
        return { ok: false, message: result.message };
      case "error":
        // Whereas this message is the SDK's: GoTrue's for the password update
        // ("New password should be different from the old password."),
        // Postgres's for the flag write. Neither goes on screen.
        return { ok: false, message: GENERIC_FAILURE };
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

      <Button
        type="submit"
        variant="brand"
        disabled={isPending}
        className="mt-1 w-full"
      >
        {isPending ? "Setting up…" : "Claim my account"}
      </Button>
    </Form>
  );
}
