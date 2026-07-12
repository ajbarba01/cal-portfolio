"use client";

import * as React from "react";
import {
  FormProvider,
  useFormContext,
  useFormState,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form";
import { Alert } from "@/components/ui/alert";

/**
 * FormProvider + the <form> element in one: every migrated form renders
 * exactly this shell. `noValidate` keeps browser validation bubbles off —
 * zod (via useAppForm) is the validator; base-ui Field renders the errors.
 */
export function Form<TValues extends FieldValues>({
  form,
  onSubmit,
  className,
  children,
}: {
  form: UseFormReturn<TValues>;
  onSubmit: (values: TValues) => void | Promise<void>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className={className}
      >
        {children}
      </form>
    </FormProvider>
  );
}

/**
 * The form-level (root) error slot — place it above the submit row. Renders
 * nothing until submitAction (or the form itself) sets errors.root.
 */
export function FormRootError() {
  const { control } = useFormContext();
  const { errors } = useFormState({ control });
  const message = errors.root?.message;
  if (!message) return null;
  return (
    <Alert variant="error" role="alert">
      {message}
    </Alert>
  );
}
