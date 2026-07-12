"use client";

import { useState } from "react";
import { z } from "zod";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/feedback/toast";
import { FIELD_LIMITS } from "@/lib/field-limits";
import { createUnclaimedClient } from "@/features/admin";
import type { OnboardingStatus } from "@/features/booking";
import type { FormActionResult } from "@/lib/form-action-result";
import {
  useAppForm,
  Form,
  FormRootError,
  submitAction,
} from "@/components/form";

const STATUS_OPTIONS: { value: OnboardingStatus; label: string }[] = [
  { value: "approved", label: "Approved (skip onboarding)" },
  { value: "info_pending", label: "Needs onboarding info" },
  { value: "meet_greet_pending", label: "Needs meet & greet" },
  { value: "declined", label: "Declined" },
];

const newClientSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Full name is required")
    .max(FIELD_LIMITS.name),
  email: z.string().trim().email("Enter a valid email").max(FIELD_LIMITS.email),
  phone: z.string().max(FIELD_LIMITS.phone).optional().or(z.literal("")),
  address: z
    .string()
    .max(FIELD_LIMITS.addressLine)
    .optional()
    .or(z.literal("")),
  zip: z.string().max(FIELD_LIMITS.zip).optional().or(z.literal("")),
});

export function NewClientForm() {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<OnboardingStatus>("approved");

  const form = useAppForm(newClientSchema, {
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      address: "",
      zip: "",
    },
  });

  async function submit(
    values: z.infer<typeof newClientSchema>,
  ): Promise<FormActionResult> {
    const result = await createUnclaimedClient({
      ...values,
      onboardingStatus: status,
    });
    switch (result.kind) {
      case "success":
        toast.add({ type: "success", title: "Client created" });
        router.push(`/admin/clients/${result.clientId}`);
        router.refresh();
        return { ok: true };
      case "email_exists":
        return {
          ok: false,
          fieldErrors: {
            email: result.clientId
              ? "A client with this email already exists. Open their existing profile instead."
              : "A client with this email already exists.",
          },
        };
      case "forbidden":
        return {
          ok: false,
          message: "Your admin session expired — refresh and try again.",
        };
      case "validation_error":
        return { ok: false, message: result.message };
      case "error":
        return { ok: false, message: result.message };
    }
  }

  const isPending = form.formState.isSubmitting;

  return (
    <Surface variant="plain" className="max-w-xl p-6">
      <Form
        form={form}
        onSubmit={submitAction(form, submit)}
        className="flex flex-col gap-4"
      >
        <FormRootError />

        <FormField
          label="Full name"
          name="fullName"
          maxLength={FIELD_LIMITS.name}
        />

        <FormField
          label="Email"
          name="email"
          type="email"
          maxLength={FIELD_LIMITS.email}
          hint="Used as the account identity. The client claims it later via a link you generate — no email is sent now."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Phone"
            name="phone"
            maxLength={FIELD_LIMITS.phone}
            optional
          />
          <FormField
            label="ZIP"
            name="zip"
            maxLength={FIELD_LIMITS.zip}
            optional
          />
        </div>

        <FormField
          label="Address"
          name="address"
          maxLength={FIELD_LIMITS.addressLine}
          optional
        />

        <div className="flex flex-col gap-1.5">
          <Label>Initial onboarding status</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as OnboardingStatus)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating…" : "Create client"}
          </Button>
          <Link
            href="/admin/clients"
            className={cn(buttonVariants({ variant: "ghost" }))}
          >
            Cancel
          </Link>
        </div>
      </Form>
    </Surface>
  );
}
