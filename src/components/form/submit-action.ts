"use client";

import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import type { FormActionResult } from "@/lib/form-action-result";

/**
 * Bridge an RHF form to a server action that returns FormActionResult.
 * - fieldErrors → per-field setError (type "server") + focus the first
 * - message (or a bare failure) → errors.root, rendered by FormRootError
 * - success → opts.onSuccess
 * Rejections are NOT caught: a server action that redirect()s throws
 * NEXT_REDIRECT, which must propagate to the Next.js runtime.
 */
export function submitAction<TValues extends FieldValues>(
  form: UseFormReturn<TValues>,
  action: (values: TValues) => Promise<FormActionResult>,
  opts?: { onSuccess?: () => void | Promise<void> },
): (values: TValues) => Promise<void> {
  return async (values) => {
    const result = await action(values);
    if (result.ok) {
      await opts?.onSuccess?.();
      return;
    }
    const entries = Object.entries(result.fieldErrors ?? {});
    for (const [name, message] of entries) {
      form.setError(name as Path<TValues>, { type: "server", message });
    }
    const [firstEntry] = entries;
    if (firstEntry) {
      form.setFocus(firstEntry[0] as Path<TValues>);
    }
    if (result.message || entries.length === 0) {
      form.setError("root", {
        type: "server",
        message: result.message ?? "Something went wrong. Please try again.",
      });
    }
  };
}
