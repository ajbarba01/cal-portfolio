"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const STATUS_OPTIONS: { value: OnboardingStatus; label: string }[] = [
  { value: "approved", label: "Approved (skip onboarding)" },
  { value: "info_pending", label: "Needs onboarding info" },
  { value: "meet_greet_pending", label: "Needs meet & greet" },
  { value: "declined", label: "Declined" },
];

export function NewClientForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<OnboardingStatus>("approved");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    start(async () => {
      const result = await createUnclaimedClient({
        email: String(form.get("email") ?? ""),
        fullName: String(form.get("fullName") ?? ""),
        phone: String(form.get("phone") ?? ""),
        address: String(form.get("address") ?? ""),
        zip: String(form.get("zip") ?? ""),
        onboardingStatus: status,
      });
      switch (result.kind) {
        case "success":
          toast.add({ type: "success", title: "Client created" });
          router.push(`/admin/clients/${result.clientId}`);
          router.refresh();
          break;
        case "email_exists":
          setError(
            result.clientId
              ? "A client with this email already exists. Open their existing profile instead."
              : "A client with this email already exists.",
          );
          break;
        case "validation_error":
          setError(result.message);
          break;
        case "forbidden":
          setError("Your admin session expired — refresh and try again.");
          break;
        case "error":
          setError(result.message);
          break;
      }
    });
  }

  return (
    <Surface variant="plain" className="max-w-xl p-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            name="fullName"
            required
            maxLength={FIELD_LIMITS.name}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            maxLength={FIELD_LIMITS.email}
          />
          <p className="text-muted-foreground text-xs">
            Used as the account identity. The client claims it later via a link
            you generate — no email is sent now.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input id="phone" name="phone" maxLength={FIELD_LIMITS.phone} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="zip">ZIP (optional)</Label>
            <Input id="zip" name="zip" maxLength={FIELD_LIMITS.zip} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address">Address (optional)</Label>
          <Input
            id="address"
            name="address"
            maxLength={FIELD_LIMITS.addressLine}
          />
        </div>
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

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create client"}
          </Button>
          <Link
            href="/admin/clients"
            className={cn(buttonVariants({ variant: "ghost" }))}
          >
            Cancel
          </Link>
        </div>
      </form>
    </Surface>
  );
}
