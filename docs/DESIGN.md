# Design — Project Source of Truth

> Authority for **everything project-specific**: what we're building, the stack rationale, scope, pages, brand, pricing, data model, and routes. The other docs are a portable, project-agnostic engineering framework — project facts belong here.

---

## What this is

A site at `calbarba.com` for **Cal**'s unofficial dog-walking / house-sitting business. Two products in one:

- **Portfolio** — About, Services & Rates, Gallery, Reviews, Resources.
- **Self-serve scheduling** — clients see availability, book, manage an account, complete forms, and prepay; quotes adjust by distance.

Goal: Cal redirects clients to the site to save both sides time. Budget is slim — hosting only (domain already owned).

## Stack & rationale

| Layer       | Choice                                                | Why                                                                     |
| ----------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| Framework   | Next.js (App Router) + TypeScript (strict)            | SSR/SEO for the portfolio half; RSC default; maintainer knows it        |
| Styling     | Tailwind + shadcn/ui                                  | Token-driven, owned components, modular theming                         |
| Backend     | Supabase (Postgres + Auth + RLS + Realtime + Storage) | One platform: DB, auth, realtime availability, image storage; free tier |
| Hosting     | Vercel (free tier)                                    | Zero-config deploys                                                     |
| Payments    | Stripe                                                | Prepay at booking                                                       |
| Email       | Resend                                                | Confirmations / reminders                                               |
| SMS (later) | Twilio                                                | Deferred                                                                |
| Distance    | Haversine, no API                                     | Zero ongoing cost; Mapbox drive-time = optional later swap              |

Reference to **study, not fork**: Cal.com (open-source Calendly) for scheduling logic — availability, timezone math, recurring events. Runs ~$0/mo at MVP.

## MVP scope

**In:** availability + booking (Cal sets slots; clients see open/booked; book a service; recurring option; hour/lead-time rules); accounts + forms (profile, dogs [name/breed/optional photo], emergency form, service-specific forms, first-time onboarding gate); Stripe prepay; haversine auto-quoting.
**Reframed:** sliding scale → a CTA on Services & Rates, not its own feature.
**Deferred:** SMS reminders (Twilio), Google Calendar sync (Cal wants manual control), Mapbox drive-time accuracy.

## Distance pricing (zero ongoing cost)

- Cal's **origin is a configurable setting** (Boulder / Springs / etc) — a row Cal edits.
- Geocode each client **once** at signup: map ZIP → lat/lng from a **free bundled US ZIP-centroid dataset** (NBER / zipcodeR, offline), or one free geocode call. Store `lat`/`lng`.
- At quote time: **haversine** to the current origin × ~1.3 road-factor → price tier. No per-booking API call, no recurring cost.
- **Manual approval** past a threshold (Cal's "only approve if far / specific circumstances").
- Isolated behind `features/pricing/distance.ts` so a Mapbox drive-time swap later is one file (ENGINEERING #4).

## Brand / visual direction

Cal's stated intent: **"simple and straightforward."** Concrete palette + typography to be set in a Claude Design visual-direction session, then recorded here and in `design-tokens.ts`. Follow the anti-generic rules in [FRONTEND.md](FRONTEND.md).

## Page inventory

| Page             | Type      | Notes                                                             |
| ---------------- | --------- | ----------------------------------------------------------------- |
| Book             | App       | Calendly-style availability; the core scheduling flow             |
| Account          | App       | Profile, dogs, emergency form, service-specific forms, costs owed |
| About            | Portfolio | Blurb + references                                                |
| Services & Rates | Portfolio | Rates **+ sliding-scale CTA**                                     |
| Gallery          | Portfolio | Photo grid                                                        |
| Reviews          | Portfolio | Client reviews                                                    |
| Resources        | Portfolio | Info + links                                                      |

---

## Phase 2 — to be written (with Cal)

- **Data model** — clients, dogs, services, availability, bookings, forms, payments (Supabase schema + RLS policies).
- **Route map** — portfolio vs app routes; auth-gated areas.
- **Booking state machine** — request → quote → (auto-approve | manual-approve) → prepay → confirmed → reminder → completed/cancelled.

---

_Last reviewed: 2026-05-29_
