/**
 * Read side of the pets table: one place that knows which columns a pet read
 * needs and how a private photo path becomes a displayable URL.
 *
 * Every route that lists a client's pets used to hand-roll this query plus a
 * per-pet signing loop, which is how one copy silently lost `birthdate` and how
 * a five-pet page ended up making five storage round-trips. Photos are signed
 * in one batched call.
 *
 * Reads happen through the service role because the photo bucket is private;
 * the caller supplies the client, so this module stays free of Next.js and of
 * the session/service decision.
 */

import type { PostgrestError } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import type { DbClient } from "@/lib/supabase/db-client";

import type { PetSpecies } from "./species";

/** Private bucket holding pet photos — paths out of it are signed, never public. */
const PET_PHOTO_BUCKET = "pet-photos";

/**
 * Lifetime of a signed pet-photo URL: long enough to outlast a page view,
 * short enough that a URL copied out of the markup stops working.
 */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Canonical column list for a `pets` read. Selects derive from this, never from a literal. */
export const PET_COLUMNS =
  "id, name, species, breed, notes, birthdate, photo_url";

/**
 * A `pets` row as selected by {@link PET_COLUMNS}, projected out of the
 * generated schema rather than restated. The two halves cannot drift: a column
 * dropped from {@link PET_COLUMNS} no longer satisfies this type at the read
 * below, and a column dropped from the table fails the `Pick` outright.
 *
 * `photo_url` holds a storage path inside the private bucket, not a URL.
 */
export type PetRow = Pick<
  Database["public"]["Tables"]["pets"]["Row"],
  "id" | "name" | "species" | "breed" | "notes" | "birthdate" | "photo_url"
>;

/** The pet fields the booking flow needs to offer a pet for assignment. */
export interface AssignablePet {
  id: string;
  name: string;
  species: PetSpecies;
  breed: string | null;
  notes: string | null;
  /** Resolved (signed) photo URL, or null. */
  photoUrl: string | null;
}

/**
 * A stored pet plus its resolved photo URL. A superset of {@link AssignablePet},
 * so one read serves both the booking flow and the edit forms, which round-trip
 * the remaining stored columns.
 */
export interface ClientPetView extends PetRow {
  /** Resolved (signed) photo URL, or null. */
  photoUrl: string | null;
}

/** Supabase-shaped so a caller can destructure `error` like any other read. */
export interface ListClientPetsResult {
  data: ClientPetView[];
  error: PostgrestError | null;
}

/**
 * Sign every path in one request. A signing failure degrades to "no photo"
 * rather than failing the read — a pet list without thumbnails still works.
 */
async function signPhotos(
  serviceClient: DbClient,
  paths: string[],
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  if (paths.length === 0) return signed;

  const { data, error } = await serviceClient.storage
    .from(PET_PHOTO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error("listClientPets: signing pet photos failed", error);
    return signed;
  }

  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
  }
  return signed;
}

/**
 * List one client's pets, oldest first, with photo paths resolved to signed URLs.
 *
 * @param serviceClient - Service-role client; the photo bucket is private.
 */
export async function listClientPets(
  serviceClient: DbClient,
  clientId: string,
): Promise<ListClientPetsResult> {
  const { data, error } = await serviceClient
    .from("pets")
    .select(PET_COLUMNS)
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  if (error) return { data: [], error };

  const rows: PetRow[] = data ?? [];
  const signed = await signPhotos(
    serviceClient,
    rows.flatMap((row) => (row.photo_url ? [row.photo_url] : [])),
  );

  return {
    data: rows.map((row) => ({
      ...row,
      photoUrl: row.photo_url ? (signed.get(row.photo_url) ?? null) : null,
    })),
    error: null,
  };
}
