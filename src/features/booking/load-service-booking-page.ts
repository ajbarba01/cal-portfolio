import "server-only";

import type { DbClient } from "@/lib/supabase/db-client";

import {
  listClientPets,
  type AssignablePet,
  type ListClientPetsResult,
} from "@/features/pets";

import { denverDayKey } from "./availability";
import { loadBookingFormData, type BookingFormData } from "./booking-form-data";
import type { OnboardingStatus } from "./booking-repository";
import { driveBufferMinutes } from "./drive-buffer";
import {
  SERVICE_DETAIL_COLUMNS,
  toServiceDetail,
  type ServiceDetail,
} from "./service-detail";
import { listActiveServices, type PublicService } from "./services-repo";
import {
  EXPENSE_AUTH_KIND,
  listClientForms,
  type ClientFormResponses,
} from "@/features/accounts";

/**
 * How far the viewer has got with Cal, which is what the booking page's gate
 * panels branch on. "declined" is a complete profile Cal turned down — a
 * distinct panel from "go finish your profile".
 */
export type AuthState =
  | "guest"
  | "needs-info"
  | "needs-meet-greet"
  | "declined"
  | "ready";

/** One stored form response as the booking gate reads it. */
export interface StoredFormResponse {
  data: Record<string, unknown>;
  /** null while the client has saved a draft but not submitted it. */
  submittedAt: string | null;
}

/** Everything the booking page knows about the person looking at it. */
export interface ServiceBookingViewer {
  authState: AuthState;
  /** Only populated once the viewer is approved — nobody else can assign pets. */
  pets: AssignablePet[];
  /**
   * Denver day-keys where this viewer already has an active booking for THIS
   * service — drives the "your booking" dot on the month grid.
   */
  myBookingDayKeys: string[];
  /** Keyed by form key, or `${formKey}:${petId}` for pet-scoped forms. */
  formResponses: Record<string, StoredFormResponse>;
  acceptedAuthVersion: string | null;
  acceptedAuthAt: string | null;
  /** One-way travel time this viewer's visits reserve, in whole minutes. */
  driveBufferMin: number;
}

export interface ServiceBookingPageData {
  service: ServiceDetail;
  /** The other bookable services, for the cross-nav switcher. */
  siblingServices: PublicService[];
  formData: BookingFormData;
  viewer: ServiceBookingViewer;
}

export type LoadServiceBookingPageResult =
  | { ok: true; data: ServiceBookingPageData }
  | { ok: false; reason: "not-found" | "unavailable" };

const GUEST: ServiceBookingViewer = {
  authState: "guest",
  pets: [],
  myBookingDayKeys: [],
  formResponses: {},
  acceptedAuthVersion: null,
  acceptedAuthAt: null,
  driveBufferMin: 0,
};

const ACTIVE_STATUSES = ["pending_approval", "confirmed"] as const;

/** A read that is skipped for this viewer, shaped like the one it replaces. */
const NO_ROWS = Promise.resolve({ data: null, error: null });

function toAuthState(
  status: OnboardingStatus | undefined,
  serviceSlug: string,
): AuthState {
  if (status === "approved") return "ready";
  if (status === "meet_greet_pending") {
    return serviceSlug === "meet-greet" ? "ready" : "needs-meet-greet";
  }
  // Profile is complete but Cal declined — a distinct panel, not "finish profile".
  if (status === "declined") return "declined";
  // info_pending or undefined → send to the onboarding info step.
  return "needs-info";
}

/**
 * Loads everything the booking page renders for one service.
 *
 * `viewerId` is taken as a promise, not a value, so the auth round trip still
 * overlaps the service, settings and sibling reads the way it did when this
 * lived in the page.
 *
 * @param serviceClient - Service-role client: the pet-photo bucket is private
 * and the busy ranges are public-but-unlisted.
 */
export async function loadServiceBookingPage(
  serviceClient: DbClient,
  serviceSlug: string,
  viewerId: Promise<string | null>,
): Promise<LoadServiceBookingPageResult> {
  const [serviceRead, formData, viewer, siblingServices] = await Promise.all([
    serviceClient
      .from("services")
      .select(SERVICE_DETAIL_COLUMNS)
      .eq("slug", serviceSlug)
      .eq("active", true)
      .maybeSingle(),
    loadBookingFormData(serviceSlug),
    viewerId,
    listActiveServices(serviceClient),
  ]);

  if (serviceRead.error) {
    // A failed read is not a missing service: saying "not found" would tell a
    // client their service was withdrawn every time the database hiccuped.
    console.error(
      "loadServiceBookingPage: service read failed",
      serviceSlug,
      serviceRead.error,
    );
    return { ok: false, reason: "unavailable" };
  }
  if (!serviceRead.data) return { ok: false, reason: "not-found" };
  if (!formData.ok) return { ok: false, reason: "unavailable" };

  const serviceRow = serviceRead.data;

  return {
    ok: true,
    data: {
      service: toServiceDetail(serviceRow),
      siblingServices,
      formData: formData.data,
      viewer: viewer
        ? await loadViewer(
            serviceClient,
            serviceSlug,
            serviceRow.id,
            viewer,
            formData.data.driveBuffer,
          )
        : GUEST,
    },
  };
}

async function loadViewer(
  serviceClient: DbClient,
  serviceSlug: string,
  serviceId: string,
  viewerId: string,
  driveBuffer: BookingFormData["driveBuffer"],
): Promise<ServiceBookingViewer> {
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("onboarding_status, lat, lng")
    .eq("id", viewerId)
    .single();

  const authState = toAuthState(profile?.onboarding_status, serviceSlug);
  const isReady = authState === "ready";

  const [petsRead, { data: myBookingRows }, formsRead, { data: authRows }] =
    await Promise.all([
      isReady
        ? listClientPets(serviceClient, viewerId)
        : Promise.resolve<ListClientPetsResult>({ data: [], error: null }),
      serviceClient
        .from("bookings")
        .select("starts_at")
        .eq("client_id", viewerId)
        .eq("service_id", serviceId)
        .in("status", ACTIVE_STATUSES)
        .gte("ends_at", new Date().toISOString()),
      isReady
        ? listClientForms(serviceClient, viewerId)
        : Promise.resolve<{ data: ClientFormResponses }>({ data: {} }),
      isReady
        ? serviceClient
            .from("authorizations")
            .select("version, accepted_at")
            .eq("client_id", viewerId)
            .eq("kind", EXPENSE_AUTH_KIND)
            .order("accepted_at", { ascending: false })
            .limit(1)
        : NO_ROWS,
    ]);

  // The gate reads submission dates, not stored answers — keep the row's
  // identity and DB column names off the wire.
  const formResponses: Record<string, StoredFormResponse> = {};
  for (const [key, row] of Object.entries(formsRead.data)) {
    if (row) {
      formResponses[key] = {
        data: row.data,
        submittedAt: row.submitted_at ?? null,
      };
    }
  }

  const latestAuth = authRows?.[0];

  return {
    authState,
    // Drop the stored photo path and the columns only the forms need: the rest
    // of this object crosses to the browser.
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
    myBookingDayKeys: (myBookingRows ?? []).map((row) =>
      denverDayKey(new Date(row.starts_at)),
    ),
    formResponses,
    acceptedAuthVersion: latestAuth?.version ?? null,
    acceptedAuthAt: latestAuth?.accepted_at ?? null,
    driveBufferMin: driveBufferMinutes(
      driveBuffer.origin,
      { lat: profile?.lat ?? null, lng: profile?.lng ?? null },
      driveBuffer.config,
    ),
  };
}
