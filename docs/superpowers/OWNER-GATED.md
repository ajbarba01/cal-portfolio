# Owner decision queue

> Everything from the launch-readiness session that needs Alex or Cal rather
> than code. The work is done and merged; each entry below is either a value
> only the owner holds (a key, an address, a photo set) or a decision the code
> deliberately did not make on its own. Nothing here is half-built — every
> surface ships in a defined state while its answer is outstanding.

Each entry gives the question, the code already standing behind it, what the
site does today, and what changes when the answer lands. Paths are written in
backticks rather than links so this file survives the doc reshuffle around it.

Ordered roughly by what a launch needs first. Tick as they close.

---

## Before the site goes live

### 1. Push this session's migrations to production

- [x] **ANSWERED 2026-09-04 (Alex): yes.** Pushed; all fifteen applied against
      `mvrbmrzrifamkbnjfrvd`. The pet columns were empty on production so nothing
      was lost, and the four owner form rows were aged as designed, so those
      clients re-enter vet contact before their next paid booking. Production
      also holds no reviewer name containing an address, which closes item 15.

Fifteen migrations were written this session, `20260902120000_reviews_lock_insert.sql`
through `20260903120000_cat_only_catsonly_condition.sql`. They have only been
applied locally. They cover the review insert lock, definer search paths, the
pet-photo bucket limits, realtime availability, index changes, the client write
grants, the dead admin-write policy drop, the unused pets columns, the owner-form
re-gate for vet fields, the two manual discount modifiers, the profiles insert
lock, the pgTAP drop and the cat-only condition fix.

**Today:** production runs the schema from before the session. Several fixes in
this release — the review insert lock especially — are inert without them.
**Unblocks:** everything else on this list that touches data.

### 2. Cal's alert address, the Resend sender, and DNS

- [x] **CLOSED 2026-09-04 (Alex).**

Alerts go to `cal@barba.org`, sent from the existing `noreply@calbarba.com`.
`ADMIN_NOTIFICATION_EMAIL` has been set in the Vercel project. The address is
read per call rather than at module load, so it takes effect without a rebuild.

**No new DNS was needed, and none was added.** The earlier version of this entry
was wrong to list SPF, DKIM and DMARC as outstanding: those records authorise
the _sender_, not the destination, and they are already published and already
carrying the client mail. Verified live on 2026-09-04 — SPF
`v=spf1 include:amazonses.com ~all` on `send.calbarba.com`, the Resend DKIM key
at `resend._domainkey.calbarba.com`, and `v=DMARC1; p=none` at
`_dmarc.calbarba.com`. Sending to a new recipient needs nothing extra.

`ADMIN_NOTIFICATION_EMAIL` is the single gate for all three admin alerts;
`src/features/notifications/admin-alerts.ts` reads it, trims it, and sends
nothing when it is unset or blank. `EMAIL_FROM` is the sender, read by
`src/features/notifications/resend-mailer.ts`, which throws when it is missing.

**Today:** all three admin alerts are live once the next deploy goes out.

Optional hardening, not required: the DMARC record is `p=none`, which monitors
rather than enforces. Moving to `p=quarantine` once the mail flow is proven is a
DNS change, not a code one.

### 3. Notification wording sign-off

- [x] **ANSWERED 2026-09-04 (Alex):** the three admin alerts are approved as
      written. The client booking-received email was reworded by Alex and the
      reply line removed from it, since the site sends from noreply. Still open:
      whether that same reply line should also come off the confirmation and
      reminder emails, which are sent from the same address.

They live in `src/features/notifications/emails.ts`, drafted in the same
third-person system register as the shipped confirmation and reminder emails.

The **booking-received** email ships live today, sent on every new request:

- Subject `Booking request received: {service}`, heading "Booking request received"
- Rows: Service, Starts, Ends, Total
- Body: "Cal reviews each request and sends a confirmation email when it is approved."
- Link: "View your bookings" (also added to the confirmation and reminder emails)

The three **admin alerts** are unreachable until item 2 closes:

- `New booking request: {client}` / "New booking request" — rows Client, Email,
  Service, Starts, Ends, Total; link "View the booking"
- `New inquiry: {name}` / "New inquiry" — rows Name and Email always, Phone and
  Subject only when the sender supplied them; link "View inquiries"
- `Booking cancelled: {client}` / "Booking cancelled" — rows Client, Email,
  Service, Starts; link "View the booking"

**Today:** the received email is going out to real clients now. The admin three
are written and tested but never sent.
**Unblocks:** nothing technical — this is a wording check on text already in
front of clients.

### 4. Stripe live keys and the payments switch

- [x] **ANSWERED 2026-09-04 (Alex): not at launch.** Stripe is not set up yet,
      and the kill switch exists precisely so launch does not wait for it.
      Prepay stays off; clients see what they owe and settle off-site. Revisit
      when Cal's Stripe account is live, and do the six-event pass before
      flipping the flag.

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are the three values; the webhook route is
`src/app/api/webhooks/stripe/route.ts`. The kill switch is read once in
`src/lib/payments-enabled.ts` and defaults off.

Do not flip the switch before an end-to-end pass on the live keys: `stripe listen`
forwarding to the deployed webhook, then `stripe trigger` for the events the
route handles, confirming each one lands and converges.

**Today:** no prepay call to action appears anywhere. Clients still see what
they owe, and the admin "Unpaid" pill still shows. Both modes are covered by
tests, so flipping the flag is a deploy-time decision, not a code change.
**Unblocks:** client prepayment.

### 5. Vercel plan

- [x] **ANSWERED 2026-09-04 (Alex): stay on Hobby, and turn reminders off for
      now.** The reminder entry was removed from `vercel.json`; completion and
      series-roll still run daily. Nothing else changed — the route, the sweep,
      `reminder_lead_hours` and every test remain, so restoring the schedule is
      one line whenever the plan or the appetite changes. Client confirmations
      and the received notice are unaffected; they send on the booking itself,
      not on a schedule.

`vercel.json` schedules three crons, each once a day: reminders at 14:00 UTC,
completion at 06:00, series roll at 07:00. The reminder lead time itself is a
settings column (`reminder_lead_hours`) read at run time by
`src/features/notifications/reminder-cron.ts`, so the lead is Cal's to set — but
a once-daily sweep means a reminder can fire anywhere from the lead time down to
a day short of it.

**Today:** the plan assumes Hobby and daily crons.
**Unblocks:** an hourly reminder sweep, which needs a paid plan's cron
frequency. No code change either way.

---

## Content Cal owes

### 6. Gallery photos

- [~] **PART-ANSWERED 2026-09-04 (Alex):** show every photo Cal sends, no curation. The
  set is not final — Alex expects to swap photos around later, but not
  before launch. Launch on what is there; re-running `npm run gallery:sync`
  plus a deploy is the whole process whenever the set changes.

`public/gallery` currently holds 67 web-ready files. `npm run gallery:sync`
re-encodes raw originals, content-hashes the filenames and writes blur
placeholders into `src/content/image-placeholders.json`.
`src/features/gallery/gallery-images.ts` reads the folder at build time and
measures each file, so adding photos is a sync plus a deploy.

**Today:** the wall renders whatever is in the folder. An empty folder shows the
"Photos coming soon" empty state rather than breaking.

### 7. Gallery alt text

- [x] **ANSWERED 2026-09-04 (Alex): no captions, and no default sentence
      either.** Every gallery image now carries an empty `alt`, which is the
      correct markup for a decorative photo wall: assistive technology skips the
      picture instead of reading a filler line once per photo. The accessible
      names live on the controls around it — each thumbnail is a button reading
      "Open photo N of M" and the lightbox is labelled "Photo viewer" — so
      nothing is unreachable or unnamed. A test pins the empty alt. Service
      photos and the home-page ticker still carry their own alts and were not
      touched.

Every image currently carries the same alt text, "A dog in Cal's care", set in
`getGalleryImages`. It is honest and non-claiming, but a screen-reader user
hears it 70 times.

**Today:** accessible, but uninformative.
**Unblocks:** real per-photo descriptions, which need one line of caption from
Cal per image and a keyed lookup beside the blur map.

### 8. References content

- [~] **PART-ANSWERED 2026-09-04 (Alex):** six households consented to be named
  — Ginna, Simone, Carol, Claudia, Abby and Madeleine — and all six agreed
  to a first name only, so a first name is all `src/content/references.ts`
  holds. Every entry is `contact: null` for now by owner decision: treat
  them all the same, so each chip routes to the contact form. **Still open:**
  Cal says two of the six are willing to have details published; which two,
  and whether each publishes a phone or an email. **Also still open:** the
  six pet photos. Until they arrive each chip draws a paw-print bubble at
  the same 28px, so a photo drops in without moving anything.

`src/content/references.ts` is the registry. Two households are in it — "Abby
and Sloane" and "Madeleine, Apollo, Anabella" — both with `contact: null`,
meaning they agreed to be named but not to have details published. Six more
names sit in `src/content/marketing.ts` under `about.references.1` through `.8`
and are **not** rendered; they are there as Cal's source text, awaiting consent.

Appearing in the registry at all is the first yes. A `contact` object is a
separate second yes. Details Cal holds privately stay out of the file.

**Today:** the References band on `/about` renders the two consented chips.
With an empty registry it falls back to the "coming soon" intro and no chips.
Visitors who want the rest are routed to the contact form, which prefills the
reference's name via `?ref=`.
**Unblocks:** six more chips, and a reveal dialog for anyone who consents to
publish a phone or email.

### 9. Reference chip accessible names

- [~] **STILL OPEN, narrowed 2026-09-04:** Alex kept the contact-form route
  rather than the one-click "request contact info" confirm Cal described, so
  no new copy was needed today. Cal's own phrase "request contact info" is
  now on record if that flow is ever built, which would also need wording for
  the confirm, the sent state and the failure.

Each chip in `src/features/references/components/reference-list.tsx` is a single
control, and `contact` picks which one it is: a household that consented to
publish details gets a button opening the reveal dialog, and everyone else gets
a link to the contact form. Either branch announces as the leading name alone —
"Abby" — so neither says what activating it does. `aria-haspopup="dialog"` marks
the button branch as opening something without saying what, and no chip on the
live page is that branch today, because both registry entries are
`contact: null`.

Every zero-new-text option is worse than the status quo: pointing
`aria-describedby` at the section intro replays a thirty-word sentence on every
chip.

**Today:** every chip works and is keyboard reachable; only its name is
ambiguous.
**Unblocks:** a two-line fix, once one approved phrase exists for "reveal this
reference's details" and one for "ask Cal for an introduction".

---

## Pricing

The database is the source of truth for every rate and modifier.
`src/test-stubs/seed-fixture.ts` is the single transcription of the seeded card
and is what the pricing tests assert against, so a change to the real config
must be mirrored there or the suite starts lying.

### 10. Confirm the rate card

- [x] **ANSWERED 2026-09-04 (Alex): confirmed as is.** The live production card
      was read back to Alex in full — every base rate, per-unit add-on, toggle,
      travel rate, premium surcharge, automatic and manual discount, the
      stacking order, and the fact that the minimum floor is applied before
      discounts so a Friends & Family walk lands under $15. No change wanted.
      Meet & Greet carrying no modifiers at all, and therefore being free, was
      part of what was confirmed.

Read the amounts from the seed migrations and `seed-fixture.ts` rather than from
any doc. The order is worth confirming separately, because it is a policy
choice rather than an amount: `src/features/pricing/modifiers/evaluate.ts` runs
base rate, then per-unit add-ons, then percentage surcharges on that subtotal,
then the minimum floor, then automatic discounts compounding, then the manual
discounts Cal toggles, then travel — which is never discounted and is dropped
entirely on a complimentary booking. The floor therefore sits _before_ the
discounts, so a discounted total can land below it.

**Today:** the seeded card is treated as correct by every test and every quote.
**Unblocks:** stating the pricing model in `docs/DESIGN.md` with confidence
instead of hedging.

### 11. Non-cat house-sits after the cat-only fix

- [x] **ANSWERED 2026-09-04 (Alex): confirmed as is** — covered by the rate-card
      confirmation above, where the cat-only toggle was shown as the only
      species-specific reduction. A dogless stay that is not cat-only bills the
      full nightly base.

Migration `20260903120000_cat_only_catsonly_condition.sql` repointed the
"Cat-only home" discount from `noDogs` to `catsOnly`. The old condition held for
any dogless stay, so a bird-only booking took a discount whose label described a
household it was not in.

**Today:** those stays bill the full nightly base. A two-night bird-only stay
that used to quote at the discounted rate now quotes at the undiscounted one.
The label is now true of every stay that gets it.
**Unblocks:** either confirming the higher price, or a new modifier with its own
condition and label — which would be new customer-facing copy.

### 12. Small animals sharing a stay

- [x] **ANSWERED 2026-09-04 (Alex): confirmed as is** — the +$5 per night for
      each small animal was on the confirmed card. A fish bills like any other
      non-dog, non-cat pet.

Non-dog, non-cat pets are counted into `others` by
`src/features/booking/booking-service-shared.ts`, fish included. Before that
fix, fish fell through the count entirely, which let a fish-only stay quote
below zero. They now bill the config's `other` per-night rate and show as their
own receipt line.

The wording of that line was the open question here — whether a non-dog,
non-cat charge needed a phrase of its own. It did not, and there is no stored
label to write one into: the config carries an amount only,
`{ kind: "flat_per_unit", unit: "other", cents: 500 }`. The receipt line is
composed in `src/features/pricing/modifiers/evaluate.ts` from `unitNoun()` in
`src/features/pricing/display.ts`, which renders the `other` key as "small
animal", giving "Extra small animal (1)". The `/services` rate table composes
its own phrase for the same charge, "Each additional small animal". Both read
correctly for every species that falls into the count, so no new copy was
written.

**Today:** a tank adds to the total.
**Unblocks:** zero the `other` rate in the config if Cal does not want to charge
for one — a data change, not a code change. Dropping fish from the count would
reopen the hole.

### 13. `off_leash` and `vetted_2nd_dog`

- [x] **ANSWERED 2026-09-04 (Alex): keep all three manual walk discounts.**

`off_leash` (-15%) and `vetted_2nd_dog` (-25%) stay exactly as they are:
discounts Cal applies at their own judgement, with no client opt-in and no
stored reason. No code or data change. The asymmetry is deliberate and accepted
— unlike Kiche, these two can be applied to any walk without the client having
agreed to anything, and nothing records why.

The Kiche discount is not stale either, and the earlier note calling it a
Kiche-shaped leftover was wrong. It applies when Cal's dog Kiche comes along,
and the client opts in first. That is what ships: `quantity-forms.tsx` renders
an "Is Kiche welcome?" switch on walk and house-sitting bookings, the answer is
stored as `bookings.kiche_welcome`, and both `manual-discounts.ts` and
`admin-actions-core.ts` refuse the discount when it is false, so Cal cannot
apply it to a booking whose client declined.

All three are `pct_discount` with `condition: "always"` and `manual: true` in
the walk config, and the admin discount list is built from that config rather
than a hardcoded set, which is why they appear as toggles beside "Friends &
Family (-50%)" and "Complimentary".

**Today:** Cal sees all three on a walk booking's edit page and can apply them;
Kiche is refused unless the client welcomed her.

### 14. The "Discounts" heading

- [x] **ANSWERED 2026-09-04 (Alex): keep it.** "Discounts" stands as written.

"Discounts", one word, in
`src/app/(site)/(admin)/admin/clients/[clientId]/bookings/[bookingId]/edit/_components/admin-manual-discounts.tsx`.
It is the only genuinely new string on that surface. Everything else is composed
from an existing frame with the modifier's own label substituted: the dialog
title, the applied and removed toasts, the failure toast and the
unsupported-service message all take the label verbatim from the config.

**Today:** admin-only text, live.

---

## Data cleanups

### 15. Reviewer names holding an email address

- [x] **CLOSED 2026-09-04: nothing to clean.** Production was queried directly:
      of 18 review rows, none has an `@` in `author_name`. The write-side
      fallback and the read-side mask both stay as defences, but there is no
      backlog to fix.

The submit action used to fall back to the reviewer's email address when their
profile had no name. It no longer does — `src/features/reviews/reviews-action.ts`
writes "Anonymous" instead — and the public read boundary,
`abbreviateAuthorName` in `src/features/reviews/display-name.ts`, also returns
"Anonymous" for any stored name containing an `@`.

**Today:** no address can reach a public page. The addresses are still sitting
in `reviews.author_name` in the database. The mask is containment, not a fix.
**Unblocks:** a one-statement data cleanup.

### 16. Legacy `form_key` rows

- [x] **CLOSED 2026-09-04: no orphaned rows exist.** Production holds 24
      `form_responses` across exactly six keys — `emergency`, `owner`,
      `home_access`, `home_sitting`, `pet_care`, `pet_walk` — and the registry
      knows all six, so `toFormResponses` drops nothing and Cal can see every
      row. The `home` / `pet` keys this entry was written about are not present.
      Worth re-checking only if an old export is ever imported.

`form_responses.form_key` is free text and still holds rows on keys the registry
retired, `home` and `pet`. `toFormResponses` in
`src/features/admin/clients-actions.ts` drops any row whose key the registry
does not know, because a card that looks its key up in the registry would throw
and blank the whole client page.

**Today:** those rows are invisible to Cal in admin, and the form count on the
client page matches the list rather than the table.
**Unblocks:** a data migration onto the current keys makes them visible again.

---

## Deliberate gaps — confirm or schedule

Each of these is a decision the session took and recorded, not an oversight.
They are listed so the owner can overturn any of them cheaply.

### 17. Content Security Policy

- [x] **ANSWERED 2026-09-04 (Alex): add one.** Shipped as a `headers()` block in
      `next.config.ts`, built by `src/lib/security-headers.ts`. It applies to
      every response, including the prerendered marketing pages that `src/proxy.ts`
      deliberately does not match.

The policy is **not** nonce-based and cannot be: a nonce is per-request, which
would force the public routes dynamic, and they are required to stay static.
That was measured, not assumed — with `'unsafe-inline'` dropped from
`script-src`, the home page logs ~28 blocked inline scripts and the app throws
`InvariantError: Expected a request ID … self.__next_r`, because the App Router
writes its RSC flight payload into inline `<script>` tags whose content differs
per page. So `script-src` and `style-src` keep `'unsafe-inline'`.

What that means honestly: **the CSP does not stop injected script from running.**
Its value here is the directives that are exact under a static build —
`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`,
`form-action 'self'`, and tight `connect-src` / `img-src` / `frame-src` /
`font-src` allow-lists (Supabase incl. its Realtime socket; Stripe only while
the payments kill-switch is on). Those bound where a page can send data, so the
class this closes is exfiltration, not execution.

The JSON-LD sink this entry was originally written about is **not** covered by
the CSP either way: `type="application/ld+json"` is a data block the browser
never executes, so the `<` escape in `src/features/seo/json-ld-script.tsx`
remains its actual and sufficient defence.

Shipped alongside it: `Referrer-Policy: strict-origin-when-cross-origin`,
`X-Content-Type-Options: nosniff`, and a `Permissions-Policy` denying camera,
microphone, geolocation and browsing-topics. HSTS was **not** added — Vercel
already sends `Strict-Transport-Security: max-age=63072000`, confirmed against
the live site. `X-Frame-Options` was not added either; `frame-ancestors 'none'`
covers it.

**Today:** every response carries the policy, verified against both `next dev`
and a production build with a console sweep of the public pages, and the
`next build` route table is unchanged — nothing went dynamic.
**Full rationale:** the "Security response headers" section of `docs/DESIGN.md`.

### 18. Supabase Auth settings on the hosted project

- [x] **ANSWERED and APPLIED 2026-09-04 (Alex).** On the hosted project's Email
      provider panel: secure password change turned ON, email OTP expiry
      shortened from 3600s to 1800s, and the minimum password length raised from
      6 to 10. CAPTCHA deliberately left OFF — it costs every real client
      friction and there is no bot pressure to point at yet; revisit under
      Authentication → Attack Protection if that changes.

      `supabase/config.toml` still carries the old local-development values
      (`secure_password_change = false`, `otp_expiry = 3600`,
      `minimum_password_length = 6`). That file governs the local stack only and
      cannot change the hosted project, but it is now out of step with
      production — worth aligning if local auth behaviour ever needs to match.

None of these can be set by a migration — they are hosted-project settings, with
`supabase/config.toml` mirroring them for local only. There, `secure_password_change`
is `false`, `otp_expiry` is 3600 seconds, and the captcha block is commented out.
The dashboard path for the first is Authentication → Sign In / Providers →
Secure password change.

**Today:** defaults.
**Unblocks:** password changes requiring the current password, a tighter link
window, and bot pressure on the auth forms.

### 19. No `stripe_events` ledger

- [x] **ANSWERED 2026-09-04 (Alex): skip it.** Convergent handlers already make
      replays safe, payments are off at launch, and Stripe's own dashboard is the
      history of record for a business this size. Revisit only if payments go
      live and an event's effect ever needs explaining from our side.

The idempotency contract the code relies on instead is documented in the header
of `src/features/payments/stripe-gateway.ts`: handlers converge on replay rather
than being deduplicated by a stored event id.

**Today:** replays are safe because each handler is convergent.
**Unblocks:** an audit trail of every event Stripe sent, which convergence does
not give you.

### 20. Availability concurrency

- [x] **ANSWERED 2026-09-04 (Alex): leave it — the marking is intentional.**
      Cal wants every committed day to read as committed at a glance, whatever
      class the booking is. Not a defect to schedule; the admin calendar and the
      booking rules are answering different questions on purpose. Booking-time
      concurrency is unaffected: a short service may still overlap a resident
      stay, and the exclusion constraint still enforces it.

Overlap detection on `/admin/availability` was fixed this session; the busy-range
view it reads has no concurrency class, so
`src/app/(site)/(admin)/admin/availability/_components/availability-client.tsx`
passes every admin busy block through rather than filtering by class.

**Today:** every day carrying any booking is marked, whatever its concurrency
class. Cal confirmed on 2026-09-04 that this is the wanted behaviour, so the
class is deliberately not carried through the view.

### 21. The lightbox colour exception

- [x] **ANSWERED 2026-09-04 (Alex): the exception stands.** The lightbox keeps
      its near-black scrim and white controls. It remains the only sanctioned
      departure from the semantic tokens, and the `eslint-disable` lines naming
      the reason at each site stay so a later sweep does not "fix" it.

`src/components/ui/lightbox.tsx` uses a fixed near-black scrim and white
controls rather than semantic tokens, with `eslint-disable` lines naming the
reason at each site: a photo viewer wants a neutral surround, and a white focus
ring is what reads against near-black.

**Today:** the only sanctioned token exception in the component system.

### 22. Two borderline sentences

- [x] **ANSWERED 2026-09-04 (Alex): leave all five as written.** No rewrites.
      The meet-and-greet card's "Your visit is on Cal's calendar" was flagged as
      the one that overstates — the request is still pending approval — and Alex
      chose to keep it; the eyebrow and icon beside it do say pending. The
      availability conflict keeps the generic "Couldn't save" description, since
      naming what clashed would be new copy.

"Exact total is confirmed when you book." on `/services`, and the two "coming
soon" empty states — "Photos coming soon" on `/gallery` and "Services coming
soon" on `/services`. All three are shipped copy that reads as a promise; they
were left alone rather than rewritten under the no-new-text rule.

Two more sentences in the same category, both admin- or account-side:

- The meet-and-greet booked card in
  `src/app/(onboarding)/onboarding/_components/meet-greet-step.tsx` says "Your
  visit is on Cal's calendar" for a request that is still pending approval. The
  eyebrow and icon do say pending, so it is not a false confirmation, but a
  one-sentence rewrite would read better.
- A conflict when Cal marks an availability window unavailable raises the
  shared "Couldn't save" toast with its generic description, because the
  server's conflict result carries no message of its own. Saying what actually
  conflicted would be new copy.

**Today:** all shipped and correct enough. Each is a one-line change once Cal
approves replacement wording.

### 23. Empty structured-data and social fields

- [x] **ANSWERED 2026-09-04 (Alex): leave all of it blank.** No public phone
      number in the business JSON-LD, no `sameAs` profiles, and no Instagram or
      TikTok in `src/content/socials.ts`. The structured data stays honest and
      the footer draws no dead icons. Each remains one value in one file if that
      ever changes.

`telephone` and `sameAs` are deliberately omitted from the business JSON-LD in
`src/features/seo/business.ts`. `src/content/socials.ts` holds empty strings for
Instagram and TikTok, and an empty string means the icon is not rendered rather
than rendered as a dead link.

**Today:** clean structured data with nothing invented, and no placeholder
social icons.
**Unblocks:** each is one value in one file.

### 24. The discarded `returnTo` hop

- [x] **ANSWERED 2026-09-04 (Alex): fix it, but after launch.** Deferred
      deliberately, not dropped: it touches the auth callback, which is the last
      path to change casually before going live, and it costs a new client only a
      few seconds of re-navigation. When picked up, thread the destination
      through the confirmation link and validate it with the existing
      `safeReturnTo` rather than trusting the parameter.

`safeReturnTo` validates and forwards the intended destination through sign-in,
sign-up and onboarding. The one hop that drops it is the auth callback,
`src/app/(auth)/auth/callback/route.ts`, which redirects to
`/onboarding?verified=1` (or `/claim`) and ignores anything else.

**Today:** someone who starts at a booking page, signs up, and confirms by email
lands on onboarding and then the account home rather than back at the booking
they wanted. Every other path returns them correctly.
**Unblocks:** threading the parameter through the confirmation link.

### 25. Latent dark mode

- [x] **ANSWERED 2026-09-04 (Alex): leave it dormant.** The site stays
      light-only. The dark palette and `dark` variant stay in `globals.css`
      rather than being deleted — they cost almost nothing and are the starting
      point if it is ever wanted. Accepted consequence: dark values drift as new
      colours are added without dark counterparts, so shipping it later means a
      full pass over photos, the lightbox, shadows and the paper texture, not a
      flag flip.

`src/app/globals.css` defines a full dark palette and a `dark` variant, and
nothing in the app ever sets the class.

**Today:** the site is light-only. The dark tokens cost nothing and rot slowly.
**Unblocks:** a toggle plus a pass over every surface — not a flag flip, despite
appearances.

---

## Session mechanics

### 26. Push `main`

- [ ] **Question:** push?

The session's commits are all local. `main` is 46 commits ahead of
`origin/main` at the time of writing.

**Today:** nothing has been published. The deploy has not happened.

### 27. Docker resources for the local stack

- [x] **ANSWERED 2026-09-04 (Alex): leave it.** The lean start stays the way to
      run the local stack:
      `supabase start -x vector,logflare,studio,imgproxy,edge-runtime`, and
      `supabase migration up --local` in place of a full reset. Accepted cost:
      the local database still falls over occasionally under concurrent load.
      Local development only — nothing about production depends on it.

The local Supabase stack is started lean —
`supabase start -x vector,logflare,studio,imgproxy,edge-runtime` — because two
CPUs and four gigabytes is marginal for the full set. Local development only;
nothing about production depends on it.

---

## Copy added this session

For the record, so a wording review has one place to look. Everything here is
either on the session's approved list, waiting for sign-off as an item above, or
an existing string reused verbatim.

**New, approved:** "Too many submissions. Please try again later." — the review
form's rate-limit refusal, raised by `src/features/reviews/reviews-action.ts`.
It was cleared in advance, so it needs no second look.

**New, not yet signed off:** the four email templates in item 3 and the
"Discounts" heading in item 14. Both were drafted in an existing register rather
than invented, but neither is on the approved list, which is why they are open
questions above rather than settled copy. The received email is already reaching
real clients; the heading is admin-only.

**Existing strings reused rather than written:** the inquiry rate-limit refusal
reuses "You just sent a message - please wait a moment before sending another.";
database and mutation failures reuse "Something went wrong. Please try again.";
the edit-inquiry validation failure reuses "Please check your entries and try
again."; the declined-onboarding page reuses the shipped `/book` gate wording.

**"Anonymous" is now the author fallback at both boundaries** — at the write
boundary in `reviews-action.ts`, so no new row can store an address, and at the
read boundary in `display-name.ts`, so no existing row can publish one. It was
already a shipped string, not a new one.

---

_Last reviewed: 2026-09-04_
