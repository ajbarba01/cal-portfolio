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

// ─── Pet schema ──────────────────────────────────────────────────────────────

const petSchema = z.object({
  name: z.string().min(1, "Pet name is required"),
  species: z.enum(["dog", "cat"]).default("dog"),
  breed: z.string().optional(),
  notes: z.string().optional(),
});

export type PetInput = z.infer<typeof petSchema>;

export interface Pet {
  id: string;
  name: string;
  species: "dog" | "cat";
  breed: string | null;
  notes: string | null;
  photo_url: string | null;
}

/** create returns the inserted row so callers get the server-assigned id. */
export type CreatePetResult =
  | { kind: "success"; pet: Pet }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

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

// ─── Pets ─────────────────────────────────────────────────────────────────────

const PET_COLUMNS = "id, name, species, breed, notes, photo_url";

/**
 * Core: create pet via a session-scoped client. Returns the inserted row so the
 * caller has the server-assigned id (used to attach a photo or auto-select it
 * in the booking flow). client_id is always the authenticated user — never from
 * payload.
 */
export async function runCreatePet(
  sessionClient: SupabaseClient,
  userId: string,
  input: PetInput,
): Promise<CreatePetResult> {
  const parsed = petSchema.safeParse(input);
  if (!parsed.success) {
    return {
      kind: "validation_error",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const { data, error } = await sessionClient
    .from("pets")
    .insert({
      client_id: userId,
      name: parsed.data.name,
      species: parsed.data.species,
      breed: parsed.data.breed ?? null,
      notes: parsed.data.notes ?? null,
    })
    .select(PET_COLUMNS)
    .single();

  if (error || !data) {
    return { kind: "error", message: error?.message ?? "Insert failed." };
  }

  return { kind: "success", pet: data as Pet };
}

export async function createPet(input: PetInput): Promise<CreatePetResult> {
  const sessionClient = await createClient();
  const userId = await requireUserId(sessionClient);
  return runCreatePet(sessionClient, userId, input);
}

/**
 * Core: update pet — ownership enforced by RLS (client_id = auth.uid()).
 */
export async function runUpdatePet(
  sessionClient: SupabaseClient,
  userId: string,
  petId: string,
  input: PetInput,
): Promise<ActionResult> {
  const parsed = petSchema.safeParse(input);
  if (!parsed.success) {
    return {
      kind: "validation_error",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const { error } = await sessionClient
    .from("pets")
    .update({
      name: parsed.data.name,
      species: parsed.data.species,
      breed: parsed.data.breed ?? null,
      notes: parsed.data.notes ?? null,
    })
    .eq("id", petId)
    .eq("client_id", userId); // belt-and-suspenders alongside RLS

  if (error) {
    return { kind: "error", message: error.message };
  }

  return { kind: "success" };
}

export async function updatePet(
  petId: string,
  input: PetInput,
): Promise<ActionResult> {
  const sessionClient = await createClient();
  const userId = await requireUserId(sessionClient);
  return runUpdatePet(sessionClient, userId, petId, input);
}

/**
 * Core: delete pet — ownership enforced by RLS.
 */
export async function runDeletePet(
  sessionClient: SupabaseClient,
  userId: string,
  petId: string,
): Promise<ActionResult> {
  const { error } = await sessionClient
    .from("pets")
    .delete()
    .eq("id", petId)
    .eq("client_id", userId); // belt-and-suspenders alongside RLS

  if (error) {
    return { kind: "error", message: error.message };
  }

  return { kind: "success" };
}

export async function deletePet(petId: string): Promise<ActionResult> {
  const sessionClient = await createClient();
  const userId = await requireUserId(sessionClient);
  return runDeletePet(sessionClient, userId, petId);
}

/**
 * Upload a pet photo to the private `pet-photos` bucket and record its object
 * path on the pet. The session client + storage RLS enforce that the upload
 * path is owned by the caller ({client_id}/...). Stores the PATH (not a URL);
 * reads are served via short-lived signed URLs generated server-side.
 */
export async function uploadPetPhoto(
  formData: FormData,
): Promise<ActionResult> {
  const sessionClient = await createClient();
  const userId = await requireUserId(sessionClient);

  const petId = formData.get("petId");
  const file = formData.get("file");
  if (typeof petId !== "string" || !(file instanceof File) || file.size === 0) {
    return {
      kind: "validation_error",
      message: "A pet and image are required.",
    };
  }

  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
  const path = `${userId}/${petId}/photo.${ext}`;

  const { error: uploadError } = await sessionClient.storage
    .from("pet-photos")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) {
    return { kind: "error", message: uploadError.message };
  }

  const { error: updateError } = await sessionClient
    .from("pets")
    .update({ photo_url: path })
    .eq("id", petId)
    .eq("client_id", userId);
  if (updateError) {
    return { kind: "error", message: updateError.message };
  }

  return { kind: "success" };
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
