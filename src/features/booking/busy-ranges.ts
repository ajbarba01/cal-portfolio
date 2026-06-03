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

import { createServiceClient } from "@/lib/supabase/service";
import {
  createSupabaseBookingRepository,
  type BookingRepository,
  type ConcurrencyClass,
} from "./booking-repository";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** A busy range safe to expose publicly — start/end + pet thumbnails only. */
export interface PublicBusyRange {
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  pets: { species: "dog" | "cat"; photoUrl: string | null }[];
}

/**
 * Core (DI-testable): maps identity-free repo busy ranges to the public shape,
 * resolving each pet photo path to a signed URL via the injected signer.
 */
export async function getPublicBusyRangesCore(
  repo: Pick<BookingRepository, "getActiveBusyRanges">,
  signPhoto: (path: string) => Promise<string | null>,
  now: Date,
  concurrency: ConcurrencyClass | null,
): Promise<PublicBusyRange[]> {
  const ranges = await repo.getActiveBusyRanges(now, concurrency);
  return Promise.all(
    ranges.map(async (r) => ({
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      pets: await Promise.all(
        r.pets.map(async (p) => ({
          species: p.species,
          photoUrl: p.photoPath ? await signPhoto(p.photoPath) : null,
        })),
      ),
    })),
  );
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

  let concurrency: ConcurrencyClass | null = null;
  if (serviceSlug) {
    const service = await repo.getServiceBySlug(serviceSlug);
    concurrency = service?.concurrency ?? null;
  }

  const signPhoto = async (path: string): Promise<string | null> => {
    const { data } = await svc.storage
      .from("pet-photos")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    return data?.signedUrl ?? null;
  };

  return getPublicBusyRangesCore(repo, signPhoto, new Date(), concurrency);
}
