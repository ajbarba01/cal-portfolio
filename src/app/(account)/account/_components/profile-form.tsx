"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile } from "@/features/accounts/account-actions";
import type { ProfileInput } from "@/features/accounts/profile-schema";

interface ProfileFormProps {
  initialValues: ProfileInput;
}

export function ProfileForm({ initialValues }: ProfileFormProps) {
  const [values, setValues] = useState<ProfileInput>(initialValues);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValues((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("idle");
    setMessage(null);

    startTransition(async () => {
      const result = await updateProfile(values);
      if (result.kind === "success") {
        setStatus("success");
        setMessage("Profile updated.");
      } else {
        setStatus("error");
        setMessage(result.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="full_name">Full name</Label>
          <Input
            id="full_name"
            name="full_name"
            type="text"
            autoComplete="name"
            value={values.full_name}
            onChange={handleChange}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={values.phone}
            onChange={handleChange}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address">Street address</Label>
          <Input
            id="address"
            name="address"
            type="text"
            autoComplete="street-address"
            value={values.address}
            onChange={handleChange}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="zip">ZIP code</Label>
          <Input
            id="zip"
            name="zip"
            type="text"
            autoComplete="postal-code"
            inputMode="numeric"
            maxLength={10}
            value={values.zip}
            onChange={handleChange}
            required
          />
        </div>
      </div>

      {status === "error" && message && (
        <p role="alert" className="text-destructive text-sm">
          {message}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending} className="self-start">
          {isPending ? "Saving…" : "Save changes"}
        </Button>
        {status === "success" && (
          <span
            role="status"
            className="text-status-available-foreground inline-flex items-center gap-1 text-sm font-medium"
          >
            <Check className="size-4" strokeWidth={3} aria-hidden="true" />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
