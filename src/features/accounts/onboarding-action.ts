"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { profileSchema, type ProfileInput } from "./profile-schema";
import {
  emergencySchema,
  type EmergencyInput,
} from "@/features/forms/emergency-schema";
import { type SupabaseClient } from "@supabase/supabase-js";
import { defaultGeocoder } from "@/features/pricing/geocoding/zip-centroid-geocoder";
import { type Geocoder } from "@/features/pricing/geocoding/geocoder";

export interface OnboardingInput {
  profile: ProfileInput;
  emergency: EmergencyInput;
}

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
 * and flips onboarding_complete via the service role.
 *
 * Non-atomicity concern: these are three sequential DB writes. A failure mid-way
 * (after profile update but before form insert, or after form insert but before
 * onboarding_complete flip) leaves a partial state. Mitigation: the guard checks
 * onboarding_complete, so a user whose update succeeded but flip failed will be
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

  // 3. Flip onboarding_complete — single writer (service role only; RLS + column grant blocks client writes)
  const { error: flagError } = await serviceClient
    .from("profiles")
    .update({ onboarding_complete: true })
    .eq("id", userId);

  if (flagError) {
    throw new Error(`onboarding_complete flip failed: ${flagError.message}`);
  }
}

/**
 * Server action entry point. Authenticates the caller, then delegates to runOnboarding.
 * Input is expected as a plain object matching OnboardingInput (e.g. from a form).
 */
export async function completeOnboarding(
  input: OnboardingInput,
): Promise<void> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const serviceClient = createServiceClient();

  await runOnboarding(
    { serviceClient, userId: user.id, geocoder: defaultGeocoder },
    input,
  );

  redirect("/account");
}
