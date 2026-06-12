import { addMinutes } from "date-fns";
import {
  type Ctx,
  addPet,
  createClientUser,
  insertBooking,
  insertDebit,
  insertForm,
  insertInquiry,
  insertNight,
  insertPayment,
  insertReview,
  insertSeries,
  insertWindow,
  setPremiumDays,
  setServiceFormKey,
} from "./factories";
import { SEED_TZ, slot, statusFor, weekAnchor } from "./dates";

export interface Step {
  name: string;
  run(ctx: Ctx): Promise<void>;
}

// ── busy-week ─────────────────────────────────────────────────────────────────

const busyClients: Step = {
  name: "busy-clients",
  async run(ctx) {
    await createClientUser(ctx, {
      email: "dana@local.test",
      fullName: "Dana Walker",
      onboarding: "approved",
    });
    await addPet(ctx, "dana@local.test", "biscuit", {
      name: "Biscuit",
      species: "dog",
      breed: "Lab mix",
    });
    await addPet(ctx, "dana@local.test", "maple", {
      name: "Maple",
      species: "dog",
      breed: "Corgi",
    });
    await createClientUser(ctx, {
      email: "sam@local.test",
      fullName: "Sam Reyes",
      onboarding: "approved",
    });
    await addPet(ctx, "sam@local.test", "pepper", {
      name: "Pepper",
      species: "dog",
      breed: "Heeler",
    });
    await addPet(ctx, "sam@local.test", "mochi", {
      name: "Mochi",
      species: "cat",
    });
    await createClientUser(ctx, {
      email: "lee@local.test",
      fullName: "Lee Nguyen",
      onboarding: "approved",
    });
    await addPet(ctx, "lee@local.test", "clementine", {
      name: "Clementine",
      species: "cat",
    });
  },
};

const busyAvailability: Step = {
  name: "busy-availability",
  async run(ctx) {
    const a = weekAnchor(ctx.now);
    // Mon–Sat 8:00–18:00 Denver, this week + next.
    for (const day of [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12]) {
      await insertWindow(ctx, {
        startsAt: slot(a, day, 8),
        endsAt: slot(a, day, 18),
      });
    }
    // Overnight nights: Fri + Sat this week (covers the resident booking).
    for (const day of [4, 5]) {
      const d = slot(a, day, 12);
      await insertNight(
        ctx,
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Denver",
        }).format(d),
      );
    }
  },
};

const busyBookings: Step = {
  name: "busy-bookings",
  async run(ctx) {
    const a = weekAnchor(ctx.now);
    // Disjoint same-class slots; statuses derived from time vs now.
    const timetable = [
      // walks ($25/h + $10/dog)
      {
        key: "walk-mon",
        svc: "walk",
        email: "dana@local.test",
        pets: ["biscuit", "maple"],
        day: 0,
        h: 9,
        m: 0,
        dur: 60,
        cents: 4500,
      },
      {
        key: "walk-tue",
        svc: "walk",
        email: "sam@local.test",
        pets: ["pepper"],
        day: 1,
        h: 9,
        m: 0,
        dur: 60,
        cents: 3500,
      },
      {
        key: "walk-wed",
        svc: "walk",
        email: "dana@local.test",
        pets: ["biscuit"],
        day: 2,
        h: 14,
        m: 0,
        dur: 60,
        cents: 3500,
      },
      {
        key: "walk-thu",
        svc: "walk",
        email: "sam@local.test",
        pets: ["pepper"],
        day: 3,
        h: 9,
        m: 0,
        dur: 60,
        cents: 3500,
      },
      {
        key: "walk-fri",
        svc: "walk",
        email: "dana@local.test",
        pets: ["maple"],
        day: 4,
        h: 11,
        m: 0,
        dur: 60,
        cents: 3500,
      },
      {
        key: "walk-sat",
        svc: "walk",
        email: "sam@local.test",
        pets: ["pepper"],
        day: 5,
        h: 10,
        m: 0,
        dur: 60,
        cents: 3500,
      },
      // check-ins ($30/h, $15 min)
      {
        key: "checkin-mon",
        svc: "check-in",
        email: "lee@local.test",
        pets: ["clementine"],
        day: 0,
        h: 13,
        m: 0,
        dur: 30,
        cents: 1500,
      },
      {
        key: "checkin-wed",
        svc: "check-in",
        email: "sam@local.test",
        pets: ["mochi"],
        day: 2,
        h: 9,
        m: 30,
        dur: 30,
        cents: 1500,
      },
      {
        key: "checkin-fri",
        svc: "check-in",
        email: "lee@local.test",
        pets: ["clementine"],
        day: 4,
        h: 15,
        m: 0,
        dur: 30,
        cents: 1500,
      },
      // training ($35/h, max 1 pet)
      {
        key: "training-tue",
        svc: "training",
        email: "dana@local.test",
        pets: ["biscuit"],
        day: 1,
        h: 16,
        m: 0,
        dur: 60,
        cents: 3500,
      },
    ];
    for (const t of timetable) {
      const startsAt = slot(a, t.day, t.h, t.m);
      await insertBooking(ctx, t.key, {
        clientEmail: t.email,
        service: t.svc,
        startsAt,
        endsAt: addMinutes(startsAt, t.dur),
        status: statusFor(startsAt, ctx.now),
        paymentStatus: "unpaid",
        finalCents: t.cents,
        petKeys: t.pets,
      });
    }
    // Resident house-sit: Fri 18:00 → Sun 10:00, cat-only 2 nights ($30/night).
    await insertBooking(ctx, "housesit-weekend", {
      clientEmail: "lee@local.test",
      service: "house-sitting",
      startsAt: slot(a, 4, 18),
      endsAt: slot(a, 6, 10),
      status: statusFor(slot(a, 4, 18), ctx.now),
      finalCents: 6000,
      petKeys: ["clementine"],
    });
    // Pending approvals, next week.
    await insertBooking(ctx, "pending-walk", {
      clientEmail: "dana@local.test",
      service: "walk",
      startsAt: slot(a, 7, 9),
      endsAt: slot(a, 7, 10),
      status: "pending_approval",
      finalCents: 4500,
      petKeys: ["biscuit", "maple"],
    });
    await insertBooking(ctx, "pending-housesit", {
      clientEmail: "sam@local.test",
      service: "house-sitting",
      startsAt: slot(a, 10, 18),
      endsAt: slot(a, 12, 10),
      status: "pending_approval",
      finalCents: 13000,
      petKeys: ["pepper", "mochi"],
    });
  },
};

const busySeries: Step = {
  name: "busy-series",
  async run(ctx) {
    const a = weekAnchor(ctx.now);
    // Weekly walk, Mondays 15:00, open-ended; week-3 occurrence skipped
    // (EXDATE), so occurrences exist at +1w, +2w, +4w.
    const template = slot(a, 7, 15);
    await insertSeries(ctx, "weekly-walk", {
      clientEmail: "sam@local.test",
      service: "walk",
      templateStartsAt: template,
      durationMin: 60,
      openEnded: true,
      skippedStarts: [slot(a, 21, 15)],
    });
    for (const day of [7, 14, 28]) {
      const startsAt = slot(a, day, 15);
      await insertBooking(ctx, `series-walk-d${day}`, {
        clientEmail: "sam@local.test",
        service: "walk",
        startsAt,
        endsAt: addMinutes(startsAt, 60),
        status: "confirmed",
        finalCents: 3500,
        seriesKey: "weekly-walk",
        petKeys: ["pepper"],
      });
    }
  },
};

// ── payment-states ────────────────────────────────────────────────────────────

const paymentClients: Step = {
  name: "payment-clients",
  async run(ctx) {
    await createClientUser(ctx, {
      email: "paula@local.test",
      fullName: "Paula Iverson",
      onboarding: "approved",
    });
    await addPet(ctx, "paula@local.test", "rex", {
      name: "Rex",
      species: "dog",
      breed: "GSD",
    });
    await createClientUser(ctx, {
      email: "devon@local.test",
      fullName: "Devon Price",
      onboarding: "approved",
    });
    await addPet(ctx, "devon@local.test", "koda", {
      name: "Koda",
      species: "dog",
      breed: "Husky",
    });
  },
};

const paymentBookings: Step = {
  name: "payment-bookings",
  async run(ctx) {
    const a = weekAnchor(ctx.now);
    // 7:00 walks — below the busy-week timetable's earliest slot, so
    // admin-demo composition can never violate the same-class exclusion.
    const mk = (key: string, day: number) => ({
      key,
      startsAt: slot(a, day, 7),
      endsAt: slot(a, day, 8),
    });

    // unpaid, no payments row
    const b1 = mk("pay-unpaid", 0);
    await insertBooking(ctx, b1.key, {
      clientEmail: "paula@local.test",
      service: "walk",
      startsAt: b1.startsAt,
      endsAt: b1.endsAt,
      status: "completed",
      paymentStatus: "unpaid",
      finalCents: 3500,
      petKeys: ["rex"],
    });

    // paid (payment succeeded)
    const b3 = mk("pay-paid", 1);
    await insertBooking(ctx, b3.key, {
      clientEmail: "paula@local.test",
      service: "walk",
      startsAt: b3.startsAt,
      endsAt: b3.endsAt,
      status: "completed",
      paymentStatus: "paid",
      finalCents: 3500,
      petKeys: ["rex"],
    });
    await insertPayment(ctx, {
      bookingKey: b3.key,
      intentId: "pi_seed_paid",
      amountCents: 3500,
      status: "succeeded",
    });

    // refunded (cancelled in full-refund window)
    const b4 = mk("pay-refunded", 2);
    await insertBooking(ctx, b4.key, {
      clientEmail: "paula@local.test",
      service: "walk",
      startsAt: b4.startsAt,
      endsAt: b4.endsAt,
      status: "cancelled",
      paymentStatus: "refunded",
      finalCents: 3500,
      petKeys: ["rex"],
    });
    await insertPayment(ctx, {
      bookingKey: b4.key,
      intentId: "pi_seed_refunded",
      amountCents: 3500,
      status: "refunded",
      refundedCents: 3500,
    });

    // no-show with outstanding debt → devon's re-booking is debt-gated
    const b6 = mk("pay-noshow", 3);
    await insertBooking(ctx, b6.key, {
      clientEmail: "devon@local.test",
      service: "walk",
      startsAt: b6.startsAt,
      endsAt: b6.endsAt,
      status: "no_show",
      paymentStatus: "unpaid",
      finalCents: 3500,
      petKeys: ["koda"],
    });
    await insertDebit(ctx, {
      clientEmail: "devon@local.test",
      bookingKey: b6.key,
      amountCents: 3500,
      reason: "no_show",
      settled: false,
    });

    // late cancel with settled debt (history, no gate)
    const b7 = mk("pay-latecancel", 4);
    await insertBooking(ctx, b7.key, {
      clientEmail: "paula@local.test",
      service: "walk",
      startsAt: b7.startsAt,
      endsAt: b7.endsAt,
      status: "cancelled",
      paymentStatus: "unpaid",
      finalCents: 3500,
      petKeys: ["rex"],
    });
    await insertDebit(ctx, {
      clientEmail: "paula@local.test",
      bookingKey: b7.key,
      amountCents: 1750,
      reason: "late_cancel",
      settled: true,
    });

    // open intent (requires_payment), next week
    const b2 = mk("pay-open-intent", 7);
    await insertBooking(ctx, b2.key, {
      clientEmail: "paula@local.test",
      service: "walk",
      startsAt: b2.startsAt,
      endsAt: b2.endsAt,
      status: "confirmed",
      paymentStatus: "unpaid",
      finalCents: 3500,
      petKeys: ["rex"],
    });
    await insertPayment(ctx, {
      bookingKey: b2.key,
      intentId: "pi_seed_open",
      amountCents: 3500,
      status: "requires_payment",
    });

    // failed payment, next week
    const b5 = mk("pay-failed", 8);
    await insertBooking(ctx, b5.key, {
      clientEmail: "paula@local.test",
      service: "walk",
      startsAt: b5.startsAt,
      endsAt: b5.endsAt,
      status: "confirmed",
      paymentStatus: "unpaid",
      finalCents: 3500,
      petKeys: ["rex"],
    });
    await insertPayment(ctx, {
      bookingKey: b5.key,
      intentId: "pi_seed_failed",
      amountCents: 3500,
      status: "failed",
    });

    // prepayable: confirmed + owed, NO payment row — clean target for the live
    // Prepay verify (mints a REAL Stripe intent on first click, reuses on the
    // second). The pi_seed_* rows above carry fake intent ids that can't be
    // retrieved against real Stripe, so they aren't valid Prepay targets.
    const b8 = mk("pay-prepayable", 9);
    await insertBooking(ctx, b8.key, {
      clientEmail: "paula@local.test",
      service: "walk",
      startsAt: b8.startsAt,
      endsAt: b8.endsAt,
      status: "confirmed",
      paymentStatus: "unpaid",
      finalCents: 3500,
      petKeys: ["rex"],
    });

    // partially refunded (late-cancelled, 50% retained) — SP4b live-verify target
    const b9 = mk("pay-partial-refunded", 11);
    await insertBooking(ctx, b9.key, {
      clientEmail: "paula@local.test",
      service: "walk",
      startsAt: b9.startsAt,
      endsAt: b9.endsAt,
      status: "cancelled",
      paymentStatus: "partially_refunded",
      finalCents: 3500,
      petKeys: ["rex"],
    });
    await insertPayment(ctx, {
      bookingKey: b9.key,
      intentId: "pi_seed_partial_refunded",
      amountCents: 3500,
      status: "succeeded",
      refundedCents: 1750,
    });
  },
};

// ── admin-demo extras ─────────────────────────────────────────────────────────

const adminDemoExtras: Step = {
  name: "admin-demo-extras",
  async run(ctx) {
    const a = weekAnchor(ctx.now);

    // ── SP5a: disputed payment ────────────────────────────────────────────────
    // Day 6 (Sunday) 7:00 — free slot in the 7:00 payment-states band.
    const disputedBooking = {
      startsAt: slot(a, 6, 7),
      endsAt: slot(a, 6, 8),
    };
    await insertBooking(ctx, "pay-disputed", {
      clientEmail: "paula@local.test",
      service: "walk",
      startsAt: disputedBooking.startsAt,
      endsAt: disputedBooking.endsAt,
      status: "completed",
      paymentStatus: "paid",
      finalCents: 3500,
      petKeys: ["rex"],
    });
    await insertPayment(ctx, {
      bookingKey: "pay-disputed",
      intentId: "pi_seed_disputed",
      amountCents: 3500,
      status: "succeeded",
      disputedAt: new Date(ctx.now.getTime() - 2 * 24 * 60 * 60 * 1000),
      disputeStatus: "needs_response",
    });

    // ── SP5a: premium days in settings ───────────────────────────────────────
    // Two upcoming Denver day-keys (next-week Saturday + Sunday).
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: SEED_TZ });
    const premiumDays = [
      fmt.format(slot(a, 12, 12)), // next-week Saturday
      fmt.format(slot(a, 13, 12)), // next-week Sunday
    ];
    await setPremiumDays(ctx, premiumDays);

    // ── SP5a: emergency form on multi-pet client (dana, 2 dogs) ──────────────
    await insertForm(ctx, {
      clientEmail: "dana@local.test",
      formKey: "emergency",
      data: {
        contact_name: "Jordan Walker",
        contact_phone: "555-0142",
        contact_relationship: "Spouse",
        vet_name: "Boulder Animal Hospital",
        vet_phone: "555-0188",
      },
    });
    // Every onboarding status on the clients list.
    await createClientUser(ctx, {
      email: "noor@local.test",
      fullName: "Noor Haddad",
      onboarding: "info_pending",
    });
    await createClientUser(ctx, {
      email: "morgan@local.test",
      fullName: "Morgan Avery",
      onboarding: "meet_greet_pending",
    });
    await addPet(ctx, "morgan@local.test", "scout", {
      name: "Scout",
      species: "dog",
      breed: "Beagle",
    });
    await createClientUser(ctx, {
      email: "drew@local.test",
      fullName: "Drew Castle",
      onboarding: "declined",
    });
    await createClientUser(ctx, {
      email: "kira@local.test",
      fullName: "Kira Bell",
      onboarding: "approved",
      kiche: true,
    });
    await addPet(ctx, "kira@local.test", "juniper", {
      name: "Juniper",
      species: "dog",
      breed: "Aussie",
    });
    // Upcoming meet & greet (free, onboarding flow).
    await insertBooking(ctx, "meet-greet-morgan", {
      clientEmail: "morgan@local.test",
      service: "meet-greet",
      startsAt: slot(a, 9, 11),
      endsAt: slot(a, 9, 11, 30),
      status: "confirmed",
      finalCents: 0,
      petKeys: ["scout"],
    });
    // Inquiries queue: one new guest, one resolved client-linked.
    await insertInquiry(ctx, {
      name: "Taylor Guest",
      email: "taylor@example.com",
      subject: "Weekend availability?",
      message: "Hi — do you have any weekend walk slots open this month?",
      status: "new",
    });
    await insertInquiry(ctx, {
      clientEmail: "morgan@local.test",
      name: "Morgan Avery",
      email: "morgan@local.test",
      message: "Following up on our meet & greet time.",
      status: "resolved",
    });
    // Reviews moderation queue: one of each status.
    await insertReview(ctx, {
      clientEmail: "dana@local.test",
      authorName: "Dana W.",
      rating: 5,
      body: "Biscuit and Maple come home tired and happy every time.",
      status: "pending",
    });
    await insertReview(ctx, {
      clientEmail: "sam@local.test",
      authorName: "Sam R.",
      rating: 5,
      body: "Reliable, communicative, and great with a nervous heeler.",
      status: "published",
    });
    await insertReview(ctx, {
      clientEmail: "kira@local.test",
      authorName: "Kira B.",
      rating: 4,
      body: "Juniper loves her walks.",
      status: "rejected",
    });

    // ── SP6: forms-gate demo ──────────────────────────────────────────────────
    // Walk service now requires the emergency form (form_key = 'emergency').
    // Dana has submitted it (inserted above); Sam, Lee, Devon, and Paula have not
    // → those clients will see "Finish your forms before booking" when visiting
    // /book/walk. Dana books normally.
    // The gate is bypassed for admin create-on-behalf (ADMIN_POLICY).
    await setServiceFormKey(ctx, "walk", "emergency");
  },
};

// ── registry ──────────────────────────────────────────────────────────────────

const busyWeekSteps: Step[] = [
  busyClients,
  busyAvailability,
  busyBookings,
  busySeries,
];
const paymentSteps: Step[] = [paymentClients, paymentBookings];

export const SCENARIOS: Record<string, Step[]> = {
  fresh: [],
  "busy-week": busyWeekSteps,
  "payment-states": paymentSteps,
  "admin-demo": [...busyWeekSteps, ...paymentSteps, adminDemoExtras],
};
