"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { profileSchema, type ProfileInput } from "./profile-schema";
import {
  onboardingSuccessPath,
  onboardingClientSchema,
} from "./onboarding-form";
import { type DbClient } from "@/lib/supabase/db-client";
import { defaultGeocoder } from "@/features/pricing";
import { type Geocoder } from "@/features/pricing";
import { safeReturnTo } from "@/lib/return-to";
import {
  type FormActionResult,
  zodFieldErrors,
} from "@/lib/form-action-result";
import {
  checkZipServiceArea,
  OUTSIDE_SERVICE_AREA_MESSAGE,
} from "./service-area";

export interface OnboardingDeps {
  /** Service-role client — bypasses RLS + column grants. Required for writing system columns. */
  serviceClient: DbClient;
  /** The authenticated user's ID. Must be verified from a real session before calling. */
  userId: string;
  /** Geocoder used to resolve the client's ZIP to lat/lng at signup. Defaults to the bundled offline geocoder. */
  geocoder?: Geocoder;
}

/**
 * Core onboarding logic, extracted for testability (dependency injection).
 * Validates input, gates the ZIP on the service area, writes profile fields,
 * and advances onboarding_status to 'meet_greet_pending' via the service role.
 *
 * Returns a failure instead of throwing when the address is out of area: that
 * is the client's mistake to correct, not a fault, and the wizard shows it at
 * the ZIP field. Every other failure still throws.
 *
 * Non-atomicity concern: these are two sequential DB writes. A failure between
 * them leaves a partial state. Mitigation: the guard checks onboarding_status,
 * so a user whose update succeeded but advance failed is re-presented the form.
 * Both writes are idempotent, so that retry is safe.
 */
export async function runOnboarding(
  deps: OnboardingDeps,
  input: ProfileInput,
): Promise<FormActionResult> {
  const profile = profileSchema.parse(input);

  const { serviceClient, userId, geocoder = defaultGeocoder } = deps;

  // Geocode the client's ZIP once at signup — the gate and the profile write
  // below both read the result, so signup never geocodes twice. An address
  // outside the area is refused here, before any of it is stored.
  const { isInArea, latLng } = await checkZipServiceArea(
    { client: serviceClient, geocoder },
    profile.zip,
  );
  if (!isInArea) {
    return { ok: false, fieldErrors: { zip: OUTSIDE_SERVICE_AREA_MESSAGE } };
  }

  // 1. Update profile fields (service role bypasses the column-level grant on role/lat/lng/etc.)
  // .select() returns affected rows; a missing profile (handle_new_user trigger didn't fire,
  // or user predates the trigger migration) returns [] with no error — catch it here so the
  // status advance doesn't silently no-op against a row that was never created.
  const { data: updated, error: profileError } = await serviceClient
    .from("profiles")
    .update({
      full_name: profile.full_name,
      phone: profile.phone,
      address: profile.address,
      zip: profile.zip,
      lat: latLng?.lat ?? null,
      lng: latLng?.lng ?? null,
    })
    .eq("id", userId)
    .select("id");

  if (profileError) {
    throw new Error(`Profile update failed: ${profileError.message}`);
  }

  if (!updated || updated.length === 0) {
    throw new Error(
      `No profile row for user ${userId}. The handle_new_user trigger may not have fired — backfill the profile row before retrying.`,
    );
  }

  // 2. Advance onboarding to the meet-and-greet stage — single writer (service
  // role only; RLS + column grant blocks client writes). This NO LONGER unlocks
  // booking; the client must now book + attend a meet-and-greet, then Cal approves.
  const { error: flagError } = await serviceClient
    .from("profiles")
    .update({ onboarding_status: "meet_greet_pending" })
    .eq("id", userId);

  if (flagError) {
    throw new Error(`onboarding_status advance failed: ${flagError.message}`);
  }

  return { ok: true };
}

/**
 * Server action bound via RHF's submitAction bridge. Authenticates, re-parses
 * the same client schema, runs onboarding, then redirects on success. On
 * validation failure it returns field errors as a FormActionResult (NO throw),
 * so the client never try/catches a redirect — which is what surfaced the
 * NEXT_REDIRECT error string in the old version.
 *
 * `returnTo` (deferred-auth round-trip) rides along as a plain argument and is
 * validated against the open-redirect guard; on success it is re-attached to the
 * /onboarding URL (see onboardingSuccessPath for why the redirect never targets
 * /account or the returnTo destination directly).
 */
export async function submitOnboarding(
  input: unknown,
  returnTo?: string,
): Promise<FormActionResult> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const parsed = onboardingClientSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  }

  const serviceClient = createServiceClient();
  const result = await runOnboarding(
    { serviceClient, userId: user.id, geocoder: defaultGeocoder },
    parsed.data,
  );
  if (!result.ok) return result;

  // Purge the cached /onboarding payload (it still holds the info form) so the
  // redirect renders the wizard fresh at its new meet_greet_pending state.
  revalidatePath("/onboarding");
  redirect(onboardingSuccessPath(safeReturnTo(returnTo)));
}
