"use server";

/**
 * Admin clients directory: index aggregates, client detail, Kiche eligibility,
 * onboarding status, and offline debit settlement. Service-role access follows
 * an admin check.
 */

import type { DbClient } from "@/lib/supabase/db-client";
import type { Tables } from "@/lib/supabase/database.types";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/service";
import { listClientPets, type ClientPetView } from "@/features/pets";
import { formRegistry, type FormKey } from "@/features/accounts";
import {
  onboardingStatusSchema,
  type BookingStatusDb,
  type OnboardingStatus,
} from "@/features/booking";

import { assertActorIsAdmin } from "@/lib/admin-guard";
import { getActorOrRedirect } from "@/lib/admin-session";
import {
  outstandingBalanceCents,
  type BookingPaymentStatus,
} from "@/features/payments";
import { deriveMeetGreetUpcoming } from "@/features/booking";
import { parseAdjustAmountCents } from "./adjust-amount";
import {
  hasUpcomingMeetGreet,
  MEET_GREET_SLUG,
  toBookingViews,
  type DetailBookingRow,
  type DetailPaymentRow,
} from "./clients-view";

/** Shown when a read fails: the page cannot tell Cal anything truthful about this client. */
const READ_FAILED_MESSAGE =
  "We couldn't load this right now. Please try again.";

/** Shown when a write fails. The cause is logged; Cal only needs to know to retry. */
const WRITE_FAILED_MESSAGE = "Something went wrong. Please try again.";

export interface AdminDeps {
  serviceClient: DbClient;
  actorUserId: string;
}

export interface ClientListRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  petCount: number;
  bookingCount: number;
  outstandingCents: number;
  onboardingStatus: OnboardingStatus;
  /** Has a future, non-terminal meet-greet booking (drives the pre-visit approve confirm). */
  meetGreetUpcoming: boolean;
  /** Cal-created shadow account not yet claimed by the client. */
  unclaimed: boolean;
}

export type ListClientsResult =
  | { kind: "success"; clients: ClientListRow[] }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

export async function listClientsCore(
  deps: AdminDeps,
): Promise<ListClientsResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }
  const serviceClient = deps.serviceClient;

  // Pet/booking counts and debits come back as Postgres-side embedded
  // aggregates — no whole-table scans counted in JS.
  const { data: profiles, error: profileError } = await serviceClient
    .from("profiles")
    .select(
      "id, full_name, email, phone, onboarding_status, unclaimed, created_at, pets(count), bookings(count), client_debits(amount_cents, settled_at)",
    )
    .eq("role", "client")
    .order("created_at", { ascending: false });
  if (profileError) {
    console.error("listClientsCore: profiles read failed", profileError);
    return { kind: "error", message: READ_FAILED_MESSAGE };
  }

  const { data: mgBookings, error: mgError } = await serviceClient
    .from("bookings")
    .select("client_id, starts_at, status, services!inner(slug)")
    .eq("services.slug", MEET_GREET_SLUG)
    .in("status", ["pending_approval", "confirmed"]);
  if (mgError) {
    console.error("listClientsCore: meet-greet read failed", mgError);
    return { kind: "error", message: READ_FAILED_MESSAGE };
  }

  const meetGreetUpcoming = deriveMeetGreetUpcoming(
    mgBookings ?? [],
    new Date(),
  );

  const clients: ClientListRow[] = (profiles ?? []).map((profile) => ({
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    // The embedded aggregates come back as one-element arrays, empty when the
    // client has no rows — the optional reads are the empty case, not a shape doubt.
    petCount: profile.pets[0]?.count ?? 0,
    bookingCount: profile.bookings[0]?.count ?? 0,
    outstandingCents: outstandingBalanceCents(profile.client_debits),
    onboardingStatus: profile.onboarding_status,
    meetGreetUpcoming: meetGreetUpcoming.has(profile.id),
    unclaimed: profile.unclaimed,
  }));

  return { kind: "success", clients };
}

/** A client's pet as the shared pets repository returns it, photo already signed. */
export type ClientPet = ClientPetView;

export interface ClientFormResponse {
  id: string;
  /** Always a live registry key: rows on retired keys are dropped by the read. */
  form_key: FormKey;
  pet_id: string | null;
  booking_id: string | null;
  data: unknown;
  submitted_at: string;
}

export interface ClientBookingRow {
  id: string;
  service_name: string | null;
  /** Stable service identity — the name is Cal-editable, the slug is not. */
  service_slug: string | null;
  status: BookingStatusDb;
  starts_at: string;
  ends_at: string;
  final_cents: number;
  payment_status: BookingPaymentStatus;
  /** Frozen quote lines (jsonb) — the itemized price, discounts included. */
  quote_breakdown: unknown;
  refunded_cents: number;
  disputed_at: string | null;
  dispute_status: string | null;
  payment_intent_id: string | null;
}

export interface ClientDebitRow {
  id: string;
  booking_id: string | null;
  amount_cents: number;
  reason: string;
  settled_at: string | null;
  created_at: string;
  resolution: string | null;
}

export interface ClientDetailView {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  zip: string | null;
  avatar_url: string | null;
  onboarding_status: OnboardingStatus;
  created_at: string;
  unclaimed: boolean;
  invited_at: string | null;
  claimed_at: string | null;
  pets: ClientPet[];
  forms: ClientFormResponse[];
  bookings: ClientBookingRow[];
  debits: ClientDebitRow[];
  outstandingCents: number;
  /** Has a future, non-terminal meet-greet booking (drives the pre-visit approve confirm). */
  meetGreetUpcoming: boolean;
}

export type GetClientDetailResult =
  | { kind: "success"; client: ClientDetailView }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

function isKnownFormKey(key: string): key is FormKey {
  return key in formRegistry;
}

/**
 * `form_key` is free text in the database and still holds rows on keys the
 * registry retired (`home`, `pet`). Every card looks its key up in the registry,
 * so one such row would throw and blank the page; they are dropped here, before
 * the count and the list can disagree about how many forms are on file.
 */
function toFormResponses(
  rows: Pick<
    Tables<"form_responses">,
    "id" | "form_key" | "pet_id" | "booking_id" | "data" | "submitted_at"
  >[],
): ClientFormResponse[] {
  const known: ClientFormResponse[] = [];
  for (const row of rows) {
    if (!isKnownFormKey(row.form_key)) continue;
    known.push({
      id: row.id,
      form_key: row.form_key,
      pet_id: row.pet_id,
      booking_id: row.booking_id,
      data: row.data,
      submitted_at: row.submitted_at,
    });
  }
  return known;
}

export async function getClientDetailCore(
  deps: AdminDeps,
  clientId: string,
): Promise<GetClientDetailResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }
  const serviceClient = deps.serviceClient;

  // Independent reads: one round trip instead of five sequential ones.
  const [profileResult, petsResult, formsResult, bookingsResult, debitsResult] =
    await Promise.all([
      serviceClient
        .from("profiles")
        .select(
          "id, full_name, email, phone, address, zip, avatar_url, onboarding_status, unclaimed, invited_at, claimed_at, created_at, role",
        )
        .eq("id", clientId)
        .single(),
      listClientPets(serviceClient, clientId),
      serviceClient
        .from("form_responses")
        .select("id, form_key, pet_id, booking_id, data, submitted_at")
        .eq("client_id", clientId)
        .order("submitted_at", { ascending: false }),
      serviceClient
        .from("bookings")
        .select(
          "id, status, starts_at, ends_at, final_cents, payment_status, quote_breakdown, services(name, slug)",
        )
        .eq("client_id", clientId)
        .order("starts_at", { ascending: false }),
      serviceClient
        .from("client_debits")
        .select(
          "id, booking_id, amount_cents, reason, settled_at, created_at, resolution",
        )
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
    ]);

  const profile = profileResult.data;
  if (profileResult.error || !profile) return { kind: "not_found" };

  // A failed read renders as "none on file", which Cal reads as fact, so each one
  // is logged. The debits read is the exception: an empty list reads as "settled
  // up", so the page fails rather than tell Cal a client owes nothing.
  if (petsResult.error) {
    console.error("getClientDetailCore: pets read failed", petsResult.error);
  }
  if (formsResult.error) {
    console.error("getClientDetailCore: forms read failed", formsResult.error);
  }
  if (bookingsResult.error) {
    console.error(
      "getClientDetailCore: bookings read failed",
      bookingsResult.error,
    );
  }
  if (debitsResult.error) {
    console.error(
      "getClientDetailCore: debits read failed",
      debitsResult.error,
    );
    return { kind: "error", message: READ_FAILED_MESSAGE };
  }

  const bookingRows: DetailBookingRow[] = bookingsResult.data ?? [];

  // Depends on the booking ids, so it cannot join the batch above.
  let paymentRows: DetailPaymentRow[] = [];
  if (bookingRows.length > 0) {
    const { data, error } = await serviceClient
      .from("payments")
      .select(
        "booking_id, stripe_payment_intent_id, status, refunded_cents, disputed_at, dispute_status",
      )
      .in(
        "booking_id",
        bookingRows.map((booking) => booking.id),
      )
      .order("created_at", { ascending: false });
    if (error) {
      console.error("getClientDetailCore: payments read failed", error);
    }
    paymentRows = data ?? [];
  }

  const debitRows: ClientDebitRow[] = debitsResult.data ?? [];

  const bookings = toBookingViews(bookingRows, paymentRows);

  const client: ClientDetailView = {
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    address: profile.address,
    zip: profile.zip,
    avatar_url: profile.avatar_url,
    onboarding_status: profile.onboarding_status,
    created_at: profile.created_at,
    unclaimed: profile.unclaimed,
    invited_at: profile.invited_at,
    claimed_at: profile.claimed_at,
    pets: petsResult.data,
    forms: toFormResponses(formsResult.data ?? []),
    bookings,
    debits: debitRows,
    outstandingCents: outstandingBalanceCents(debitRows),
    meetGreetUpcoming: hasUpcomingMeetGreet(bookings, clientId, new Date()),
  };

  return { kind: "success", client };
}

export type ClientMutationResult =
  | { kind: "success" }
  | { kind: "forbidden" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

const uuidSchema = z.string().uuid();

export async function settleDebitCore(
  deps: AdminDeps,
  debitId: string,
): Promise<ClientMutationResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }
  if (!uuidSchema.safeParse(debitId).success) {
    return { kind: "validation_error", message: "Invalid debit id" };
  }
  const { error } = await deps.serviceClient
    .from("client_debits")
    .update({ settled_at: new Date().toISOString(), resolution: "paid" })
    .eq("id", debitId)
    .is("settled_at", null);
  if (error) {
    console.error("settleDebitCore: settle debit failed", error);
    return { kind: "error", message: WRITE_FAILED_MESSAGE };
  }
  return { kind: "success" };
}

export async function waiveDebitCore(
  deps: AdminDeps,
  debitId: string,
): Promise<ClientMutationResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }
  if (!uuidSchema.safeParse(debitId).success) {
    return { kind: "validation_error", message: "Invalid debit id" };
  }
  const { error } = await deps.serviceClient
    .from("client_debits")
    .update({ settled_at: new Date().toISOString(), resolution: "waived" })
    .eq("id", debitId)
    .is("settled_at", null);
  if (error) {
    console.error("waiveDebitCore: waive debit failed", error);
    return { kind: "error", message: WRITE_FAILED_MESSAGE };
  }
  return { kind: "success" };
}

export async function adjustDebitCore(
  deps: AdminDeps,
  debitId: string,
  newAmountCents: number,
): Promise<ClientMutationResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }
  if (!uuidSchema.safeParse(debitId).success) {
    return { kind: "validation_error", message: "Invalid debit id" };
  }
  const amount = parseAdjustAmountCents(newAmountCents);
  if (amount === null) {
    return {
      kind: "validation_error",
      message: "Amount must be a positive whole number of cents",
    };
  }
  // Only adjust debits that are still outstanding.
  const { error } = await deps.serviceClient
    .from("client_debits")
    .update({ amount_cents: amount, resolution: "adjusted" })
    .eq("id", debitId)
    .is("settled_at", null);
  if (error) {
    console.error("adjustDebitCore: adjust debit failed", error);
    return { kind: "error", message: WRITE_FAILED_MESSAGE };
  }
  return { kind: "success" };
}

export async function listClients(): Promise<ListClientsResult> {
  const actorUserId = await getActorOrRedirect();
  return listClientsCore({ serviceClient: createServiceClient(), actorUserId });
}

export async function getClientDetail(
  clientId: string,
): Promise<GetClientDetailResult> {
  const actorUserId = await getActorOrRedirect();
  return getClientDetailCore(
    { serviceClient: createServiceClient(), actorUserId },
    clientId,
  );
}

export async function settleDebit(
  debitId: string,
  clientId: string,
): Promise<ClientMutationResult> {
  const actorUserId = await getActorOrRedirect();
  const result = await settleDebitCore(
    { serviceClient: createServiceClient(), actorUserId },
    debitId,
  );
  if (result.kind === "success") revalidatePath(`/admin/clients/${clientId}`);
  return result;
}

export async function waiveDebit(
  debitId: string,
  clientId: string,
): Promise<ClientMutationResult> {
  const actorUserId = await getActorOrRedirect();
  const result = await waiveDebitCore(
    { serviceClient: createServiceClient(), actorUserId },
    debitId,
  );
  if (result.kind === "success") revalidatePath(`/admin/clients/${clientId}`);
  return result;
}

export async function adjustDebit(
  debitId: string,
  clientId: string,
  newAmountCents: number,
): Promise<ClientMutationResult> {
  const actorUserId = await getActorOrRedirect();
  const result = await adjustDebitCore(
    { serviceClient: createServiceClient(), actorUserId },
    debitId,
    newAmountCents,
  );
  if (result.kind === "success") revalidatePath(`/admin/clients/${clientId}`);
  return result;
}

export async function setOnboardingStatusCore(
  deps: AdminDeps,
  clientId: string,
  status: string,
): Promise<ClientMutationResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }
  if (!uuidSchema.safeParse(clientId).success) {
    return { kind: "validation_error", message: "Invalid client id" };
  }
  const parsed = onboardingStatusSchema.safeParse(status);
  if (!parsed.success) {
    return { kind: "validation_error", message: "Invalid onboarding status" };
  }
  const { error } = await deps.serviceClient
    .from("profiles")
    .update({ onboarding_status: parsed.data })
    .eq("id", clientId)
    .eq("role", "client");
  if (error) {
    console.error(
      "setOnboardingStatusCore: onboarding status update failed",
      error,
    );
    return { kind: "error", message: WRITE_FAILED_MESSAGE };
  }
  return { kind: "success" };
}

export async function setOnboardingStatus(
  clientId: string,
  status: string,
): Promise<ClientMutationResult> {
  const actorUserId = await getActorOrRedirect();
  const result = await setOnboardingStatusCore(
    { serviceClient: createServiceClient(), actorUserId },
    clientId,
    status,
  );
  if (result.kind === "success") revalidatePath(`/admin/clients/${clientId}`);
  return result;
}
