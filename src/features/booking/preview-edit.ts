"use server";

/**
 * Read-only booking-edit preview. Same auth + actor→policy derivation as
 * editBooking; delegates to previewEditCore (no persist). The UI uses this for
 * the live re-quote + would-be outcome (price_locked / approval drop / gate).
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createSupabaseBookingRepository } from "./booking-repository";
import { previewEditCore } from "./booking-service";
import { CLIENT_POLICY, ADMIN_POLICY } from "./mutation-policy";
import type { EditBookingPatch, PreviewEditResult } from "./booking-service";

export async function previewEdit(input: {
  bookingId: string;
  patch: EditBookingPatch;
}): Promise<PreviewEditResult> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) redirect("/login");

  const serviceClient = createServiceClient();
  const repo = createSupabaseBookingRepository(serviceClient);
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const policy = profile?.role === "admin" ? ADMIN_POLICY : CLIENT_POLICY;

  return previewEditCore(
    { repo, now: new Date() },
    {
      bookingId: input.bookingId,
      actorUserId: user.id,
      policy,
      patch: input.patch,
    },
  );
}
