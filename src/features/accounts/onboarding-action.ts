"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { profileSchema } from "./profile-schema";
import { emergencySchema } from "@/features/accounts/emergency-schema";
import {
  parseOnboardingForm,
  type OnboardingInput,
  type OnboardingFormState,
} from "./onboarding-form";
import { type SupabaseClient } from "@supabase/supabase-js";
import { defaultGeocoder } from "@/features/pricing/geocoding/zip-centroid-geocoder";
import { type Geocoder } from "@/features/pricing/geocoding/geocoder";
import { safeReturnTo } from "@/features/booking/return-to";

export interface OnboardingDeps {
  /** Service-role client — bypasses RLS + column grants. Required for writing system columns. */
  serviceClient: SupabaseClient;
  /** The authenticated user's ID. Must be verified from a real session before calling. */
  userId: string;
  /** Geocoder used to resolve the client's ZIP to lat/lng at signup. Defaults to the bundled offline geocoder. */
  geocoder?: Geocoder;
}

/**
 * Core onboarding logic, extracted for testability (dependency injection).
 * Validates input, writes profile fields, inserts the emergency form_response,
 * and advances onboarding_status to 'meet_greet_pending' via the service role.
 *
 * Non-atomicity concern: these are three sequential DB writes. A failure mid-way
 * (after profile update but before form insert, or after form insert but before
 * the status advance) leaves a partial state. Mitigation: the guard checks
 * onboarding_status, so a user whose update succeeded but advance failed will be
 * re-presented the form. Phase 3+ can wrap these in a Postgres function/transaction.
 */
export async function runOnboarding(
  deps: OnboardingDeps,
  input: OnboardingInput,
): Promise<void> {
  const profile = profileSchema.parse(input.profile);
  const emergency = emergencySchema.parse(input.emergency);

  const { serviceClient, userId, geocoder = defaultGeocoder } = deps;

  // Geocode the client's ZIP once at signup. Returns null for unknown ZIPs —
  // a far or unrecognised ZIP must not block onboarding; the distance gate
  // handles refusals at booking time.
  const latLng = await geocoder.geocode(profile.zip);

  // 1. Update profile fields (service role bypasses the column-level grant on role/lat/lng/etc.)
  // .select() returns affected rows; a missing profile (handle_new_user trigger didn't fire,
  // or user predates the trigger migration) returns [] with no error — catch it here so
  // step 2's FK insert doesn't fail with a confusing constraint message.
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

  // 2. Insert emergency form response
  const { error: formError } = await serviceClient
    .from("form_responses")
    .insert({
      client_id: userId,
      form_key: "emergency",
      booking_id: null,
      data: emergency,
    });

  if (formError) {
    throw new Error(`Emergency form insert failed: ${formError.message}`);
  }

  // 3. Advance onboarding to the meet-and-greet stage — single writer (service
  // role only; RLS + column grant blocks client writes). This NO LONGER unlocks
  // booking; the client must now book + attend a meet-and-greet, then Cal approves.
  const { error: flagError } = await serviceClient
    .from("profiles")
    .update({ onboarding_status: "meet_greet_pending" })
    .eq("id", userId);

  if (flagError) {
    throw new Error(`onboarding_status advance failed: ${flagError.message}`);
  }
}

/**
 * Server action bound via useActionState. Authenticates, validates the form,
 * runs onboarding, then redirects on success. On validation failure it returns
 * field errors as state (NO throw), so the client never try/catches a redirect —
 * which is what surfaced the NEXT_REDIRECT error string in the old version.
 *
 * `returnTo` (deferred-auth round-trip) rides along as a hidden form field and is
 * validated against the open-redirect guard; on success the user lands back on
 * their booking selection, else /account.
 */
export async function completeOnboarding(
  _prevState: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const parsed = parseOnboardingForm(formData);
  if (!parsed.ok) {
    return { status: "error", fieldErrors: parsed.fieldErrors };
  }

  const serviceClient = createServiceClient();
  await runOnboarding(
    { serviceClient, userId: user.id, geocoder: defaultGeocoder },
    parsed.input,
  );

  const returnTo = formData.get("returnTo");
  redirect(
    safeReturnTo(typeof returnTo === "string" ? returnTo : undefined) ??
      "/account",
  );
}
