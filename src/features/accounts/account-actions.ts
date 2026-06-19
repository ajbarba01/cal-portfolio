"use server";

/**
 * Server actions for client self-service account mutations.
 *
 * SECURITY: All mutations use the SESSION CLIENT (createClient()), NOT the service role.
 * RLS + column-level GRANTs on profiles are the guard — clients cannot escalate privileges.
 * Identity always comes from getUser() (session cookie), never from payload.
 *
 * Column grant on profiles.UPDATE allows ONLY: full_name, email, phone, avatar_url, address, zip.
 * role, lat, lng, kiche_allowed, onboarding_status are system-set and blocked at the DB level.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { FIELD_LIMITS } from "@/lib/field-limits";
import { profileSchema, type ProfileInput } from "./profile-schema";
import { formRegistry, type FormKey } from "@/features/accounts/form-registry";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Result union ────────────────────────────────────────────────────────────

export type ActionResult =
  | { kind: "success" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

// ─── Pet schema ──────────────────────────────────────────────────────────────

const petSchema = z.object({
  name: z.string().min(1, "Pet name is required").max(FIELD_LIMITS.name),
  species: z.enum(["dog", "cat"]).default("dog"),
  breed: z.string().max(FIELD_LIMITS.shortText).optional(),
  notes: z.string().max(FIELD_LIMITS.note).optional(),
  birthdate: z
    .string()
    .date()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type PetInput = z.infer<typeof petSchema>;

export interface Pet {
  id: string;
  name: string;
  species: "dog" | "cat";
  breed: string | null;
  notes: string | null;
  birthdate: string | null;
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
  .min(8, "Password must be at least 8 characters")
  .max(FIELD_LIMITS.password, "Password is too long");

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
 * Does NOT write role/lat/lng/kiche_allowed/onboarding_status — those are blocked by the grant.
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

const PET_COLUMNS = "id, name, species, breed, notes, birthdate, photo_url";

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
      birthdate: parsed.data.birthdate ?? null,
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
      birthdate: parsed.data.birthdate ?? null,
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
 * Core: submit a form response for a registered form_key, optionally pet-scoped.
 * Upserts on (client_id, form_key, pet_id): account-scoped forms use petId null
 * (one row per client); pet-scoped forms ('pet') carry a petId (one row per pet).
 * Validates payload via formRegistry[formKey].schema — unknown keys rejected. For
 * pet-scoped forms the petId is required and verified to belong to the caller
 * (RLS scopes the row to the client but not to a specific owned pet).
 */
export async function runSubmitForm(
  sessionClient: SupabaseClient,
  userId: string,
  formKey: FormKey,
  data: unknown,
  petId: string | null = null,
): Promise<ActionResult> {
  const entry = formRegistry[formKey];
  if (!entry) {
    return {
      kind: "validation_error",
      message: `Unknown form key: ${String(formKey)}`,
    };
  }

  // Scope/petId coherence.
  if (entry.scope === "pet" && !petId) {
    return {
      kind: "validation_error",
      message: `Form '${formKey}' is pet-scoped and requires a pet.`,
    };
  }
  if (entry.scope === "account" && petId) {
    return {
      kind: "validation_error",
      message: `Form '${formKey}' is account-scoped and cannot target a pet.`,
    };
  }

  const parsed = entry.schema.safeParse(data);
  if (!parsed.success) {
    return {
      kind: "validation_error",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  // For pet-scoped forms, confirm the pet belongs to the caller.
  if (petId) {
    const { data: pet, error: petError } = await sessionClient
      .from("pets")
      .select("id")
      .eq("id", petId)
      .eq("client_id", userId)
      .maybeSingle();
    if (petError) {
      return { kind: "error", message: petError.message };
    }
    if (!pet) {
      return { kind: "validation_error", message: "Pet not found." };
    }
  }

  // Find an existing row for this (client, form_key, pet) scope. pet_id null
  // needs `.is`, a concrete id needs `.eq`.
  let selectQuery = sessionClient
    .from("form_responses")
    .select("id")
    .eq("client_id", userId)
    .eq("form_key", formKey);
  selectQuery = petId
    ? selectQuery.eq("pet_id", petId)
    : selectQuery.is("pet_id", null);
  const { data: existing, error: selectError } =
    await selectQuery.maybeSingle();

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
      pet_id: petId,
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
  petId: string | null = null,
): Promise<ActionResult> {
  const sessionClient = await createClient();
  const userId = await requireUserId(sessionClient);
  return runSubmitForm(sessionClient, userId, formKey, data, petId);
}

// ─── Confirm up-to-date (freshness bump) ──────────────────────────────────────

/**
 * Core: bump submitted_at on an existing profile response without changing data.
 * Backs the booking gate's "Confirm up to date" action for a stale-but-accurate
 * profile. No-op-safe: if no row exists the caller should submit instead.
 */
export async function runConfirmForm(
  sessionClient: SupabaseClient,
  userId: string,
  formKey: FormKey,
  petId: string | null = null,
): Promise<ActionResult> {
  let query = sessionClient
    .from("form_responses")
    .update({ submitted_at: new Date().toISOString() })
    .eq("client_id", userId)
    .eq("form_key", formKey);
  query = petId ? query.eq("pet_id", petId) : query.is("pet_id", null);
  const { error } = await query;
  if (error) {
    return { kind: "error", message: error.message };
  }
  return { kind: "success" };
}

export async function confirmForm(
  formKey: FormKey,
  petId: string | null = null,
): Promise<ActionResult> {
  const sessionClient = await createClient();
  const userId = await requireUserId(sessionClient);
  return runConfirmForm(sessionClient, userId, formKey, petId);
}

// ─── Expense-authorization e-sign ─────────────────────────────────────────────

/**
 * Core: append a click-to-accept authorization (immutable audit row). The typed
 * legal name is validated; the kind/version come from the authorizations module.
 */
export async function runAcceptAuthorization(
  sessionClient: SupabaseClient,
  userId: string,
  input: { kind: string; version: string; acceptedName: string },
): Promise<ActionResult> {
  const name = input.acceptedName.trim();
  if (name.length < 1 || name.length > FIELD_LIMITS.name) {
    return { kind: "validation_error", message: "Type your legal name." };
  }

  const { error } = await sessionClient.from("authorizations").insert({
    client_id: userId,
    kind: input.kind,
    version: input.version,
    accepted_name: name,
  });
  if (error) {
    return { kind: "error", message: error.message };
  }
  return { kind: "success" };
}

export async function acceptAuthorization(input: {
  kind: string;
  version: string;
  acceptedName: string;
}): Promise<ActionResult> {
  const sessionClient = await createClient();
  const userId = await requireUserId(sessionClient);
  return runAcceptAuthorization(sessionClient, userId, input);
}
