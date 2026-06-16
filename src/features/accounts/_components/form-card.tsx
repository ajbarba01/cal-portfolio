"use client";

import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { ShimmerCard } from "@/components/ui/shimmer-card";
import { FIELD_LIMITS } from "@/lib/field-limits";
import { formRegistry, type FormKey } from "@/features/accounts/form-registry";
import {
  ProfileFields,
  profileFieldNames,
  type FieldValues,
} from "@/features/accounts/_components/profile-fields";
import type { ActionResult } from "@/features/accounts/account-actions";

// ─── Emergency form (legacy) ──────────────────────────────────────────────────

const EMERGENCY_FIELDS = [
  "contact_name",
  "contact_phone",
  "contact_relationship",
  "vet_name",
  "vet_phone",
] as const;

/** @deprecated kept for back-compat; profiles use the generic FieldValues bag. */
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
  values: FieldValues;
  onChange: (name: string, value: string) => void;
}) {
  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.name, e.target.value);
  }
  const contactId = useId();
  const vetId = useId();

  return (
    <>
      <div
        role="group"
        aria-labelledby={contactId}
        className="flex flex-col gap-4"
      >
        <Eyebrow id={contactId}>Emergency contact</Eyebrow>
        <FormField
          label="Contact name"
          name="contact_name"
          type="text"
          maxLength={FIELD_LIMITS.name}
          value={values.contact_name ?? ""}
          onChange={handle}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Contact phone"
            name="contact_phone"
            type="tel"
            maxLength={FIELD_LIMITS.phone}
            value={values.contact_phone ?? ""}
            onChange={handle}
            required
          />
          <FormField
            label="Relationship"
            name="contact_relationship"
            type="text"
            placeholder="e.g. Parent, Spouse, Friend"
            maxLength={FIELD_LIMITS.relationship}
            value={values.contact_relationship ?? ""}
            onChange={handle}
            required
          />
        </div>
      </div>

      <div role="group" aria-labelledby={vetId} className="flex flex-col gap-4">
        <Eyebrow id={vetId}>Veterinarian</Eyebrow>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Vet name or clinic"
            name="vet_name"
            type="text"
            maxLength={FIELD_LIMITS.name}
            value={values.vet_name ?? ""}
            onChange={handle}
            required
          />
          <FormField
            label="Vet phone"
            name="vet_phone"
            type="tel"
            maxLength={FIELD_LIMITS.phone}
            value={values.vet_phone ?? ""}
            onChange={handle}
            required
          />
        </div>
      </div>
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

// ─── Expense-authorization e-sign (owner only) ────────────────────────────────

/** Owner-card e-sign config; absent for non-owner cards or when not wired. */
export interface AuthConfig {
  /** The version the client most recently accepted, or null if never. */
  acceptedVersion: string | null;
  acceptedAt: string | null;
  /** The current authorization version + text to accept. */
  currentVersion: string;
  text: string;
  /** Appends an authorizations row for the typed legal name. */
  onAccept: (acceptedName: string) => Promise<ActionResult>;
}

// ─── FormCard ─────────────────────────────────────────────────────────────────

export interface FormResponseLike {
  data: Record<string, unknown>;
}

export interface FormCardProps {
  formKey: FormKey;
  existing: FormResponseLike | undefined;
  /**
   * Injected submit action. Account passes its own `submitForm`; admin passes an
   * on-behalf variant. Receives validated values and the optional pet scope.
   */
  onSubmit: (
    formKey: FormKey,
    values: FieldValues,
    petId?: string | null,
  ) => Promise<ActionResult>;
  /** Pet scope for pet-scoped cards (one card per pet). */
  petId?: string | null;
  /** Override the card title (e.g. "Rex — pet care" on a per-pet card). */
  title?: string;
  /** Owner-card expense-authorization e-sign. Ignored for other forms. */
  auth?: AuthConfig;
}

function initialValues(
  formKey: FormKey,
  existing: FormResponseLike | undefined,
): FieldValues {
  const names =
    formKey === "emergency"
      ? [...EMERGENCY_FIELDS]
      : profileFieldNames(formKey);
  const prefill = (existing?.data ?? {}) as Record<string, unknown>;
  const out: FieldValues = {};
  for (const name of names) {
    const v = prefill[name];
    out[name] = typeof v === "string" ? v : "";
  }
  return out;
}

export function FormCard({
  formKey,
  existing,
  onSubmit,
  petId = null,
  title,
  auth,
}: FormCardProps) {
  const [open, setOpen] = useState(!existing);
  const [submitted, setSubmitted] = useState(existing !== undefined);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<FieldValues>(() =>
    initialValues(formKey, existing),
  );

  // Owner e-sign state. needsAccept when the current version isn't yet accepted.
  const needsAccept =
    auth !== undefined && auth.acceptedVersion !== auth.currentVersion;
  const [authChecked, setAuthChecked] = useState(false);
  const [authName, setAuthName] = useState("");
  const authNameId = useId();

  function handleChange(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (needsAccept && (!authChecked || authName.trim().length === 0)) {
      setError("Type your legal name and check the box to authorize.");
      return;
    }

    startTransition(async () => {
      const result = await onSubmit(formKey, values, petId);
      if (result.kind !== "success") {
        setError(result.message);
        return;
      }
      if (needsAccept && auth) {
        const authResult = await auth.onAccept(authName.trim());
        if (authResult.kind !== "success") {
          setError(authResult.message);
          return;
        }
      }
      setSubmitted(true);
      setOpen(false);
    });
  }

  const label = title ?? formRegistry[formKey].title;

  return (
    <ShimmerCard>
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
            {formKey === "emergency" ? (
              <EmergencyFields values={values} onChange={handleChange} />
            ) : (
              <ProfileFields
                formKey={formKey}
                values={values}
                onChange={handleChange}
              />
            )}

            {auth ? (
              <div
                role="group"
                aria-labelledby={`${authNameId}-h`}
                className="flex flex-col gap-3"
              >
                <Eyebrow id={`${authNameId}-h`}>
                  Emergency expense authorization
                </Eyebrow>
                {needsAccept ? (
                  <>
                    <p className="text-muted-foreground border-border bg-background rounded-xl border p-3 text-xs leading-relaxed whitespace-pre-line">
                      {auth.text}
                    </p>
                    <label className="flex items-start gap-2.5 text-sm">
                      <Checkbox
                        checked={authChecked}
                        onChange={(e) => setAuthChecked(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        I have read and agree to the authorization above.
                      </span>
                    </label>
                    <FormField
                      label="Type your legal name to sign"
                      name="accepted_name"
                      type="text"
                      maxLength={FIELD_LIMITS.name}
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                    />
                  </>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Accepted
                    {auth.acceptedAt
                      ? ` on ${new Date(auth.acceptedAt).toLocaleDateString()}`
                      : ""}
                    . Thank you.
                  </p>
                )}
              </div>
            ) : null}

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
