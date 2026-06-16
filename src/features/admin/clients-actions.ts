"use server";

/**
 * Admin clients directory: index aggregates, client detail, Kiche eligibility,
 * onboarding status, and offline debit settlement. Service-role access follows
 * an admin check.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/service";
import {
  onboardingStatusSchema,
  type OnboardingStatus,
} from "@/features/booking";

import { assertActorIsAdmin } from "@/lib/admin-guard";
import { getActorOrRedirect } from "@/lib/admin-session";
import {
  outstandingBalanceCents,
  type BookingPaymentStatus,
} from "@/features/payments";
import { deriveMeetGreetUpcoming } from "@/features/booking";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export interface AdminDeps {
  serviceClient: SupabaseClient;
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
      "id, full_name, email, phone, onboarding_status, created_at, pets(count), bookings(count), client_debits(amount_cents, settled_at)",
    )
    .eq("role", "client")
    .order("created_at", { ascending: false });
  if (profileError) return { kind: "error", message: profileError.message };

  const { data: mgBookings, error: mgError } = await serviceClient
    .from("bookings")
    .select("client_id, starts_at, status, services!inner(slug)")
    .eq("services.slug", "meet-greet")
    .in("status", ["pending_approval", "confirmed"]);
  if (mgError) return { kind: "error", message: mgError.message };

  const meetGreetUpcoming = deriveMeetGreetUpcoming(
    (mgBookings ?? []).map((b) => ({
      client_id: b.client_id as string,
      starts_at: b.starts_at as string,
      status: b.status as string,
    })),
    new Date(),
  );

  interface ProfileWithAggregates {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    onboarding_status: OnboardingStatus | null;
    pets: { count: number }[] | null;
    bookings: { count: number }[] | null;
    client_debits: { amount_cents: number; settled_at: string | null }[] | null;
  }

  const clients: ClientListRow[] = (
    (profiles ?? []) as unknown as ProfileWithAggregates[]
  ).map((profile) => ({
    id: profile.id,
    full_name: profile.full_name ?? null,
    email: profile.email ?? null,
    phone: profile.phone ?? null,
    petCount: profile.pets?.[0]?.count ?? 0,
    bookingCount: profile.bookings?.[0]?.count ?? 0,
    outstandingCents: outstandingBalanceCents(profile.client_debits ?? []),
    onboardingStatus: profile.onboarding_status ?? "info_pending",
    meetGreetUpcoming: meetGreetUpcoming.has(profile.id),
  }));

  return { kind: "success", clients };
}

export interface ClientPet {
  id: string;
  name: string;
  species: "dog" | "cat";
  breed: string | null;
  notes: string | null;
  photoUrl: string | null;
}

export interface ClientFormResponse {
  id: string;
  form_key: string;
  pet_id: string | null;
  booking_id: string | null;
  data: unknown;
  submitted_at: string;
}

export interface ClientBookingRow {
  id: string;
  service_name: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  final_cents: number;
  payment_status: BookingPaymentStatus;
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
}

export interface ClientDetailView {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  zip: string | null;
  avatar_url: string | null;
  kiche_allowed: boolean;
  onboarding_status: OnboardingStatus;
  created_at: string;
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

export async function getClientDetailCore(
  deps: AdminDeps,
  clientId: string,
): Promise<GetClientDetailResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }
  const serviceClient = deps.serviceClient;

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select(
      "id, full_name, email, phone, address, zip, avatar_url, kiche_allowed, onboarding_status, created_at, role",
    )
    .eq("id", clientId)
    .single();
  if (profileError || !profile) return { kind: "not_found" };

  const { data: pets } = await serviceClient
    .from("pets")
    .select("id, name, species, breed, notes, photo_url")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  const signPhoto = async (path: string): Promise<string | null> => {
    const { data } = await serviceClient.storage
      .from("pet-photos")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    return data?.signedUrl ?? null;
  };
  const petViews: ClientPet[] = await Promise.all(
    (pets ?? []).map(async (pet) => ({
      id: pet.id as string,
      name: pet.name as string,
      species: pet.species as "dog" | "cat",
      breed: (pet.breed as string | null) ?? null,
      notes: (pet.notes as string | null) ?? null,
      photoUrl: pet.photo_url ? await signPhoto(pet.photo_url as string) : null,
    })),
  );

  const { data: forms } = await serviceClient
    .from("form_responses")
    .select("id, form_key, pet_id, booking_id, data, submitted_at")
    .eq("client_id", clientId)
    .order("submitted_at", { ascending: false });

  const { data: bookings } = await serviceClient
    .from("bookings")
    .select(
      "id, status, starts_at, ends_at, final_cents, payment_status, services(name)",
    )
    .eq("client_id", clientId)
    .order("starts_at", { ascending: false });

  // Fetch payment rows for these bookings in one query; pick the live row per
  // booking (prefer non-failed, most-recent by created_at).
  const bookingIds = (bookings ?? []).map((b) => b.id as string);
  const paymentsMap = new Map<
    string,
    {
      stripe_payment_intent_id: string | null;
      status: string;
      refunded_cents: number;
      disputed_at: string | null;
      dispute_status: string | null;
    }
  >();
  if (bookingIds.length > 0) {
    const { data: paymentRows } = await serviceClient
      .from("payments")
      .select(
        "booking_id, stripe_payment_intent_id, amount_cents, status, refunded_cents, disputed_at, dispute_status, created_at",
      )
      .in("booking_id", bookingIds)
      .order("created_at", { ascending: false });

    // For each booking pick the live row: prefer non-failed, then fall back to
    // most-recent. The query is already sorted newest-first so the first
    // non-failed row wins; if all are failed the first (newest) row is used.
    for (const row of (paymentRows ?? []) as Array<{
      booking_id: string;
      stripe_payment_intent_id: string | null;
      refunded_cents: number;
      disputed_at: string | null;
      dispute_status: string | null;
      status: string;
    }>) {
      const existing = paymentsMap.get(row.booking_id);
      // Accept first seen (newest) non-failed row; keep existing if it's already
      // non-failed and this one is failed.
      if (!existing) {
        paymentsMap.set(row.booking_id, row);
      } else if (existing.status === "failed" && row.status !== "failed") {
        paymentsMap.set(row.booking_id, row);
      }
    }
  }

  const { data: debits } = await serviceClient
    .from("client_debits")
    .select("id, booking_id, amount_cents, reason, settled_at, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  const debitRows: ClientDebitRow[] = (debits ?? []).map((debit) => ({
    id: debit.id as string,
    booking_id: (debit.booking_id as string | null) ?? null,
    amount_cents: debit.amount_cents as number,
    reason: debit.reason as string,
    settled_at: (debit.settled_at as string | null) ?? null,
    created_at: debit.created_at as string,
  }));

  const detailNow = new Date();
  const meetGreetUpcoming = (bookings ?? []).some((booking) => {
    const join = booking.services as
      | { name: string }
      | { name: string }[]
      | null;
    const name = Array.isArray(join) ? join[0]?.name : join?.name;
    return (
      name === "Meet & Greet" &&
      (booking.status === "pending_approval" ||
        booking.status === "confirmed") &&
      new Date(booking.starts_at as string) > detailNow
    );
  });

  const client: ClientDetailView = {
    id: profile.id as string,
    full_name: (profile.full_name as string | null) ?? null,
    email: (profile.email as string | null) ?? null,
    phone: (profile.phone as string | null) ?? null,
    address: (profile.address as string | null) ?? null,
    zip: (profile.zip as string | null) ?? null,
    avatar_url: (profile.avatar_url as string | null) ?? null,
    kiche_allowed: Boolean(profile.kiche_allowed),
    onboarding_status:
      (profile.onboarding_status as OnboardingStatus) ?? "info_pending",
    created_at: profile.created_at as string,
    pets: petViews,
    forms: (forms ?? []).map((form) => ({
      id: form.id as string,
      form_key: form.form_key as string,
      pet_id: (form.pet_id as string | null) ?? null,
      booking_id: (form.booking_id as string | null) ?? null,
      data: form.data,
      submitted_at: form.submitted_at as string,
    })),
    bookings: (bookings ?? []).map((booking) => {
      const serviceJoin = booking.services as
        | { name: string }
        | { name: string }[]
        | null;
      const serviceName = Array.isArray(serviceJoin)
        ? (serviceJoin[0]?.name ?? null)
        : (serviceJoin?.name ?? null);
      const paymentRow = paymentsMap.get(booking.id as string) ?? null;
      return {
        id: booking.id as string,
        service_name: serviceName,
        status: booking.status as string,
        starts_at: booking.starts_at as string,
        ends_at: booking.ends_at as string,
        final_cents: booking.final_cents as number,
        payment_status:
          ((booking.payment_status as BookingPaymentStatus | null) ??
            "unpaid") satisfies BookingPaymentStatus,
        refunded_cents: paymentRow ? (paymentRow.refunded_cents as number) : 0,
        disputed_at: paymentRow
          ? ((paymentRow.disputed_at as string | null) ?? null)
          : null,
        dispute_status: paymentRow
          ? ((paymentRow.dispute_status as string | null) ?? null)
          : null,
        payment_intent_id: paymentRow
          ? ((paymentRow.stripe_payment_intent_id as string | null) ?? null)
          : null,
      };
    }),
    debits: debitRows,
    outstandingCents: outstandingBalanceCents(debitRows),
    meetGreetUpcoming,
  };

  return { kind: "success", client };
}

export type ClientMutationResult =
  | { kind: "success" }
  | { kind: "forbidden" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

const uuidSchema = z.string().uuid();

export async function setKicheAllowedCore(
  deps: AdminDeps,
  clientId: string,
  isAllowed: boolean,
): Promise<ClientMutationResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }
  if (!uuidSchema.safeParse(clientId).success) {
    return { kind: "validation_error", message: "Invalid client id" };
  }
  const { error } = await deps.serviceClient
    .from("profiles")
    .update({ kiche_allowed: isAllowed })
    .eq("id", clientId)
    .eq("role", "client");
  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

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
    .update({ settled_at: new Date().toISOString() })
    .eq("id", debitId)
    .is("settled_at", null);
  if (error) return { kind: "error", message: error.message };
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

export async function setKicheAllowed(
  clientId: string,
  isAllowed: boolean,
): Promise<ClientMutationResult> {
  const actorUserId = await getActorOrRedirect();
  const result = await setKicheAllowedCore(
    { serviceClient: createServiceClient(), actorUserId },
    clientId,
    isAllowed,
  );
  if (result.kind === "success") revalidatePath(`/admin/clients/${clientId}`);
  return result;
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
  if (error) return { kind: "error", message: error.message };
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
