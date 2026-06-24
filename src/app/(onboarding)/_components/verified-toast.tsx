"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/feedback/toast";

/**
 * Fires a one-time "email verified" toast when the auth callback lands the user
 * on onboarding with `?verified=1`, then strips the param so a refresh or back
 * navigation won't re-fire it. Returns nothing — purely a side-effect mount.
 *
 * Must be wrapped in <Suspense> by the caller: useSearchParams() opts the tree
 * into client rendering and Next requires a boundary around it.
 */
export function VerifiedToast() {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || params.get("verified") !== "1") return;
    fired.current = true;

    toast.add({
      type: "success",
      title: "Email verified",
      description: "Welcome — let's finish setting up your account.",
    });

    // Drop the param without a new history entry so it can't replay.
    const next = new URLSearchParams(params);
    next.delete("verified");
    const qs = next.toString();
    router.replace(qs ? `/onboarding?${qs}` : "/onboarding");
  }, [params, router, toast]);

  return null;
}
