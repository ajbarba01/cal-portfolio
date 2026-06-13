"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const FALLBACK_REFRESH_MS = 60_000;

/**
 * Watches the signed-in user's profile for approval while they wait on the
 * onboarding booked-state card. Subscribes to a `postgres_changes` UPDATE on
 * `profiles` filtered to this user; on any update it `router.refresh()` so the
 * onboarding page re-runs its `approved → /account` redirect (~instant once Cal
 * approves). The `profiles` self-read RLS policy makes the row visible, and the
 * table is added to the `supabase_realtime` publication by the Task 8 migration.
 * A 60s interval is the fallback if realtime delivery is unavailable. The
 * `router.refresh` calls happen in callbacks (not synchronously in the effect),
 * so the repo's set-state-in-effect ban is unaffected. Cleans up on unmount.
 */
export function ApprovalWatcher({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("onboarding-approval")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    const interval = setInterval(() => router.refresh(), FALLBACK_REFRESH_MS);

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [router, userId]);
  return null;
}
