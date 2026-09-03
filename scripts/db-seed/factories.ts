import { parsePricingConfig } from "../../src/features/pricing";
import type { ServicePricingConfig } from "../../src/features/pricing";
import type { Enums } from "../../src/lib/supabase/database.types";
import type { DbClient } from "../../src/lib/supabase/db-client";
import { ADMIN_EMAIL, SEED_PASSWORD } from "./constants";
import { SEED_DISTANCE_MILES, asJson, seedQuote } from "./quotes";
import type { SeedQuantities } from "./quotes";

export interface Ctx {
  db: DbClient;
  now: Date;
  adminId: string;
  users: Map<string, string>; // email → user id
  pets: Map<string, string>; // pet key → pet id
  // booking key → ids + the quoted total, which payments and debits bill off
  bookings: Map<string, { id: string; clientId: string; finalCents: number }>;
  series: Map<string, string>; // series key → series id
  services: Map<
    string,
    {
      id: string;
      concurrency: Enums<"concurrency_class">;
      config: ServicePricingConfig;
    }
  >;
}

export async function loadServices(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.db
    .from("services")
    .select("id, slug, concurrency, pricing_config");
  if (error || !data) throw new Error(`load services: ${error?.message}`);
  for (const s of data) {
    // Throws on a config the app itself would reject — a seed that priced
    // bookings off a shape the quote engine cannot read is worse than no seed.
    ctx.services.set(s.slug, {
      id: s.id,
      concurrency: s.concurrency,
      config: parsePricingConfig(s.pricing_config),
    });
  }
}

/** The quoted total of an already-seeded booking. */
export function bookingFinalCents(ctx: Ctx, key: string): number {
  const booking = ctx.bookings.get(key);
  if (!booking) throw new Error(`bookingFinalCents: unknown booking ${key}`);
  return booking.finalCents;
}

async function createAuthUser(db: DbClient, email: string): Promise<string> {
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
export async function ensureAdmin(db: DbClient): Promise<string> {
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
    onboarding: Enums<"onboarding_status">;
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

/**
 * Cal-created ("unclaimed") client: a real auth user with no password whose
 * profile is flagged `unclaimed = true`. `invited` stamps `invited_at` to demo
 * the "invite generated" admin UI state.
 */
export async function createUnclaimedClientUser(
  ctx: Ctx,
  opts: {
    email: string;
    fullName: string;
    onboarding: Enums<"onboarding_status">;
    invited?: boolean;
  },
): Promise<string> {
  const id = await createAuthUser(ctx.db, opts.email);
  const { error } = await ctx.db
    .from("profiles")
    .update({
      full_name: opts.fullName,
      onboarding_status: opts.onboarding,
      unclaimed: true,
      invited_at: opts.invited ? ctx.now.toISOString() : null,
      phone: "555-0100",
      address: "123 Local St, Boulder, CO",
      zip: "80301",
      lat: 40.02,
      lng: -105.26,
    })
    .eq("id", id);
  if (error)
    throw new Error(`create unclaimed client ${opts.email}: ${error.message}`);
  ctx.users.set(opts.email, id);
  return id;
}

export async function addPet(
  ctx: Ctx,
  ownerEmail: string,
  key: string,
  opts: { name: string; species: Enums<"pet_species">; breed?: string },
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
    status: Enums<"booking_status">;
    paymentStatus?: Enums<"payment_status">;
    /** Priced quantities — the total is quoted from these, never hand-written. */
    quantities: SeedQuantities;
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
  const { input, breakdown } = seedQuote(svc.config, opts.quantities);
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
      distance_miles: SEED_DISTANCE_MILES,
      quote_inputs: asJson(input),
      quote_breakdown: asJson(breakdown),
      discount_cents: 0,
      final_cents: breakdown.finalCents,
      // Stated rather than left to the column default: the admin discount panel
      // hides the Kiche toggle unless the client marked the booking welcome.
      kiche_welcome: true,
      requires_approval: opts.status === "pending_approval",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`booking ${key}: ${error?.message}`);
  ctx.bookings.set(key, {
    id: data.id,
    clientId,
    finalCents: breakdown.finalCents,
  });
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
    /** Quantities the roll cron freezes onto each occurrence it creates. */
    quantities: SeedQuantities;
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
      quote_inputs: asJson(seedQuote(svc.config, opts.quantities).input),
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
    /** Defaults to the booking's quoted total — a seeded payment charges the quote. */
    amountCents?: number;
    status: Enums<"payment_txn_status">;
    refundedCents?: number;
    disputedAt?: Date;
    disputeStatus?: string;
  },
): Promise<void> {
  const booking = ctx.bookings.get(opts.bookingKey);
  if (!booking) throw new Error(`payment: unknown booking ${opts.bookingKey}`);
  const { error } = await ctx.db.from("payments").insert({
    booking_id: booking.id,
    client_id: booking.clientId,
    stripe_payment_intent_id: opts.intentId,
    amount_cents: opts.amountCents ?? booking.finalCents,
    currency: "usd",
    status: opts.status,
    refunded_cents: opts.refundedCents ?? 0,
    disputed_at: opts.disputedAt?.toISOString() ?? null,
    dispute_status: opts.disputeStatus ?? null,
  });
  if (error) throw new Error(`payment ${opts.intentId}: ${error.message}`);
}

export async function insertForm(
  ctx: Ctx,
  opts: {
    clientEmail: string;
    formKey: string;
    data: Record<string, string>;
    bookingKey?: string;
  },
): Promise<void> {
  const clientId = ctx.users.get(opts.clientEmail);
  if (!clientId)
    throw new Error(`insertForm: unknown client ${opts.clientEmail}`);
  const bookingId = opts.bookingKey
    ? (ctx.bookings.get(opts.bookingKey)?.id ?? null)
    : null;
  if (opts.bookingKey && !bookingId) {
    throw new Error(`insertForm: unknown booking ${opts.bookingKey}`);
  }
  const { error } = await ctx.db.from("form_responses").insert({
    client_id: clientId,
    form_key: opts.formKey,
    data: opts.data,
    submitted_at: ctx.now.toISOString(),
    booking_id: bookingId,
  });
  if (error)
    throw new Error(
      `insertForm ${opts.clientEmail}/${opts.formKey}: ${error.message}`,
    );
}

export async function setPremiumDays(
  ctx: Ctx,
  dateKeys: string[],
): Promise<void> {
  const { data: row, error: rowErr } = await ctx.db
    .from("settings")
    .select("id")
    .limit(1)
    .single();
  if (rowErr || !row) throw new Error(`setPremiumDays: settings row not found`);
  const { error } = await ctx.db
    .from("settings")
    .update({ holiday_dates: dateKeys })
    .eq("id", row.id);
  if (error) throw new Error(`setPremiumDays: ${error.message}`);
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
    status: Enums<"review_status">;
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
