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

- [ ] **Question:** may `supabase db push` run against the hosted project?

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

- [ ] **Question:** which mailbox receives Cal's alerts, and which address does
      the site send from?

`ADMIN_NOTIFICATION_EMAIL` in `.env.example` is the single gate for all three
admin alerts; `src/features/notifications/admin-alerts.ts` reads it, trims it,
and sends nothing when it is unset or blank. `EMAIL_FROM` is the sender, read by
`src/features/notifications/resend-mailer.ts`, which throws when it is missing.
A sending subdomain needs SPF, DKIM and DMARC records before Resend will
deliver reliably.

**Today:** client emails send if `EMAIL_FROM` and `RESEND_API_KEY` are set in
Vercel. Cal receives nothing at all — no new-booking, new-inquiry or
cancellation alert — because the gate is closed.
**Unblocks:** the three admin alerts, which are otherwise finished code.

### 3. Notification wording sign-off

- [ ] **Question:** does Cal approve the four templates written this session?

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

- [ ] **Question:** are the live keys and webhook secret going into Vercel, and
      does `NEXT_PUBLIC_PAYMENTS_ENABLED` flip to `true`?

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

- [ ] **Question:** Hobby or Pro?

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

- [ ] **Question:** is the current set final, and does Cal have more to add?

`public/gallery` currently holds 70 web-ready files. `npm run gallery:sync`
re-encodes raw originals, content-hashes the filenames and writes blur
placeholders into `src/content/image-placeholders.json`.
`src/features/gallery/gallery-images.ts` reads the folder at build time and
measures each file, so adding photos is a sync plus a deploy.

**Today:** the wall renders whatever is in the folder. An empty folder shows the
"Photos coming soon" empty state rather than breaking.

### 7. Gallery alt text

- [ ] **Question:** does Cal want per-photo captions?

Every image currently carries the same alt text, "A dog in Cal's care", set in
`getGalleryImages`. It is honest and non-claiming, but a screen-reader user
hears it 70 times.

**Today:** accessible, but uninformative.
**Unblocks:** real per-photo descriptions, which need one line of caption from
Cal per image and a keyed lookup beside the blur map.

### 8. References content

- [ ] **Question:** which clients have consented to be named, and which of those
      also consented to publish contact details?

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

- [ ] **Question:** may we add one short label saying what a chip does?

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

- [ ] **Question:** are the seeded rates, the stacking order and the minimum
      floor what Cal actually charges?

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

- [ ] **Question:** what should a bird-, rabbit- or reptile-only house-sit cost?

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

- [ ] **Question:** should a fish add to a house-sit total?

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

- [ ] **Question:** keep them or drop them?

Both live in the walk config as `pct_discount` with `condition: "always"` and
`manual: true` — the same shape as Kiche. The admin discount list is built from
the config rather than a hardcoded set, so the moment manual discounts became
togglable, these two appeared as toggles beside "Friends & Family (−50%)" and
"Complimentary".

**Today:** Cal sees "Off-leash discount (-15%)" and "Vetted 2nd dog (-25%)" on
every walk booking's edit page and can apply them.
**Unblocks:** if they are stale, a one-line jsonb filter migration removes them.
No code moves either way.

### 14. The "Discounts" heading

- [ ] **Question:** does the heading over the manual discount card read right?

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

- [ ] **Question:** clean the existing rows, or leave them masked?

The submit action used to fall back to the reviewer's email address when their
profile had no name. It no longer does — `src/features/reviews/reviews-action.ts`
writes "Anonymous" instead — and the public read boundary,
`abbreviateAuthorName` in `src/features/reviews/display-name.ts`, also returns
"Anonymous" for any stored name containing an `@`.

**Today:** no address can reach a public page. The addresses are still sitting
in `reviews.author_name` in the database. The mask is containment, not a fix.
**Unblocks:** a one-statement data cleanup.

### 16. Legacy `form_key` rows

- [ ] **Question:** migrate them onto current keys, or accept losing sight of
      them?

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

### 17. No Content Security Policy

- [ ] **Question:** add one before launch, or accept the current mitigation?

There is no CSP anywhere: `next.config.ts` defines no `headers()`, there is no
`middleware.ts`, and `vercel.json` carries only the crons array. The one
`dangerouslySetInnerHTML` sink in `src/` is the JSON-LD script, which is fed
auto-published review bodies, and its sole defence is a per-render escape of
`<`.

**Today:** the escape holds for the sink that exists. There is no second line
of defence if a new sink appears.
**Unblocks:** a `headers()` block is the smallest version. Worth doing before
launch rather than after.

### 18. Supabase Auth settings on the hosted project

- [ ] **Question:** turn on secure password change, shorten the OTP window, add
      a CAPTCHA?

None of these can be set by a migration — they are hosted-project settings, with
`supabase/config.toml` mirroring them for local only. There, `secure_password_change`
is `false`, `otp_expiry` is 3600 seconds, and the captcha block is commented out.
The dashboard path for the first is Authentication → Sign In / Providers →
Secure password change.

**Today:** defaults.
**Unblocks:** password changes requiring the current password, a tighter link
window, and bot pressure on the auth forms.

### 19. No `stripe_events` ledger

- [ ] **Question:** build one?

The idempotency contract the code relies on instead is documented in the header
of `src/features/payments/stripe-gateway.ts`: handlers converge on replay rather
than being deduplicated by a stored event id.

**Today:** replays are safe because each handler is convergent.
**Unblocks:** an audit trail of every event Stripe sent, which convergence does
not give you.

### 20. Availability concurrency

- [ ] **Question:** schedule the concurrency-aware version?

Overlap detection on `/admin/availability` was fixed this session; the busy-range
view it reads has no concurrency class, so
`src/app/(site)/(admin)/admin/availability/_components/availability-client.tsx`
passes every admin busy block through rather than filtering by class.

**Today:** the calendar slightly over-marks non-resident days in the month. It
is cosmetic — Cal can still select and edit those days.
**Unblocks:** carrying the class through the view narrows the marking.
Deliberately not built this session.

### 21. The lightbox colour exception

- [ ] **Question:** confirm the exception stands?

`src/components/ui/lightbox.tsx` uses a fixed near-black scrim and white
controls rather than semantic tokens, with `eslint-disable` lines naming the
reason at each site: a photo viewer wants a neutral surround, and a white focus
ring is what reads against near-black.

**Today:** the only sanctioned token exception in the component system.

### 22. Two borderline sentences

- [ ] **Question:** keep as written?

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

- [ ] **Question:** does Cal have a public phone number or social profiles to
      publish?

`telephone` and `sameAs` are deliberately omitted from the business JSON-LD in
`src/features/seo/business.ts`. `src/content/socials.ts` holds empty strings for
Instagram and TikTok, and an empty string means the icon is not rendered rather
than rendered as a dead link.

**Today:** clean structured data with nothing invented, and no placeholder
social icons.
**Unblocks:** each is one value in one file.

### 24. The discarded `returnTo` hop

- [ ] **Question:** carry the destination through email confirmation?

`safeReturnTo` validates and forwards the intended destination through sign-in,
sign-up and onboarding. The one hop that drops it is the auth callback,
`src/app/(auth)/auth/callback/route.ts`, which redirects to
`/onboarding?verified=1` (or `/claim`) and ignores anything else.

**Today:** someone who starts at a booking page, signs up, and confirms by email
lands on onboarding and then the account home rather than back at the booking
they wanted. Every other path returns them correctly.
**Unblocks:** threading the parameter through the confirmation link.

### 25. Latent dark mode

- [ ] **Question:** ship it, or leave it dormant?

`src/app/globals.css` defines a full dark palette and a `dark` variant, and
nothing in the app ever sets the class.

**Today:** the site is light-only. The dark tokens cost nothing and rot slowly.
**Unblocks:** a toggle plus a pass over every surface — not a flag flip, despite
appearances.

---

## Session mechanics

### 26. Push `main`

- [ ] **Question:** push?

The session's commits are all local. `main` is 95 commits ahead of
`origin/main` at the time of writing.

**Today:** nothing has been published. The deploy has not happened.

### 27. Docker resources for the local stack

- [ ] **Question:** raise Docker Desktop's allocation?

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

_Last reviewed: 2026-09-03_
