"use server";

/**
 * Server actions for client self-service account mutations.
 *
 * SECURITY: All mutations use the SESSION CLIENT (createClient()), NOT the service role.
 * RLS + column-level GRANTs on profiles are the guard — clients cannot escalate privileges.
 * Identity always comes from getUser() (session cookie), never from payload.
 *
 * Column grant on profiles.UPDATE allows ONLY: full_name, email, phone, avatar_url, address, zip.
 * role, lat, lng, kiche_allowed, onboarding_complete are system-set and blocked at the DB level.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { profileSchema, type ProfileInput } from "./profile-schema";
import { formRegistry, type FormKey } from "@/features/forms/registry";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Result union ────────────────────────────────────────────────────────────

export type ActionResult =
  | { kind: "success" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

// ─── Dog schema ──────────────────────────────────────────────────────────────

const dogSchema = z.object({
  name: z.string().min(1, "Dog name is required"),
  breed: z.string().optional(),
  notes: z.string().optional(),
});

export type DogInput = z.infer<typeof dogSchema>;

// ─── Password schema ──────────────────────────────────────────────────────────

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters");

// ─── Core helpers (DI-testable) ───────────────────────────────────────────────

/** Verify session and return the authenticated user's id, or redirect to /login. */
async function requireUserId(client: SupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

/**
 * Core: update profile fields via a session-scoped client (RLS + column grant enforced).
 * Does NOT write role/lat/lng/kiche_allowed/onboarding_complete — those are blocked by the grant.
 */
export async function runUpdateProfile(
  sessionClient: SupabaseClient,
  userId: string,
  input: ProfileInput,
): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      kind: "validation_error",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const { full_name, phone, address, zip } = parsed.data;

  const { error } = await sessionClient
    .from("profiles")
    .update({ full_name, phone, address, zip })
    .eq("id", userId);

  if (error) {
    return { kind: "error", message: error.message };
  }

  return { kind: "success" };
}

export async function updateProfile(
  input: ProfileInput,
): Promise<ActionResult> {
  const sessionClient = await createClient();
  const userId = await requireUserId(sessionClient);
  return runUpdateProfile(sessionClient, userId, input);
}

// ─── Password ─────────────────────────────────────────────────────────────────

export async function changePassword(
  newPassword: string,
): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) {
    return {
      kind: "validation_error",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const sessionClient = await createClient();
  // No requireUserId needed — updateUser already requires an authenticated session.
  const { error } = await sessionClient.auth.updateUser({
    password: parsed.data,
  });

  if (error) {
    return { kind: "error", message: error.message };
  }

  return { kind: "success" };
}

// ─── Dogs ─────────────────────────────────────────────────────────────────────

/**
 * Core: create dog via a session-scoped client.
 * client_id is always the authenticated user's id — never from payload.
 */
export async function runCreateDog(
  sessionClient: SupabaseClient,
  userId: string,
  input: DogInput,
): Promise<ActionResult> {
  const parsed = dogSchema.safeParse(input);
  if (!parsed.success) {
    return {
      kind: "validation_error",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const { error } = await sessionClient.from("dogs").insert({
    client_id: userId,
    name: parsed.data.name,
    breed: parsed.data.breed ?? null,
    notes: parsed.data.notes ?? null,
    // photo_url: not set — TODO: avatar upload via Supabase Storage (no bucket yet)
  });

  if (error) {
    return { kind: "error", message: error.message };
  }

  return { kind: "success" };
}

export async function createDog(input: DogInput): Promise<ActionResult> {
  const sessionClient = await createClient();
  const userId = await requireUserId(sessionClient);
  return runCreateDog(sessionClient, userId, input);
}

/**
 * Core: update dog — ownership enforced by RLS (client_id = auth.uid()).
 */
export async function runUpdateDog(
  sessionClient: SupabaseClient,
  userId: string,
  dogId: string,
  input: DogInput,
): Promise<ActionResult> {
  const parsed = dogSchema.safeParse(input);
  if (!parsed.success) {
    return {
      kind: "validation_error",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const { error } = await sessionClient
    .from("dogs")
    .update({
      name: parsed.data.name,
      breed: parsed.data.breed ?? null,
      notes: parsed.data.notes ?? null,
    })
    .eq("id", dogId)
    .eq("client_id", userId); // belt-and-suspenders alongside RLS

  if (error) {
    return { kind: "error", message: error.message };
  }

  return { kind: "success" };
}

export async function updateDog(
  dogId: string,
  input: DogInput,
): Promise<ActionResult> {
  const sessionClient = await createClient();
  const userId = await requireUserId(sessionClient);
  return runUpdateDog(sessionClient, userId, dogId, input);
}

/**
 * Core: delete dog — ownership enforced by RLS.
 */
export async function runDeleteDog(
  sessionClient: SupabaseClient,
  userId: string,
  dogId: string,
): Promise<ActionResult> {
  const { error } = await sessionClient
    .from("dogs")
    .delete()
    .eq("id", dogId)
    .eq("client_id", userId); // belt-and-suspenders alongside RLS

  if (error) {
    return { kind: "error", message: error.message };
  }

  return { kind: "success" };
}

export async function deleteDog(dogId: string): Promise<ActionResult> {
  const sessionClient = await createClient();
  const userId = await requireUserId(sessionClient);
  return runDeleteDog(sessionClient, userId, dogId);
}

// ─── Forms ────────────────────────────────────────────────────────────────────

/**
 * Core: submit a form response for a registered form_key.
 * Upserts: if the client already has a row for this form_key, updates it; else inserts.
 * Validates payload via formRegistry[formKey] — unknown keys are rejected.
 */
export async function runSubmitForm(
  sessionClient: SupabaseClient,
  userId: string,
  formKey: FormKey,
  data: unknown,
): Promise<ActionResult> {
  const schema = formRegistry[formKey];
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return {
      kind: "validation_error",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  // Check if a response already exists for this client + form_key.
  const { data: existing, error: selectError } = await sessionClient
    .from("form_responses")
    .select("id")
    .eq("client_id", userId)
    .eq("form_key", formKey)
    .maybeSingle();

  if (selectError) {
    return { kind: "error", message: selectError.message };
  }

  if (existing) {
    // Update existing row.
    const { error } = await sessionClient
      .from("form_responses")
      .update({ data: parsed.data, submitted_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("client_id", userId);

    if (error) {
      return { kind: "error", message: error.message };
    }
  } else {
    // Insert new row.
    const { error } = await sessionClient.from("form_responses").insert({
      client_id: userId,
      form_key: formKey,
      booking_id: null,
      data: parsed.data,
    });

    if (error) {
      return { kind: "error", message: error.message };
    }
  }

  return { kind: "success" };
}

export async function submitForm(
  formKey: FormKey,
  data: unknown,
): Promise<ActionResult> {
  const sessionClient = await createClient();
  const userId = await requireUserId(sessionClient);
  return runSubmitForm(sessionClient, userId, formKey, data);
}
