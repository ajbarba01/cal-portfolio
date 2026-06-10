import type { SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_EMAIL, SEED_PASSWORD } from "./constants";

export interface Ctx {
  db: SupabaseClient;
  now: Date;
  adminId: string;
  users: Map<string, string>; // email → user id
  pets: Map<string, string>; // pet key → pet id
  bookings: Map<string, { id: string; clientId: string }>; // booking key → ids
  series: Map<string, string>; // series key → series id
  services: Map<string, { id: string; concurrency: "exclusive" | "resident" }>;
}

export async function loadServices(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.db
    .from("services")
    .select("id, slug, concurrency");
  if (error || !data) throw new Error(`load services: ${error?.message}`);
  for (const s of data) {
    ctx.services.set(s.slug, { id: s.id, concurrency: s.concurrency });
  }
}

async function createAuthUser(
  db: SupabaseClient,
  email: string,
): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`create auth user ${email}: ${error?.message}`);
  }
  return data.user.id;
}

/** Finds (or creates) the admin and (re)asserts its promoted profile. */
export async function ensureAdmin(db: SupabaseClient): Promise<string> {
  const { data, error } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw new Error(`listUsers: ${error.message}`);
  let id = data.users.find((u) => u.email === ADMIN_EMAIL)?.id;
  if (!id) id = await createAuthUser(db, ADMIN_EMAIL);
  const { error: profErr } = await db
    .from("profiles")
    .update({
      role: "admin",
      onboarding_status: "approved",
      full_name: "Local Admin",
      lat: 40.015,
      lng: -105.27,
    })
    .eq("id", id);
  if (profErr) throw new Error(`promote admin profile: ${profErr.message}`);
  return id;
}

export async function createClientUser(
  ctx: Ctx,
  opts: {
    email: string;
    fullName: string;
    onboarding: "info_pending" | "meet_greet_pending" | "approved" | "declined";
    kiche?: boolean;
  },
): Promise<string> {
  const id = await createAuthUser(ctx.db, opts.email);
  const { error } = await ctx.db
    .from("profiles")
    .update({
      full_name: opts.fullName,
      onboarding_status: opts.onboarding,
      kiche_allowed: opts.kiche ?? false,
      phone: "555-0100",
      address: "123 Local St, Boulder, CO",
      zip: "80301",
      lat: 40.02, // ~1 mi from origin → inside auto-approve zone
      lng: -105.26,
    })
    .eq("id", id);
  if (error) throw new Error(`profile ${opts.email}: ${error.message}`);
  ctx.users.set(opts.email, id);
  return id;
}

export async function addPet(
  ctx: Ctx,
  ownerEmail: string,
  key: string,
  opts: { name: string; species: "dog" | "cat"; breed?: string },
): Promise<string> {
  const ownerId = ctx.users.get(ownerEmail);
  if (!ownerId) throw new Error(`addPet ${key}: unknown owner ${ownerEmail}`);
  const { data, error } = await ctx.db
    .from("pets")
    .insert({
      client_id: ownerId,
      name: opts.name,
      species: opts.species,
      breed: opts.breed ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`addPet ${key}: ${error?.message}`);
  ctx.pets.set(key, data.id);
  return data.id;
}

export async function insertBooking(
  ctx: Ctx,
  key: string,
  opts: {
    clientEmail: string;
    service: string;
    startsAt: Date;
    endsAt: Date;
    status:
      | "pending_approval"
      | "confirmed"
      | "completed"
      | "declined"
      | "cancelled"
      | "no_show";
    paymentStatus?: "unpaid" | "paid" | "refunded";
    finalCents: number;
    seriesKey?: string;
    petKeys?: string[];
  },
): Promise<string> {
  const clientId = ctx.users.get(opts.clientEmail);
  const svc = ctx.services.get(opts.service);
  if (!clientId) throw new Error(`booking ${key}: unknown ${opts.clientEmail}`);
  if (!svc) throw new Error(`booking ${key}: unknown service ${opts.service}`);
  const seriesId = opts.seriesKey ? ctx.series.get(opts.seriesKey) : null;
  if (opts.seriesKey && !seriesId) {
    throw new Error(`booking ${key}: unknown series ${opts.seriesKey}`);
  }
  const { data, error } = await ctx.db
    .from("bookings")
    .insert({
      client_id: clientId,
      service_id: svc.id,
      starts_at: opts.startsAt.toISOString(),
      ends_at: opts.endsAt.toISOString(),
      series_id: seriesId,
      status: opts.status,
      payment_status: opts.paymentStatus ?? "unpaid",
      concurrency: svc.concurrency,
      distance_miles: 3,
      quote_inputs: {},
      quote_breakdown: {},
      discount_cents: 0,
      final_cents: opts.finalCents,
      requires_approval: opts.status === "pending_approval",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`booking ${key}: ${error?.message}`);
  ctx.bookings.set(key, { id: data.id, clientId });
  for (const petKey of opts.petKeys ?? []) {
    const petId = ctx.pets.get(petKey);
    if (!petId) throw new Error(`booking ${key}: unknown pet ${petKey}`);
    const { error: bpErr } = await ctx.db
      .from("booking_pets")
      .insert({ booking_id: data.id, pet_id: petId });
    if (bpErr) {
      throw new Error(`booking_pets ${key}/${petKey}: ${bpErr.message}`);
    }
  }
  return data.id;
}

export async function insertSeries(
  ctx: Ctx,
  key: string,
  opts: {
    clientEmail: string;
    service: string;
    templateStartsAt: Date;
    durationMin: number;
    openEnded?: boolean;
    count?: number;
    skippedStarts?: Date[];
  },
): Promise<string> {
  const clientId = ctx.users.get(opts.clientEmail);
  const svc = ctx.services.get(opts.service);
  if (!clientId || !svc)
    throw new Error(`series ${key}: unknown client/service`);
  const { data, error } = await ctx.db
    .from("booking_series")
    .insert({
      client_id: clientId,
      service_id: svc.id,
      freq: "weekly",
      step_interval: 1,
      count: opts.count ?? null,
      until: null,
      open_ended: opts.openEnded ?? false,
      template_starts_at: opts.templateStartsAt.toISOString(),
      duration_min: opts.durationMin,
      quote_inputs: {},
      active: true,
      skipped_starts: (opts.skippedStarts ?? []).map((d) => d.toISOString()),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`series ${key}: ${error?.message}`);
  ctx.series.set(key, data.id);
  return data.id;
}

export async function insertPayment(
  ctx: Ctx,
  opts: {
    bookingKey: string;
    intentId: string;
    amountCents: number;
    status: "requires_payment" | "succeeded" | "refunded" | "failed";
  },
): Promise<void> {
  const booking = ctx.bookings.get(opts.bookingKey);
  if (!booking) throw new Error(`payment: unknown booking ${opts.bookingKey}`);
  const { error } = await ctx.db.from("payments").insert({
    booking_id: booking.id,
    client_id: booking.clientId,
    stripe_payment_intent_id: opts.intentId,
    amount_cents: opts.amountCents,
    currency: "usd",
    status: opts.status,
  });
  if (error) throw new Error(`payment ${opts.intentId}: ${error.message}`);
}

export async function insertDebit(
  ctx: Ctx,
  opts: {
    clientEmail: string;
    bookingKey?: string;
    amountCents: number;
    reason: "late_cancel" | "no_show";
    settled: boolean;
  },
): Promise<void> {
  const clientId = ctx.users.get(opts.clientEmail);
  if (!clientId) throw new Error(`debit: unknown ${opts.clientEmail}`);
  const { error } = await ctx.db.from("client_debits").insert({
    client_id: clientId,
    booking_id: opts.bookingKey ? ctx.bookings.get(opts.bookingKey)?.id : null,
    amount_cents: opts.amountCents,
    reason: opts.reason,
    settled_at: opts.settled ? ctx.now.toISOString() : null,
  });
  if (error) throw new Error(`debit ${opts.clientEmail}: ${error.message}`);
}

export async function insertReview(
  ctx: Ctx,
  opts: {
    clientEmail: string;
    authorName: string;
    rating: number;
    body: string;
    status: "pending" | "published" | "rejected";
  },
): Promise<void> {
  const clientId = ctx.users.get(opts.clientEmail);
  if (!clientId) throw new Error(`review: unknown ${opts.clientEmail}`);
  const { error } = await ctx.db.from("reviews").insert({
    client_id: clientId,
    author_name: opts.authorName,
    rating: opts.rating,
    body: opts.body,
    status: opts.status,
  });
  if (error) throw new Error(`review ${opts.authorName}: ${error.message}`);
}

export async function insertInquiry(
  ctx: Ctx,
  opts: {
    clientEmail?: string;
    name: string;
    email: string;
    subject?: string;
    message: string;
    status: "new" | "resolved";
  },
): Promise<void> {
  const clientId = opts.clientEmail
    ? (ctx.users.get(opts.clientEmail) ?? null)
    : null;
  const resolved = opts.status === "resolved";
  const { error } = await ctx.db.from("inquiries").insert({
    client_id: clientId,
    name: opts.name,
    email: opts.email,
    subject: opts.subject ?? null,
    message: opts.message,
    status: opts.status,
    replied_at: resolved ? ctx.now.toISOString() : null,
    resolved_at: resolved ? ctx.now.toISOString() : null,
  });
  if (error) throw new Error(`inquiry ${opts.email}: ${error.message}`);
}

export async function insertWindow(
  ctx: Ctx,
  opts: { startsAt: Date; endsAt: Date; note?: string },
): Promise<void> {
  const { error } = await ctx.db.from("availability_windows").insert({
    starts_at: opts.startsAt.toISOString(),
    ends_at: opts.endsAt.toISOString(),
    note: opts.note ?? null,
  });
  if (error) throw new Error(`window: ${error.message}`);
}

export async function insertNight(
  ctx: Ctx,
  nightIsoDate: string,
  note?: string,
): Promise<void> {
  const { error } = await ctx.db
    .from("overnight_nights")
    .insert({ night: nightIsoDate, note: note ?? null });
  if (error) throw new Error(`night ${nightIsoDate}: ${error.message}`);
}
