"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShimmerCard } from "@/components/ui/shimmer-card";
import type { FormKey } from "@/features/accounts/form-registry";
import type { ActionResult } from "@/features/accounts/account-actions";

// ─── Form labels ──────────────────────────────────────────────────────────────

export const FORM_LABELS: Record<FormKey, string> = {
  emergency: "Emergency contact & vet info",
};

// ─── Emergency form fields ────────────────────────────────────────────────────

export interface EmergencyFormValues {
  contact_name: string;
  contact_phone: string;
  contact_relationship: string;
  vet_name: string;
  vet_phone: string;
}

function EmergencyFields({
  values,
  onChange,
}: {
  values: EmergencyFormValues;
  onChange: (name: string, value: string) => void;
}) {
  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.name, e.target.value);
  }

  return (
    <>
      <fieldset className="flex flex-col gap-4">
        <legend className="text-brand-strong text-xs font-semibold tracking-wide uppercase">
          Emergency contact
        </legend>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact_name">Contact name</Label>
          <Input
            id="contact_name"
            name="contact_name"
            type="text"
            value={values.contact_name}
            onChange={handle}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact_phone">Contact phone</Label>
            <Input
              id="contact_phone"
              name="contact_phone"
              type="tel"
              value={values.contact_phone}
              onChange={handle}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact_relationship">Relationship</Label>
            <Input
              id="contact_relationship"
              name="contact_relationship"
              type="text"
              placeholder="e.g. Parent, Spouse, Friend"
              value={values.contact_relationship}
              onChange={handle}
              required
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-brand-strong text-xs font-semibold tracking-wide uppercase">
          Veterinarian
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vet_name">Vet name or clinic</Label>
            <Input
              id="vet_name"
              name="vet_name"
              type="text"
              value={values.vet_name}
              onChange={handle}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vet_phone">Vet phone</Label>
            <Input
              id="vet_phone"
              name="vet_phone"
              type="tel"
              value={values.vet_phone}
              onChange={handle}
              required
            />
          </div>
        </div>
      </fieldset>
    </>
  );
}

// ─── Status indicator ───────────────────────────────────────────────────────

function FormStatus({
  open,
  submitted,
}: {
  open: boolean;
  submitted: boolean;
}) {
  if (open) {
    return <span className="text-muted-foreground text-xs">Editing…</span>;
  }
  if (submitted) {
    return (
      <span className="text-status-available-foreground inline-flex items-center gap-1.5 text-xs font-medium">
        <span
          aria-hidden="true"
          className="bg-status-available-foreground size-1.5 rounded-full"
        />
        Completed
      </span>
    );
  }
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-medium">
      <span
        aria-hidden="true"
        className="bg-muted-foreground/40 size-1.5 rounded-full"
      />
      Not started
    </span>
  );
}

// ─── FormCard ─────────────────────────────────────────────────────────────────

export interface FormResponseLike {
  data: Record<string, unknown>;
}

export interface FormCardProps {
  formKey: FormKey;
  existing: FormResponseLike | undefined;
  /**
   * Injected submit action so account passes its own `submitForm` and admin can
   * pass a profile-scoped on-behalf variant. Receives the validated values and
   * returns an ActionResult.
   */
  onSubmit: (
    formKey: FormKey,
    values: EmergencyFormValues,
  ) => Promise<ActionResult>;
}

export function FormCard({ formKey, existing, onSubmit }: FormCardProps) {
  const [open, setOpen] = useState(!existing);
  const [submitted, setSubmitted] = useState(existing !== undefined);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const prefill = existing?.data as Partial<EmergencyFormValues> | undefined;
  const [values, setValues] = useState<EmergencyFormValues>({
    contact_name: prefill?.contact_name ?? "",
    contact_phone: prefill?.contact_phone ?? "",
    contact_relationship: prefill?.contact_relationship ?? "",
    vet_name: prefill?.vet_name ?? "",
    vet_phone: prefill?.vet_phone ?? "",
  });

  function handleChange(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await onSubmit(formKey, values);
      if (result.kind === "success") {
        setSubmitted(true);
        setOpen(false);
      } else {
        setError(result.message);
      }
    });
  }

  const label = FORM_LABELS[formKey];

  return (
    <ShimmerCard>
      {/* Inner clip wrapper: rounds the expandable form's corners. overflow-hidden
          can't live on ShimmerCard itself — it would clip the bleeding ring. */}
      <div className="overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-col gap-1">
            <p className="text-foreground text-sm font-semibold">{label}</p>
            <FormStatus open={open} submitted={submitted} />
          </div>
          <Button
            variant={open ? "ghost" : "outline"}
            size="sm"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            {open ? "Close" : submitted ? "Edit" : "Start"}
          </Button>
        </div>

        {open && (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="border-border bg-muted/40 flex flex-col gap-6 border-t px-4 py-4"
          >
            {formKey === "emergency" && (
              <EmergencyFields values={values} onChange={handleChange} />
            )}

            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="brand"
              disabled={isPending}
              className="self-start"
            >
              {isPending ? "Saving…" : submitted ? "Update" : "Submit"}
            </Button>
          </form>
        )}
      </div>
    </ShimmerCard>
  );
}
