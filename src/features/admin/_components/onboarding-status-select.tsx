"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { badgeVariants } from "@/components/ui/badge";
import { useConfirm } from "@/components/feedback/confirm-dialog";
import { useToast } from "@/components/feedback/toast";
import { setOnboardingStatus } from "@/features/admin/clients-actions";
import {
  onboardingStatusLabel,
  onboardingStatusBadgeVariant,
} from "@/features/admin/onboarding-badge";
import { cn } from "@/lib/utils";
import type { OnboardingStatus } from "@/features/booking/index.client";

/** The three admin-settable statuses (info_pending is client-driven, not settable). */
const SETTABLE = [
  { value: "meet_greet_pending", label: "Pending", dot: "bg-brand" },
  { value: "approved", label: "Approved", dot: "bg-status-available" },
  { value: "declined", label: "Declined", dot: "bg-destructive" },
] as const;

export function OnboardingStatusSelect({
  clientId,
  status,
  meetGreetUpcoming,
  className,
}: {
  clientId: string;
  status: OnboardingStatus;
  meetGreetUpcoming: boolean;
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [isPending, startTransition] = useTransition();

  // info_pending is set by the client finishing their forms — not admin-settable.
  if (status === "info_pending") {
    return (
      <span
        className={cn(
          badgeVariants({ variant: "default" }),
          "text-muted-foreground",
          className,
        )}
      >
        Profile pending
      </span>
    );
  }

  async function onChange(next: string | null) {
    if (!next || next === status) return;
    if (next === "approved" && meetGreetUpcoming) {
      const ok = await confirm({
        title: "Approve before the visit?",
        description:
          "This client's meet & greet hasn't happened yet. Approve anyway?",
        confirmLabel: "Approve anyway",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const result = await setOnboardingStatus(clientId, next);
      if (result.kind === "success") {
        toast.add({ title: "Onboarding status updated" });
        router.refresh();
      } else {
        toast.add({
          title: "Couldn't update status",
          description: result.kind,
          type: "error",
        });
      }
    });
  }

  // Trigger reuses the status Badge styling (same variant mapping as everywhere
  // else) so the control reads as an editable status pill, not a form field.
  return (
    <>
      {dialog}
      <Select value={status} onValueChange={onChange} disabled={isPending}>
        <SelectTrigger
          aria-label="Onboarding status"
          className={cn(
            badgeVariants({
              variant: onboardingStatusBadgeVariant(status),
            }),
            "h-auto w-fit cursor-pointer gap-1 border-0 py-1 pr-1.5 pl-2.5 shadow-none focus-visible:ring-2 disabled:opacity-60 [&_svg]:size-3.5 [&_svg]:opacity-60",
            className,
          )}
        >
          {onboardingStatusLabel(status)}
        </SelectTrigger>
        <SelectContent>
          {SETTABLE.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              <span className="flex items-center gap-2">
                <span
                  className={cn("size-2 rounded-full", opt.dot)}
                  aria-hidden="true"
                />
                {opt.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
