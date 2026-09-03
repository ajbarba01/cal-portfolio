"use client";

import { useId, useState } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { ShimmerCard } from "@/components/ui/shimmer-card";
import { FIELD_LIMITS } from "@/lib/field-limits";
import {
  useAppForm,
  Form,
  FormRootError,
  submitAction,
} from "@/components/form";
import { formRegistry, type FormKey } from "@/features/accounts/form-registry";
import type { PetSpecies } from "@/features/pets";
import {
  ProfileFields,
  profileFieldNames,
  type FieldValues,
} from "@/features/accounts/_components/profile-fields";
import type { ActionResult } from "@/features/accounts/account-actions";
import { ProfileDisclaimer } from "@/features/accounts/_components/profile-disclaimer";

// ─── Emergency form (legacy) ──────────────────────────────────────────────────

/**
 * The retired `emergency` form, still rendered for the rows Cal collected under
 * it. Its fields live here rather than in `PROFILE_GROUPS` because nothing
 * writes them any more: the owner form owns emergency and vet contact now.
 */
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

function EmergencyFields() {
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
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Contact phone"
            name="contact_phone"
            type="tel"
            maxLength={FIELD_LIMITS.phone}
          />
          <FormField
            label="Relationship"
            name="contact_relationship"
            type="text"
            placeholder="e.g. Parent, Spouse, Friend"
            maxLength={FIELD_LIMITS.relationship}
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
          />
          <FormField
            label="Vet phone"
            name="vet_phone"
            type="tel"
            maxLength={FIELD_LIMITS.phone}
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
  status,
}: {
  open: boolean;
  submitted: boolean;
  /** Freshness status when used inline in the booking gate; drives the label. */
  status?: "complete" | "stale" | "missing";
}) {
  if (open) {
    return <span className="text-muted-foreground text-xs">Editing…</span>;
  }
  if (status === "stale") {
    return (
      <span className="text-foreground inline-flex items-center gap-1.5 text-xs font-medium">
        <span
          aria-hidden="true"
          className="bg-muted-foreground size-1.5 rounded-full"
        />
        Needs reconfirming
      </span>
    );
  }
  if (status === "complete" || (status === undefined && submitted)) {
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
  /** The pet's species, for species-conditional field filtering (pet-scoped cards only). */
  species?: PetSpecies;
  /** Override the card title (e.g. "Rex — pet care" on a per-pet card). */
  title?: string;
  /** Owner-card expense-authorization e-sign. Ignored for other forms. */
  auth?: AuthConfig;
  /**
   * Drives initial open + a stale warning when reused inline in the booking flow.
   * complete → collapsed; stale → open in edit mode with a warning; missing →
   * open empty. Omitted → legacy behavior (open when no existing row).
   */
  status?: "complete" | "stale" | "missing";
  /** Fires after a successful submit so a host (booking gate) can re-check. */
  onSaved?: () => void;
  /**
   * Render without the ShimmerCard chrome — a borderless row for hosts that
   * already provide a single surrounding card (the booking flow's forms step
   * stacks these as dividers inside one card instead of nesting cards).
   */
  flat?: boolean;
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
  species,
  title,
  auth,
  status,
  onSaved,
  flat = false,
}: FormCardProps) {
  // Cards always start collapsed — the client expands the ones they want to
  // fill. The header status (and the booking gate's hard-block) signals which
  // still need attention without forcing every card open.
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(existing !== undefined);

  // The registry's schema is a bare ZodSchema (each formKey's shape differs).
  // These cards are genuinely dynamic — Record<string, string> is the honest
  // value type — so we cast the runtime schema (a real ZodObject) to the shape
  // useAppForm's generic wants rather than threading a union of every schema
  // type through this component.
  const schema = formRegistry[formKey].schema as unknown as z.ZodObject<
    Record<string, z.ZodType<string>>
  >;
  const form = useAppForm(schema, {
    defaultValues: initialValues(formKey, existing),
  });
  const isPending = form.formState.isSubmitting;

  // Owner e-sign state. needsAccept when the current version isn't yet accepted.
  const needsAccept =
    auth !== undefined && auth.acceptedVersion !== auth.currentVersion;
  const [authChecked, setAuthChecked] = useState(false);
  const [authName, setAuthName] = useState("");
  const authNameId = useId();

  async function onSuccess() {
    if (needsAccept && auth) {
      const authResult = await auth.onAccept(authName.trim());
      if (authResult.kind !== "success") {
        form.setError("root", {
          type: "server",
          message: authResult.message,
        });
        return;
      }
    }
    setSubmitted(true);
    setOpen(false);
    onSaved?.();
  }

  const handleFormSubmit = submitAction(
    form,
    async (values) => {
      if (needsAccept && (!authChecked || authName.trim().length === 0)) {
        return {
          ok: false,
          message: "Type your legal name and check the box to authorize.",
        };
      }
      const result = await onSubmit(formKey, values as FieldValues, petId);
      return result.kind === "success"
        ? { ok: true }
        : { ok: false, message: result.message };
    },
    { onSuccess },
  );

  function handleToggle() {
    const next = !open;
    if (next && status === "stale") {
      form.reset(initialValues(formKey, existing));
    }
    setOpen(next);
  }

  const label = title ?? formRegistry[formKey].title;

  const inner = (
    <div className={flat ? "" : "rounded-card overflow-hidden"}>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-col gap-1">
          <p className="text-foreground text-sm font-semibold">{label}</p>
          <FormStatus open={open} submitted={submitted} status={status} />
        </div>
        <Button
          variant={open ? "ghost" : "outline"}
          size="sm"
          onClick={handleToggle}
          aria-expanded={open}
        >
          {open ? "Close" : submitted ? "Edit" : "Start"}
        </Button>
      </div>

      {open && (
        <Form
          form={form}
          onSubmit={handleFormSubmit}
          className="border-border bg-muted/40 flex flex-col gap-6 border-t px-4 py-4"
        >
          {status === "stale" && (
            <p
              role="status"
              className="text-foreground border-border bg-muted rounded-card border p-3 text-xs leading-relaxed"
            >
              You filled this out a while ago. Please review it and save to
              confirm it&apos;s still accurate.
            </p>
          )}
          <ProfileDisclaimer />
          {formKey === "emergency" ? (
            <EmergencyFields />
          ) : (
            <ProfileFields formKey={formKey} species={species} />
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
                  <p className="text-muted-foreground border-border bg-background rounded-card border p-3 text-xs leading-relaxed whitespace-pre-line">
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

          <FormRootError />

          <Button
            type="submit"
            variant="brand"
            disabled={isPending}
            className="self-start"
          >
            {isPending ? "Saving…" : submitted ? "Update" : "Submit"}
          </Button>
        </Form>
      )}
    </div>
  );

  return flat ? inner : <ShimmerCard>{inner}</ShimmerCard>;
}
