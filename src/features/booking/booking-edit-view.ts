import "server-only";

import type { DbClient } from "@/lib/supabase/db-client";

import { listClientPets, type AssignablePet } from "@/features/pets";

import type { QuantityState } from "./quantities";
import { loadBookingFormData, type BookingFormData } from "./booking-form-data";
import { createSupabaseBookingRepository } from "./booking-repository";
import { clientCanEditBooking } from "./client-can-edit";
import { driveBufferMinutes } from "./drive-buffer";
import { quantityStateFromQuoteInputs } from "./quantity-state-from-quote-inputs";
import {
  SERVICE_DETAIL_COLUMNS,
  toServiceDetail,
  type ServiceDetail,
} from "./service-detail";

/** The booking's current values, which the edit form opens on. */
export interface BookingEditSeed {
  startsAtIso: string;
  endsAtIso: string;
  petIds: string[];
  quantities: QuantityState;
  comments: string;
  /** Confirmed bookings drop back to review when edited. */
  wasConfirmed: boolean;
  /** One occurrence of a series is edited as a single visit. */
  isSeriesOccurrence: boolean;
}

export interface BookingEditView {
  service: ServiceDetail;
  formData: BookingFormData;
  pets: AssignablePet[];
  /** Stored total before this edit, so the form can price the difference. */
  priorFinalCents: number;
  /** One-way travel time this client's visits reserve, in whole minutes. */
  driveBufferMin: number;
  initial: BookingEditSeed;
}

/**
 * `forbidden` covers every reason this client may not be on this page —
 * missing, not theirs, or locked — because they all end at the same place:
 * their bookings list. `unavailable` is a read that failed.
 */
export type BookingEditViewResult =
  | { ok: true; data: BookingEditView }
  | { ok: false; reason: "forbidden" | "unavailable" };

/**
 * Loads everything the client-facing booking edit page renders, and answers
 * whether this client may edit this booking at all.
 *
 * @param serviceClient - Service-role client; the pet-photo bucket is private
 * and the guards below are what gate the read.
 */
export async function getBookingEditView(
  serviceClient: DbClient,
  bookingId: string,
  viewerId: string,
): Promise<BookingEditViewResult> {
  const repo = createSupabaseBookingRepository(serviceClient);

  const booking = await repo.getBookingForEdit(bookingId);
  if (!booking || booking.client_id !== viewerId) {
    return { ok: false, reason: "forbidden" };
  }

  // Everything else is independent given the booking.
  const [settings, viewerLatLng, serviceRead, feeRead, formData, petsRead] =
    await Promise.all([
      repo.getSettings(),
      repo.getProfileLatLng(viewerId),
      serviceClient
        .from("services")
        .select(SERVICE_DETAIL_COLUMNS)
        .eq("slug", booking.service_slug)
        .maybeSingle(),
      // getBookingForEdit does not return the stored total.
      serviceClient
        .from("bookings")
        .select("final_cents")
        .eq("id", bookingId)
        .maybeSingle(),
      loadBookingFormData(booking.service_slug),
      listClientPets(serviceClient, viewerId),
    ]);

  const editability = clientCanEditBooking(
    {
      status: booking.status,
      startsAt: booking.startsAt,
      paidCents: booking.paidCents,
      serviceSlug: booking.service_slug,
    },
    new Date(),
    settings.cancellation_full_refund_hours,
  );
  if (!editability.editable) return { ok: false, reason: "forbidden" };

  if (serviceRead.error) {
    // A failed read is not a withdrawn service — do not bounce the client off
    // their own booking because the database hiccuped.
    console.error(
      "getBookingEditView: service read failed",
      booking.service_slug,
      serviceRead.error,
    );
    return { ok: false, reason: "unavailable" };
  }
  if (!serviceRead.data) return { ok: false, reason: "forbidden" };
  if (!formData.ok) return { ok: false, reason: "unavailable" };

  const service = toServiceDetail(serviceRead.data);

  return {
    ok: true,
    data: {
      service,
      formData: formData.data,
      // Drop the stored photo path and the columns only the forms need: the
      // rest of this object crosses to the browser.
      pets: petsRead.data.map(
        ({ id, name, species, breed, notes, photoUrl }) => ({
          id,
          name,
          species,
          breed,
          notes,
          photoUrl,
        }),
      ),
      priorFinalCents: feeRead.data?.final_cents ?? 0,
      driveBufferMin: driveBufferMinutes(
        formData.data.driveBuffer.origin,
        viewerLatLng,
        formData.data.driveBuffer.config,
      ),
      initial: {
        startsAtIso: booking.startsAt.toISOString(),
        endsAtIso: booking.endsAt.toISOString(),
        petIds: booking.petIds,
        quantities: quantityStateFromQuoteInputs(
          service.pricingType,
          booking.quote_inputs,
        ),
        comments: booking.comments ?? "",
        wasConfirmed: booking.status === "confirmed",
        isSeriesOccurrence: booking.series_id !== null,
      },
    },
  };
}
