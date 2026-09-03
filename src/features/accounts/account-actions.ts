"use server";

/**
 * Server actions for client self-service account mutations.
 *
 * SECURITY: everything the client owns is written with the SESSION CLIENT
 * (createClient()), NOT the service role. RLS + column-level GRANTs on profiles
 * are the guard — clients cannot escalate privileges. Identity always comes from
 * getUser() (session cookie), never from payload.
 *
 * Column grant on profiles.UPDATE allows ONLY: full_name, email, phone, avatar_url, address, zip.
 * role, lat, lng, kiche_allowed, onboarding_status are system-set and blocked at the DB level.
 *
 * Two writes here are derived system state and therefore use the service role,
 * each on a value the server computed rather than one the payload supplied:
 * `profiles.lat/lng` (geocoded from the saved ZIP) and `pets.photo_url` (the
 * storage path this action just wrote to).
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import { z } from "zod";
import { FIELD_LIMITS } from "@/lib/field-limits";
import { profileSchema, type ProfileInput } from "./profile-schema";
import { formRegistry, type FormKey } from "@/features/accounts/form-registry";
import type { DbClient } from "@/lib/supabase/db-client";
import { speciesEnum, PET_COLUMNS, type PetRow } from "@/features/pets";
import { defaultGeocoder, type Geocoder } from "@/features/pricing";
import {
  authorizationCurrent,
  EXPENSE_AUTH_KIND,
  EXPENSE_AUTH_VERSION,
} from "./authorizations";
import {
  checkZipServiceArea,
  OUTSIDE_SERVICE_AREA_MESSAGE,
  type ServiceAreaCheck,
} from "./service-area";

/**
 * Shown whenever a database, storage or auth call fails. Raw driver messages
 * name schema objects and constraints, so they are logged and never returned.
 */
const GENERIC_ERROR = "Something went wrong. Please try again.";

// ─── Result union ────────────────────────────────────────────────────────────

export type ActionResult =
  | { kind: "success" }
  | {
      kind: "validation_error";
      message: string;
      /** Keyed by form field, so the caller can show the error where it belongs. */
      fieldErrors?: Record<string, string>;
    }
  | { kind: "error"; message: string };

// ─── Pet schema ──────────────────────────────────────────────────────────────

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

export type PetInput = z.infer<typeof petSchema>;

/** A pet row as read by these actions — the shape {@link PET_COLUMNS} selects. */
export type Pet = PetRow;

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
async function requireUserId(client: DbClient): Promise<string> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface UpdateProfileDeps {
  /** Session-scoped client — RLS + the column grant confine it to the caller's own fields. */
  sessionClient: DbClient;
  /** Service-role client — `lat`/`lng` sit outside the column grant. */
  serviceClient: DbClient;
  /** The authenticated user's id. Must be verified from a real session before calling. */
  userId: string;
  /** Resolves the saved ZIP to coordinates. Defaults to the bundled offline geocoder. */
  geocoder?: Geocoder;
}

/**
 * Store the coordinates the service-area gate resolved for the saved ZIP.
 *
 * Written only when the ZIP moved, because that is the only thing that can
 * change the answer: the geocoder is a static bundled map, so re-running it on
 * an unchanged ZIP returns what is already on file. Nulls left behind by a ZIP
 * the map does not cover are repaired the same way — the client saves a ZIP it
 * does cover. Swapping in a wider dataset repairs nothing by itself; that is a
 * backfill, not something a profile save should carry.
 *
 * A write failure leaves the stored coordinates alone and is logged — the
 * address itself has already been saved, so failing the whole action would
 * misreport what happened.
 */
async function saveCoordinates(
  serviceClient: DbClient,
  userId: string,
  latLng: ServiceAreaCheck["latLng"],
): Promise<void> {
  const { error } = await serviceClient
    .from("profiles")
    .update({ lat: latLng?.lat ?? null, lng: latLng?.lng ?? null })
    .eq("id", userId);
  if (error) {
    console.error("updateProfile: saving the coordinates failed", error);
  }
}

/**
 * Core: gate a changed ZIP on the service area, then update profile fields via
 * a session-scoped client (RLS + column grant enforced) and refresh the derived
 * coordinates via the service role. A move outside the area is refused before
 * anything is written, so the profile keeps the address Cal can serve.
 * Does NOT write role/kiche_allowed/onboarding_status — those are blocked by the grant.
 */
export async function runUpdateProfile(
  deps: UpdateProfileDeps,
  input: ProfileInput,
): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      kind: "validation_error",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const {
    sessionClient,
    serviceClient,
    userId,
    geocoder = defaultGeocoder,
  } = deps;
  const { full_name, phone, address, zip } = parsed.data;

  // The gate judges a move, not the profile as it stands. Cal can create a
  // client outside the area himself — that path warns rather than refuses — and
  // nothing in the admin UI writes profiles.zip, so gating an unchanged ZIP
  // would leave that client unable to fix their own name or phone, forever.
  const { data: stored, error: readError } = await sessionClient
    .from("profiles")
    .select("zip")
    .eq("id", userId)
    .single();

  // Without the ZIP on file there is nothing to compare against, and the row
  // the update targets is the row that just failed to read.
  if (readError || !stored) {
    console.error("updateProfile: reading the stored ZIP failed", readError);
    return { kind: "error", message: GENERIC_ERROR };
  }

  // One geocode serves both the gate and the coordinate write below, so the
  // stored location is always the one the address was judged on. A geocoder
  // failure is logged and the save proceeds: the address is still valid, and
  // an offline lookup is no reason to refuse it.
  let area: ServiceAreaCheck | null = null;
  if (zip !== stored.zip) {
    try {
      area = await checkZipServiceArea(
        { client: sessionClient, geocoder },
        zip,
      );
    } catch (geocodeError) {
      console.error(
        "updateProfile: checking the service area failed",
        geocodeError,
      );
    }

    if (area && !area.isInArea) {
      return {
        kind: "validation_error",
        message: OUTSIDE_SERVICE_AREA_MESSAGE,
        fieldErrors: { zip: OUTSIDE_SERVICE_AREA_MESSAGE },
      };
    }
  }

  const { error } = await sessionClient
    .from("profiles")
    .update({ full_name, phone, address, zip })
    .eq("id", userId);

  if (error) {
    console.error("updateProfile: saving the profile failed", error);
    return { kind: "error", message: GENERIC_ERROR };
  }

  // Skipped when the gate never ran — an unchanged ZIP or a broken geocoder.
  // Either way the coordinates on file already match the ZIP being saved.
  if (area) await saveCoordinates(serviceClient, userId, area.latLng);

  return { kind: "success" };
}

export async function updateProfile(
  input: ProfileInput,
): Promise<ActionResult> {
  const sessionClient = await createClient();
  const userId = await requireUserId(sessionClient);
  return runUpdateProfile(
    { sessionClient, serviceClient: createServiceClient(), userId },
    input,
  );
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
    console.error("changePassword: updating the password failed", error);
    return { kind: "error", message: GENERIC_ERROR };
  }

  return { kind: "success" };
}

// ─── Pets ─────────────────────────────────────────────────────────────────────

/**
 * Core: create pet via a session-scoped client. Returns the inserted row so the
 * caller has the server-assigned id (used to attach a photo or auto-select it
 * in the booking flow). client_id is always the authenticated user — never from
 * payload.
 */
export async function runCreatePet(
  sessionClient: DbClient,
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
    console.error("createPet: inserting the pet failed", error);
    return { kind: "error", message: GENERIC_ERROR };
  }

  return { kind: "success", pet: data };
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
  sessionClient: DbClient,
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
    console.error("updatePet: saving the pet failed", error);
    return { kind: "error", message: GENERIC_ERROR };
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
  sessionClient: DbClient,
  userId: string,
  petId: string,
): Promise<ActionResult> {
  const { error } = await sessionClient
    .from("pets")
    .delete()
    .eq("id", petId)
    .eq("client_id", userId); // belt-and-suspenders alongside RLS

  if (error) {
    console.error("deletePet: deleting the pet failed", error);
    return { kind: "error", message: GENERIC_ERROR };
  }

  return { kind: "success" };
}

export async function deletePet(petId: string): Promise<ActionResult> {
  const sessionClient = await createClient();
  const userId = await requireUserId(sessionClient);
  return runDeletePet(sessionClient, userId, petId);
}

/**
 * Accepted upload types and the extension each one is stored under. The
 * extension comes from the declared type rather than the uploaded filename, so
 * a caller cannot choose the object's suffix. A Map, not an object: the lookup
 * key is client-supplied, and a plain object would also answer to every
 * Object.prototype name ("constructor", "toString", …).
 */
const PHOTO_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

/**
 * Upload cap. The form crops to a small square JPEG, so this is far above any
 * legitimate upload and exists only to bound what one request can store.
 */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Canonical 8-4-4-4-12 hex shape. Strict `z.uuid()` rejects valid Postgres uuids
 * whose variant nibble falls outside RFC 9562, and this id is interpolated into
 * a storage path, so the shape is what has to be checked.
 */
const UUID_SHAPE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export interface UploadPetPhotoDeps {
  /** Session-scoped client — storage RLS confines the upload to the caller's prefix. */
  sessionClient: DbClient;
  /** Service-role client — writes the resulting object path onto the pet. */
  serviceClient: DbClient;
  /** The authenticated user's id. Must be verified from a real session before calling. */
  userId: string;
}

/**
 * Core: upload a pet photo to the private `pet-photos` bucket and record its
 * object path on the pet. The session client + storage RLS enforce that the
 * upload path is owned by the caller ({client_id}/...). Stores the PATH (not a
 * URL); reads are served via short-lived signed URLs generated server-side.
 *
 * `photo_url` is written with the service role: the server signs whatever path
 * that column holds, so it is not a value a client should be able to set to an
 * arbitrary object in the bucket.
 */
export async function runUploadPetPhoto(
  deps: UploadPetPhotoDeps,
  formData: FormData,
): Promise<ActionResult> {
  const { sessionClient, serviceClient, userId } = deps;

  const petId = formData.get("petId");
  const file = formData.get("file");
  const ext =
    file instanceof File ? PHOTO_EXTENSIONS.get(file.type) : undefined;
  if (
    typeof petId !== "string" ||
    !UUID_SHAPE.test(petId) ||
    !(file instanceof File) ||
    ext === undefined ||
    file.size === 0 ||
    file.size > MAX_PHOTO_BYTES
  ) {
    return {
      kind: "validation_error",
      message: "A pet and image are required.",
    };
  }

  const path = `${userId}/${petId}/photo.${ext}`;

  const { error: uploadError } = await sessionClient.storage
    .from("pet-photos")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) {
    console.error("uploadPetPhoto: storing the photo failed", uploadError);
    return { kind: "error", message: GENERIC_ERROR };
  }

  const { data: updated, error: updateError } = await serviceClient
    .from("pets")
    .update({ photo_url: path })
    .eq("id", petId)
    // The service role bypasses RLS, so ownership is asserted here.
    .eq("client_id", userId)
    // An update that matches no row reports no error, so the returned rows are
    // the only signal that the pet is deleted or someone else's.
    .select("id");
  if (updateError) {
    console.error(
      "uploadPetPhoto: recording the photo path failed",
      updateError,
    );
    return { kind: "error", message: GENERIC_ERROR };
  }
  if (!updated || updated.length === 0) {
    return {
      kind: "validation_error",
      message: "A pet and image are required.",
    };
  }

  return { kind: "success" };
}

export async function uploadPetPhoto(
  formData: FormData,
): Promise<ActionResult> {
  const sessionClient = await createClient();
  const userId = await requireUserId(sessionClient);
  return runUploadPetPhoto(
    { sessionClient, serviceClient: createServiceClient(), userId },
    formData,
  );
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
  sessionClient: DbClient,
  userId: string,
  formKey: FormKey,
  data: unknown,
  petId: string | null = null,
): Promise<ActionResult> {
  // hasOwn, not a plain lookup: formKey arrives from the client, and every
  // Object.prototype name would otherwise resolve to a truthy non-entry.
  const entry = Object.hasOwn(formRegistry, formKey)
    ? formRegistry[formKey]
    : undefined;
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
      console.error("submitForm: reading the pet failed", petError);
      return { kind: "error", message: GENERIC_ERROR };
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
    console.error(
      "submitForm: reading the existing response failed",
      selectError,
    );
    return { kind: "error", message: GENERIC_ERROR };
  }

  if (existing) {
    // Update existing row.
    const { error } = await sessionClient
      .from("form_responses")
      .update({ data: parsed.data, submitted_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("client_id", userId);

    if (error) {
      console.error("submitForm: updating the response failed", error);
      return { kind: "error", message: GENERIC_ERROR };
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
      console.error("submitForm: inserting the response failed", error);
      return { kind: "error", message: GENERIC_ERROR };
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
  sessionClient: DbClient,
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
    console.error("confirmForm: bumping the response failed", error);
    return { kind: "error", message: GENERIC_ERROR };
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

export interface AcceptAuthorizationInput {
  /** The legal name the client typed to sign. */
  acceptedName: string;
  /**
   * Ignored. Which terms were accepted, and at which version, is decided by the
   * authorizations module here on the server — an audit row must record what the
   * client was actually shown, not what the request claimed. Still accepted so
   * callers that send them keep compiling.
   */
  kind?: string;
  version?: string;
}

/**
 * Core: append a click-to-accept authorization (immutable audit row). The typed
 * legal name is validated; the kind and version come from the authorizations
 * module. Accepting terms already on record is a no-op, so a repeated submit
 * cannot pile up duplicate rows.
 */
export async function runAcceptAuthorization(
  sessionClient: DbClient,
  userId: string,
  input: AcceptAuthorizationInput,
): Promise<ActionResult> {
  const name = input.acceptedName.trim();
  if (name.length < 1 || name.length > FIELD_LIMITS.name) {
    return { kind: "validation_error", message: "Type your legal name." };
  }

  const { data: latest, error: readError } = await sessionClient
    .from("authorizations")
    .select("version, accepted_name, accepted_at")
    .eq("client_id", userId)
    .eq("kind", EXPENSE_AUTH_KIND)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readError) {
    console.error(
      "acceptAuthorization: reading the latest acceptance failed",
      readError,
    );
    return { kind: "error", message: GENERIC_ERROR };
  }

  const accepted = latest
    ? {
        version: latest.version,
        acceptedName: latest.accepted_name,
        acceptedAt: latest.accepted_at,
      }
    : null;
  if (authorizationCurrent(accepted)) {
    return { kind: "success" };
  }

  const { error } = await sessionClient.from("authorizations").insert({
    client_id: userId,
    kind: EXPENSE_AUTH_KIND,
    version: EXPENSE_AUTH_VERSION,
    accepted_name: name,
  });
  if (error) {
    console.error(
      "acceptAuthorization: recording the acceptance failed",
      error,
    );
    return { kind: "error", message: GENERIC_ERROR };
  }
  return { kind: "success" };
}

export async function acceptAuthorization(
  input: AcceptAuthorizationInput,
): Promise<ActionResult> {
  const sessionClient = await createClient();
  const userId = await requireUserId(sessionClient);
  return runAcceptAuthorization(sessionClient, userId, input);
}
