"use server";

/**
 * ADMIN busy-range source for Cal's availability/management calendar.
 *
 * Enriched (owner name, status, booking id, pet names) — the ONLY door that
 * exposes identity. Admin-gated via `assertActorIsAdmin` + service role; the
 * public calendar uses the identity-free source in busy-ranges.ts instead.
 * Pet photos are short-lived signed URLs so the bucket stays private.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createSupabaseBookingRepository } from "@/features/booking/booking-repository";
import type { BookingStatusDb } from "@/features/booking/booking-repository";
import { assertActorIsAdmin } from "./admin-guard";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export interface AdminBusyPet {
  id: string;
  name: string;
  species: "dog" | "cat";
  photoUrl: string | null;
}

export interface AdminBusyRangeView {
  bookingId: string;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  status: BookingStatusDb;
  clientName: string | null;
  pets: AdminBusyPet[];
}

export type AdminBusyResult =
  | { kind: "success"; ranges: AdminBusyRangeView[] }
  | { kind: "forbidden" };

/** Server action: enriched busy ranges for the admin calendar. Admin-gated. */
export async function getAdminBusyRanges(): Promise<AdminBusyResult> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { kind: "forbidden" };

  const svc = createServiceClient();
  if (!(await assertActorIsAdmin(svc, user.id))) {
    return { kind: "forbidden" };
  }

  const repo = createSupabaseBookingRepository(svc);
  const ranges = await repo.getActiveBusyRangesEnriched(new Date());

  const signPhoto = async (path: string): Promise<string | null> => {
    const { data } = await svc.storage
      .from("pet-photos")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    return data?.signedUrl ?? null;
  };

  const views: AdminBusyRangeView[] = await Promise.all(
    ranges.map(async (r) => ({
      bookingId: r.bookingId,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      status: r.status,
      clientName: r.clientName,
      pets: await Promise.all(
        r.pets.map(async (p) => ({
          id: p.id,
          name: p.name,
          species: p.species,
          photoUrl: p.photoPath ? await signPhoto(p.photoPath) : null,
        })),
      ),
    })),
  );

  return { kind: "success", ranges: views };
}
