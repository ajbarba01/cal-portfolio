"use client";

import {
  submitForm,
  FormCard,
  type FormKey,
} from "@/features/accounts/index.client";
import type { FormResponseRow } from "../page";

// ─── Forms list ───────────────────────────────────────────────────────────────

interface FormsClientProps {
  formKeys: FormKey[];
  /** Map of form_key → existing response (undefined = not submitted yet). */
  initialResponses: Record<string, FormResponseRow>;
}

export function FormsClient({ formKeys, initialResponses }: FormsClientProps) {
  if (formKeys.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No forms required at this time.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {formKeys.map((key) => (
        <FormCard
          key={key}
          formKey={key}
          existing={initialResponses[key]}
          onSubmit={submitForm}
        />
      ))}
    </div>
  );
}
