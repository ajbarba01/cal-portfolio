"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useConfirm } from "@/components/feedback/confirm-dialog";
import { useToast } from "@/components/feedback/toast";
import { setOnboardingStatus } from "@/features/admin/clients-actions";
import { onboardingStatusLabel } from "@/features/admin/onboarding-badge";
import { cn } from "@/lib/utils";
import type { OnboardingStatus } from "@/features/booking/booking-repository";

/** The three admin-settable statuses (info_pending is client-driven, not settable). */
const SETTABLE = [
  { value: "meet_greet_pending", label: "Pending", dot: "bg-status-pending" },
  { value: "approved", label: "Approved", dot: "bg-status-available" },
  { value: "declined", label: "Declined", dot: "bg-destructive" },
] as const;

function dotFor(status: OnboardingStatus): string {
  return SETTABLE.find((s) => s.value === status)?.dot ?? "bg-muted-foreground";
}

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
          "text-muted-foreground inline-flex items-center gap-2 text-sm",
          className,
        )}
      >
        <span
          className="bg-muted-foreground size-2 rounded-full"
          aria-hidden="true"
        />
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

  return (
    <>
      {dialog}
      <Select value={status} onValueChange={onChange} disabled={isPending}>
        <SelectTrigger
          className={cn("w-44", className)}
          aria-label="Onboarding status"
        >
          <span className="flex items-center gap-2">
            <span
              className={cn("size-2 rounded-full", dotFor(status))}
              aria-hidden="true"
            />
            {onboardingStatusLabel(status)}
          </span>
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
