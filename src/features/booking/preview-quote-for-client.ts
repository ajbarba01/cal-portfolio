"use server";

/**
 * Admin read-only quote preview for create-on-behalf. Computes against the
 * TARGET client's profile (their distance, debt) under ADMIN_POLICY, so the
 * returned BookingQuotePreview carries warn-don't-block warnings. Admin twin of
 * previewQuote. Never persists.
 */
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createSupabaseBookingRepository } from "./booking-repository";
import { computeBookingQuoteCore } from "./booking-service";
import { ADMIN_POLICY } from "./mutation-policy";
import type { PreviewResult } from "./booking-service";

export type PreviewForClientResult = { kind: "forbidden" } | PreviewResult;

export async function previewQuoteForClient(input: {
  clientId: string;
  serviceSlug: string;
  startsAt: Date;
  endsAt: Date;
  quantities: Record<string, unknown>;
  petIds?: string[];
  recurringRule: {
    freq: "daily" | "weekly" | "monthly";
    interval: number;
    count?: number;
    until?: Date;
  } | null;
}): Promise<PreviewForClientResult> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { kind: "forbidden" };

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { kind: "forbidden" };

  const repo = createSupabaseBookingRepository(serviceClient);
  return computeBookingQuoteCore(
    { repo, now: new Date() },
    {
      userId: input.clientId,
      serviceSlug: input.serviceSlug,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      quantities: input.quantities,
      petIds: input.petIds,
      recurringRule: input.recurringRule,
    },
    ADMIN_POLICY,
  );
}
