"use server";

/**
 * PUBLIC busy-range source for the customer calendar.
 *
 * Uses the SERVICE ROLE so it sees every client's active bookings (the RLS
 * browser client only sees the viewer's own — the limitation this fixes). The
 * result is identity-free BY CONSTRUCTION: the repo method projects no owner
 * name/id, and `PublicBusyRange` has no field to carry one. Pet thumbnails are
 * included intentionally (maintainer's call — a photo is not a privacy concern);
 * photos are short-lived signed URLs so the bucket stays private.
 *
 * Busy ranges are filtered to the booked service's concurrency class, because
 * cross-class overlaps are legal (a resident house-sit may overlap an exclusive
 * walk). The DB exclusion constraint remains the real arbiter at submit.
 */

import type { PetSpecies } from "@/features/pets";
import { createServiceClient } from "@/lib/supabase/service";
import {
  createSupabaseBookingRepository,
  type BookingRepository,
  type ConcurrencyClass,
} from "./booking-repository";
import { driveBufferMinutes, type DriveBufferConfig } from "./drive-buffer";
import type { LatLng } from "@/lib/haversine";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * How long a minted URL may be reused. Short of the TTL by a margin so a URL
 * handed to a browser always outlives the page it is rendered into.
 */
const SIGNED_URL_CACHE_MS = (SIGNED_URL_TTL_SECONDS - 5 * 60) * 1000;

/** A busy range safe to expose publicly — start/end + pet thumbnails only. */
export interface PublicBusyRange {
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  pets: { species: PetSpecies; photoUrl: string | null }[];
}

/** A signed pet-photo URL and the moment it must be re-minted. */
export interface CachedPhotoUrl {
  url: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

/**
 * Signed URLs by storage path, reused for as long as they are valid.
 *
 * The calendar polls, so without this every poll re-minted a URL for every pet
 * in the busy set. Caching is safe across callers because the entries are not
 * viewer-specific: the same public calendar shows the same photos to everyone.
 */
const photoUrlCache = new Map<string, CachedPhotoUrl>();

/**
 * Signed URLs for `paths`, asking `signPhotos` only for the ones whose cached
 * URL is missing or spent.
 */
async function signCachedPhotoUrls(
  cache: Map<string, CachedPhotoUrl>,
  signPhotos: (paths: string[]) => Promise<Map<string, string>>,
  paths: string[],
  nowMs: number,
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const stale: string[] = [];

  for (const path of paths) {
    const cached = cache.get(path);
    if (cached !== undefined && cached.expiresAt > nowMs) {
      urls.set(path, cached.url);
    } else {
      stale.push(path);
    }
  }

  if (stale.length > 0) {
    const expiresAt = nowMs + SIGNED_URL_CACHE_MS;
    for (const [path, url] of await signPhotos(stale)) {
      cache.set(path, { url, expiresAt });
      urls.set(path, url);
    }
  }

  // A pet that leaves the busy set is never asked for again, so its entry would
  // otherwise sit in the map for the life of the process.
  for (const [path, cached] of cache) {
    if (cached.expiresAt <= nowMs) cache.delete(path);
  }

  return urls;
}

/**
 * Core (DI-testable): maps identity-free repo busy ranges to the public shape,
 * resolving pet photo paths to signed URLs via the injected batch signer.
 *
 * Every distinct path across every range is signed in ONE call: a busy set of
 * thirty bookings otherwise cost thirty-odd round trips to storage, and the
 * same pet appears in every booking its owner made.
 *
 * Each time-based booking is widened by the one-way drive-time buffer between
 * Cal's origin and the booking owner's location. House-sitting (concurrency
 * "resident") is excluded — Cal is on-site and no round-trip is needed.
 *
 * The drive coordinates are used server-side only and collapse into the
 * widened startsAt/endsAt. PublicBusyRange never carries lat/lng/concurrency.
 *
 * @param photoCache - Carries signed URLs between calls; pass a fresh map to
 * sign everything.
 */
export async function getPublicBusyRangesCore(
  repo: Pick<BookingRepository, "getActiveBusyRanges">,
  signPhotos: (paths: string[]) => Promise<Map<string, string>>,
  photoCache: Map<string, CachedPhotoUrl>,
  now: Date,
  concurrency: ConcurrencyClass | null,
  origin: LatLng,
  bufferCfg: DriveBufferConfig,
): Promise<PublicBusyRange[]> {
  const ranges = await repo.getActiveBusyRanges(now, concurrency);

  const paths = new Set<string>();
  for (const range of ranges) {
    for (const pet of range.pets) {
      if (pet.photoPath !== null) paths.add(pet.photoPath);
    }
  }
  const urls = await signCachedPhotoUrls(
    photoCache,
    signPhotos,
    [...paths],
    now.getTime(),
  );

  return ranges.map((r) => {
    const bufMin =
      r.concurrency === "resident"
        ? 0
        : driveBufferMinutes(
            origin,
            { lat: r.clientLat, lng: r.clientLng },
            bufferCfg,
          );
    const bufMs = bufMin * 60_000;
    return {
      startsAt: new Date(r.startsAt.getTime() - bufMs).toISOString(),
      endsAt: new Date(r.endsAt.getTime() + bufMs).toISOString(),
      pets: r.pets.map((p) => ({
        species: p.species,
        photoUrl: (p.photoPath !== null ? urls.get(p.photoPath) : null) ?? null,
      })),
    };
  });
}

/**
 * Server action: public busy ranges for a service (by slug → concurrency class).
 * Pass `null` slug to get busy ranges across all classes.
 */
export async function getPublicBusyRanges(
  serviceSlug: string | null,
): Promise<PublicBusyRange[]> {
  const svc = createServiceClient();
  const repo = createSupabaseBookingRepository(svc);

  // The service lookup and the settings read do not depend on each other.
  const [service, settings] = await Promise.all([
    serviceSlug ? repo.getServiceBySlug(serviceSlug) : null,
    repo.getSettings(),
  ]);

  const concurrency: ConcurrencyClass | null = service?.concurrency ?? null;
  const origin: LatLng = {
    lat: settings.origin_lat,
    lng: settings.origin_lng,
  };
  const bufferCfg: DriveBufferConfig = {
    roadFactor: settings.road_factor,
    avgSpeedMph: settings.avg_speed_mph,
    pct: settings.drive_buffer_pct,
  };

  const signPhotos = async (paths: string[]): Promise<Map<string, string>> => {
    const { data } = await svc.storage
      .from("pet-photos")
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    const urls = new Map<string, string>();
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl);
    }
    return urls;
  };

  return getPublicBusyRangesCore(
    repo,
    signPhotos,
    photoUrlCache,
    new Date(),
    concurrency,
    origin,
    bufferCfg,
  );
}
