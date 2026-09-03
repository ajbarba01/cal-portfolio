"use client";

import { useState } from "react";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";

import {
  useAppForm,
  Form,
  FormRootError,
  submitAction,
} from "@/components/form";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { FIELD_LIMITS } from "@/lib/field-limits";
import type { FormActionResult } from "@/lib/form-action-result";
import { safeReturnTo } from "@/lib/return-to";
import { createClient } from "@/lib/supabase/client";
import { AuthCard } from "../../_components/auth-card";
import { AuthSwitchLink } from "../../_components/auth-switch-link";
import {
  authErrorMessage,
  GENERIC_FAILURE,
} from "../../_components/auth-errors";

const signupSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email("Enter a valid email")
      .max(FIELD_LIMITS.email),
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(FIELD_LIMITS.password),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

/**
 * Create account. Owns the whole card rather than sitting inside a server-
 * rendered one because the panel's heading changes the moment a confirmation
 * email is on its way.
 */
export function SignupCard() {
  const router = useRouter();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useAppForm(signupSchema, {
    defaultValues: { email: "", password: "", confirm: "" },
  });

  async function submit(
    values: z.infer<typeof signupSchema>,
  ): Promise<FormActionResult> {
    const supabase = createClient();
    // The DB trigger creates the profiles row on auth.users insert — no app
    // insert needed.
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      return {
        ok: false,
        message: authErrorMessage(error.code, GENERIC_FAILURE),
      };
    }

    // Which ending this is depends on the response, which `onSuccess` never
    // sees, so both endings are settled here. With email confirmation disabled
    // (local dev, or a project with confirmations off) signUp returns a live
    // session and the visitor is already authenticated — there is no email to
    // check, so carry any deferred-auth returnTo straight into onboarding.
    if (data.session) {
      // Read off the address bar rather than with useSearchParams, which would
      // need a Suspense boundary around the whole card and so strip the fields
      // out of the prerendered HTML. `safeReturnTo` is the one guard.
      const safe = safeReturnTo(
        new URLSearchParams(window.location.search).get("returnTo"),
      );
      router.push(
        safe
          ? `/onboarding?returnTo=${encodeURIComponent(safe)}`
          : "/onboarding",
      );
      router.refresh();
    } else {
      setSentTo(values.email);
    }
    return { ok: true };
  }

  if (sentTo) {
    return (
      <AuthCard
        icon={Mail}
        title="Check your email"
        subtitle={
          <>
            We sent a confirmation link to <strong>{sentTo}</strong>. Click it
            to activate your account.
          </>
        }
      />
    );
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <AuthCard
      title="Create account"
      subtitle="Book Cal for walks, check-ins & house-sitting."
      footer={
        <>
          Have an account?{" "}
          <AuthSwitchLink href="/login">Sign in</AuthSwitchLink>
        </>
      }
    >
      <Form
        form={form}
        onSubmit={submitAction(form, submit)}
        className="flex flex-col gap-4"
      >
        <FormRootError />

        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={FIELD_LIMITS.email}
        />

        <FormField
          label="Password"
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
          disabled={isSubmitting}
          className="mt-1 w-full"
        >
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </Form>
    </AuthCard>
  );
}
