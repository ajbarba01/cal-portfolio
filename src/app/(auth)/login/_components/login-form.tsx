"use client";

import { Suspense } from "react";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";

import {
  useAppForm,
  Form,
  FormRootError,
  submitAction,
} from "@/components/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { FIELD_LIMITS } from "@/lib/field-limits";
import type { FormActionResult } from "@/lib/form-action-result";
import { safeReturnTo } from "@/lib/return-to";
import { createClient } from "@/lib/supabase/client";
import {
  authErrorMessage,
  SIGN_IN_FAILED,
} from "../../_components/auth-errors";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(FIELD_LIMITS.email),
  // No client-side password rule: whether a password is the right one is
  // Supabase's call, and an empty one is simply a wrong one.
  password: z.string().max(FIELD_LIMITS.password),
});

export function LoginForm() {
  const router = useRouter();

  const form = useAppForm(loginSchema, {
    defaultValues: { email: "", password: "" },
  });

  async function submit(
    values: z.infer<typeof loginSchema>,
  ): Promise<FormActionResult> {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    if (error) {
      return {
        ok: false,
        message: authErrorMessage(error.code, SIGN_IN_FAILED),
      };
    }
    return { ok: true };
  }

  const { errors, isSubmitting } = form.formState;

  return (
    <Form
      form={form}
      onSubmit={submitAction(form, submit, {
        onSuccess: () => {
          // Deferred-auth round trip: back to the booking selection when a
          // usable returnTo rode in on the query string, else the account home.
          // Read off the address bar rather than with useSearchParams, which
          // would need a Suspense boundary around the whole form and so strip
          // the fields out of the prerendered HTML.
          const returnTo = new URLSearchParams(window.location.search).get(
            "returnTo",
          );
          router.push(safeReturnTo(returnTo) ?? "/account");
          router.refresh();
        },
      })}
      className="flex flex-col gap-4"
    >
      <FormRootError />

      {/* Once a submit of this form fails, that failure supersedes whatever
          sent the visitor here, so the card never carries two competing
          explanations. */}
      {errors.root ? null : (
        <Suspense fallback={null}>
          <SignInFailureNotice />
        </Suspense>
      )}

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
        autoComplete="current-password"
        maxLength={FIELD_LIMITS.password}
      />

      <Button
        type="submit"
        variant="brand"
        disabled={isSubmitting}
        className="mt-1 w-full"
      >
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
    </Form>
  );
}

/**
 * Why an earlier link or auth callback sent the visitor back here, named by the
 * `?error=` code that `/claim` and the callback route redirect with. Reading it
 * is what keeps this component behind a Suspense boundary rather than in the
 * page's own render.
 */
function SignInFailureNotice() {
  const code = useSearchParams().get("error");
  if (!code) return null;
  return (
    <Alert variant="error" role="alert">
      {authErrorMessage(code, SIGN_IN_FAILED)}
    </Alert>
  );
}
