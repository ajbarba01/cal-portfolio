"use server";

/**
 * Admin on-behalf server actions for pets and form responses.
 *
 * SECURITY CONTRACT — enforced in every exported core:
 *  1. assertActorIsAdmin fires BEFORE any read or write. If the actor is not
 *     admin the function returns { kind: "forbidden" } immediately.
 *  2. All writes are pinned to the passed `clientId` argument — never to
 *     auth.uid() or the actor's id. The service client bypasses RLS, which is
 *     intentional and safe only because the admin check already ran.
 *  3. The service-role client (RLS bypassed) is used ONLY after the admin
 *     check passes. Never expose the service client to non-admin callers.
 *
 * Pattern mirrors clients-actions.ts: `*Core(deps, ...)` is DI-testable;
 * the thin `"use server"` wrapper calls getActorOrRedirect + createServiceClient.
 */

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "@/lib/admin-guard";
import { getActorOrRedirect } from "@/lib/admin-session";
import { formRegistry, type FormKey } from "@/features/accounts";
import type { AdminDeps } from "./clients-actions";
import type { PetInput, Pet } from "@/features/accounts";

// Re-import the pet schema for validation — we share PetInput but re-validate
// here rather than exposing account-actions internals.
import { z } from "zod";
import { FIELD_LIMITS } from "@/lib/field-limits";
import { PET_COLUMNS, speciesEnum } from "@/features/pets";

/**
 * Shown when input fails validation. The offending issues are logged: Cal never
 * needs a zod issue list, and the raw text leaks schema internals to the page.
 */
const INVALID_INPUT_MESSAGE = "Please check your entries and try again.";

// ─── Result types (extend account-actions results with forbidden) ─────────────

/** Result of adminCreatePet — includes forbidden for non-admin callers. */
export type AdminCreatePetResult =
  | { kind: "success"; pet: Pet }
  | { kind: "forbidden" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

/** Result of admin mutation actions — includes forbidden for non-admin callers. */
export type AdminActionResult =
  | { kind: "success" }
  | { kind: "forbidden" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

const petSchema = z.object({
  name: z.string().min(1, "Pet name is required").max(FIELD_LIMITS.name),
  species: speciesEnum.default("dog"),
  breed: z.string().max(FIELD_LIMITS.shortText).optional(),
  notes: z.string().max(FIELD_LIMITS.note).optional(),
  birthdate: z
    .string()
    .date()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

// ─── adminCreatePet ───────────────────────────────────────────────────────────

/**
 * Core: admin creates a pet on behalf of a target client.
 *
 * SECURITY: admin check first; client_id in insert = clientId arg (never actor).
 */
export async function adminCreatePetCore(
  deps: AdminDeps,
  clientId: string,
  input: PetInput,
): Promise<AdminCreatePetResult> {
  // SECURITY: admin check precedes every write.
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }

  const parsed = petSchema.safeParse(input);
  if (!parsed.success) {
    console.error(
      "adminCreatePetCore: input validation failed",
      parsed.error.issues,
    );
    return { kind: "validation_error", message: INVALID_INPUT_MESSAGE };
  }

  const { data, error } = await deps.serviceClient
    .from("pets")
    .insert({
      // SECURITY: pinned to the target clientId, NOT the actor's id.
      client_id: clientId,
      name: parsed.data.name,
      species: parsed.data.species,
      breed: parsed.data.breed ?? null,
      notes: parsed.data.notes ?? null,
      birthdate: parsed.data.birthdate ?? null,
    })
    .select(PET_COLUMNS)
    .single();

  if (error || !data) {
    console.error("adminCreatePetCore: insert failed", error);
    return {
      kind: "error",
      message: "Couldn't save the pet. Please try again.",
    };
  }

  return { kind: "success", pet: data };
}

export async function adminCreatePet(
  clientId: string,
  input: PetInput,
): Promise<AdminCreatePetResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const result = await adminCreatePetCore(
    { serviceClient, actorUserId },
    clientId,
    input,
  );
  if (result.kind === "success") revalidatePath(`/admin/clients/${clientId}`);
  return result;
}

// ─── adminUpdatePet ───────────────────────────────────────────────────────────

/**
 * Core: admin updates a pet on behalf of a target client.
 *
 * SECURITY: admin check first; update scoped to both petId AND clientId
 * (belt-and-suspenders — prevents an admin from mis-editing a pet on the
 * wrong client if the clientId arg is somehow wrong).
 */
export async function adminUpdatePetCore(
  deps: AdminDeps,
  clientId: string,
  petId: string,
  input: PetInput,
): Promise<AdminActionResult> {
  // SECURITY: admin check precedes every write.
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }

  const parsed = petSchema.safeParse(input);
  if (!parsed.success) {
    console.error(
      "adminUpdatePetCore: input validation failed",
      parsed.error.issues,
    );
    return { kind: "validation_error", message: INVALID_INPUT_MESSAGE };
  }

  const { error } = await deps.serviceClient
    .from("pets")
    .update({
      name: parsed.data.name,
      species: parsed.data.species,
      breed: parsed.data.breed ?? null,
      notes: parsed.data.notes ?? null,
      birthdate: parsed.data.birthdate ?? null,
    })
    // SECURITY: scoped to petId AND clientId — belt-and-suspenders so an admin
    // cannot update a pet belonging to a different client.
    .eq("id", petId)
    .eq("client_id", clientId);

  if (error) {
    console.error("adminUpdatePetCore: update failed", error);
    return {
      kind: "error",
      message: "Couldn't save the pet. Please try again.",
    };
  }

  return { kind: "success" };
}

export async function adminUpdatePet(
  clientId: string,
  petId: string,
  input: PetInput,
): Promise<AdminActionResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const result = await adminUpdatePetCore(
    { serviceClient, actorUserId },
    clientId,
    petId,
    input,
  );
  if (result.kind === "success") revalidatePath(`/admin/clients/${clientId}`);
  return result;
}

// ─── adminSubmitForm ──────────────────────────────────────────────────────────

/**
 * Core: admin upserts a form response on behalf of a target client.
 *
 * SECURITY: admin check first; client_id in upsert = clientId arg (never actor).
 * Mirrors runSubmitForm exactly — select-then-insert-or-update pattern,
 * submitted_at set on update.
 */
export async function adminSubmitFormCore(
  deps: AdminDeps,
  clientId: string,
  formKey: FormKey,
  data: unknown,
  petId: string | null = null,
): Promise<AdminActionResult> {
  // SECURITY: admin check precedes every write.
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }

  const entry = formRegistry[formKey];
  if (!entry) {
    console.error("adminSubmitFormCore: unknown form key", formKey);
    return { kind: "validation_error", message: INVALID_INPUT_MESSAGE };
  }

  // Scope/petId coherence (mirrors runSubmitForm).
  if (entry.scope === "pet" && !petId) {
    console.error(
      "adminSubmitFormCore: pet-scoped form without a pet",
      formKey,
    );
    return { kind: "validation_error", message: INVALID_INPUT_MESSAGE };
  }
  if (entry.scope === "account" && petId) {
    console.error(
      "adminSubmitFormCore: account-scoped form targeting a pet",
      formKey,
    );
    return { kind: "validation_error", message: INVALID_INPUT_MESSAGE };
  }

  const parsed = entry.schema.safeParse(data);
  if (!parsed.success) {
    console.error(
      "adminSubmitFormCore: input validation failed",
      parsed.error.issues,
    );
    return { kind: "validation_error", message: INVALID_INPUT_MESSAGE };
  }

  // For pet-scoped forms, confirm the pet belongs to the TARGET client.
  if (petId) {
    const { data: pet, error: petError } = await deps.serviceClient
      .from("pets")
      .select("id")
      .eq("id", petId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (petError) {
      console.error("adminSubmitFormCore: pet lookup failed", petError);
      return {
        kind: "error",
        message: "Couldn't save the form. Please try again.",
      };
    }
    if (!pet) {
      return { kind: "validation_error", message: "Pet not found." };
    }
  }

  // Existing row for this (client, form_key, pet) scope. pet_id null → `.is`.
  let selectQuery = deps.serviceClient
    .from("form_responses")
    .select("id")
    .eq("client_id", clientId)
    .eq("form_key", formKey);
  selectQuery = petId
    ? selectQuery.eq("pet_id", petId)
    : selectQuery.is("pet_id", null);
  const { data: existing, error: selectError } =
    await selectQuery.maybeSingle();

  if (selectError) {
    console.error("adminSubmitFormCore: select failed", selectError);
    return {
      kind: "error",
      message: "Couldn't save the form. Please try again.",
    };
  }

  if (existing) {
    // Update existing row, matching runSubmitForm (includes submitted_at).
    const { error } = await deps.serviceClient
      .from("form_responses")
      .update({ data: parsed.data, submitted_at: new Date().toISOString() })
      .eq("id", existing.id)
      // SECURITY: pinned to target clientId.
      .eq("client_id", clientId);

    if (error) {
      console.error("adminSubmitFormCore: write failed", error);
      return {
        kind: "error",
        message: "Couldn't save the form. Please try again.",
      };
    }
  } else {
    // Insert new row.
    const { error } = await deps.serviceClient.from("form_responses").insert({
      // SECURITY: pinned to the target clientId, NOT the actor's id.
      client_id: clientId,
      form_key: formKey,
      pet_id: petId,
      booking_id: null,
      data: parsed.data,
    });

    if (error) {
      console.error("adminSubmitFormCore: write failed", error);
      return {
        kind: "error",
        message: "Couldn't save the form. Please try again.",
      };
    }
  }

  return { kind: "success" };
}

export async function adminSubmitForm(
  clientId: string,
  formKey: FormKey,
  data: unknown,
  petId: string | null = null,
): Promise<AdminActionResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const result = await adminSubmitFormCore(
    { serviceClient, actorUserId },
    clientId,
    formKey,
    data,
    petId,
  );
  if (result.kind === "success") revalidatePath(`/admin/clients/${clientId}`);
  return result;
}

// ─── adminUploadPetPhoto ──────────────────────────────────────────────────────

/**
 * Core: admin uploads a pet photo on behalf of a target client.
 *
 * SECURITY: admin check first; storage path uses clientId (not actor);
 * DB update scoped to petId AND clientId.
 *
 * Storage path: `{clientId}/{petId}/photo.{ext}` — mirrors uploadPetPhoto but
 * uses the target client's id so the photo lands in the correct storage prefix.
 */
export async function adminUploadPetPhotoCore(
  deps: AdminDeps,
  clientId: string,
  petId: string,
  file: File,
): Promise<AdminActionResult> {
  // SECURITY: admin check precedes every write.
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }

  if (file.size === 0) {
    return {
      kind: "validation_error",
      message: "A non-empty image file is required.",
    };
  }

  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
  // SECURITY: path prefixed with target clientId (never actor's id).
  const path = `${clientId}/${petId}/photo.${ext}`;

  const { error: uploadError } = await deps.serviceClient.storage
    .from("pet-photos")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    console.error("adminUploadPetPhotoCore: upload failed", uploadError);
    return {
      kind: "error",
      message: "Couldn't upload the photo. Please try again.",
    };
  }

  const { error: updateError } = await deps.serviceClient
    .from("pets")
    .update({ photo_url: path })
    .eq("id", petId)
    // SECURITY: belt-and-suspenders — scoped to target clientId.
    .eq("client_id", clientId);

  if (updateError) {
    console.error(
      "adminUploadPetPhotoCore: photo url update failed",
      updateError,
    );
    return {
      kind: "error",
      message: "Couldn't upload the photo. Please try again.",
    };
  }

  return { kind: "success" };
}

/**
 * "use server" wrapper: admin uploads a pet photo on behalf of a target client.
 * Accepts a File (not FormData) so the admin UI can pass the cropped blob directly.
 */
export async function adminUploadPetPhoto(
  clientId: string,
  petId: string,
  file: File,
): Promise<AdminActionResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const result = await adminUploadPetPhotoCore(
    { serviceClient, actorUserId },
    clientId,
    petId,
    file,
  );
  if (result.kind === "success") revalidatePath(`/admin/clients/${clientId}`);
  return result;
}
