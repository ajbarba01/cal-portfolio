"use client";

/**
 * BookClient — the interactive /book flow.
 *
 * Renders: service picker → slot calendar → per-type quantity inputs →
 * weekly-recurring toggle → "Get quote" → itemized preview → Submit.
 *
 * KNOWN LIMITATION (do not attempt to fix here):
 * useAvailability reads `bookings` via the RLS-scoped browser client, so it
 * only sees the viewer's OWN bookings — it cannot subtract other clients' busy
 * slots from the public display. The DB exclusion constraint is the real arbiter
 * at submit (`slot_taken`). Accurate public busy-slot display would need a
 * service-role endpoint — out of scope for this wireframe.
 */

import { useState, useTransition } from "react";
import { useAvailability } from "@/features/booking/use-availability";
import { createBooking } from "@/features/booking/actions";
import { previewQuote } from "@/features/booking/quote-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createResultMessage, previewResultMessage } from "./messages";
import type { UserMessage, MessageTone } from "./messages";
import type { ServiceOption } from "../page";
import type { BookingRuleSettings } from "@/features/booking/availability";
import type { BookingQuotePreview } from "@/features/booking/booking-service";
import type { CreateBookingResult } from "@/features/booking/actions";
import type { PreviewActionResult } from "@/features/booking/quote-action";

// ── Constants ─────────────────────────────────────────────────────────────────

const DENVER_TZ = "America/Denver";
const DEFAULT_DURATION_MS = 60 * 60 * 1000; // 60 min fallback

// ── Helpers ───────────────────────────────────────────────────────────────────

function centsToDollars(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function formatSlotLabel(slot: { startsAt: Date; endsAt: Date }): string {
  const fmt = (d: Date) =>
    d.toLocaleString("en-US", {
      timeZone: DENVER_TZ,
      month: "short",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  return `${fmt(slot.startsAt)} – ${fmt(slot.endsAt)}`;
}

// ── Per-type quantity forms ───────────────────────────────────────────────────

interface HouseSittingQty {
  dogs: number;
  cats: number;
  nights: number;
  cantBeLeftAloneDays: number;
  walkMinutesPerDay: number;
  holidayDays: number;
}

interface SimpleHoursQty {
  hours: number;
}

interface WalkQty {
  hours: number;
  dogs: number;
}

type QuantityState =
  | { type: "house_sitting"; qty: HouseSittingQty }
  | { type: "check_in"; qty: SimpleHoursQty }
  | { type: "walk"; qty: WalkQty }
  | { type: "training"; qty: SimpleHoursQty };

function defaultQuantities(
  pricingType: ServiceOption["pricing_type"],
): QuantityState {
  switch (pricingType) {
    case "house_sitting":
      return {
        type: "house_sitting",
        qty: {
          dogs: 1,
          cats: 0,
          nights: 1,
          cantBeLeftAloneDays: 0,
          walkMinutesPerDay: 0,
          holidayDays: 0,
        },
      };
    case "check_in":
      return { type: "check_in", qty: { hours: 1 } };
    case "walk":
      return { type: "walk", qty: { hours: 1, dogs: 1 } };
    case "training":
      return { type: "training", qty: { hours: 1 } };
  }
}

/** Converts the local QuantityState to the wire Record<string, unknown>. */
function quantitiesToRecord(qs: QuantityState): Record<string, unknown> {
  switch (qs.type) {
    case "house_sitting": {
      const {
        dogs,
        cats,
        nights,
        cantBeLeftAloneDays,
        walkMinutesPerDay,
        holidayDays,
      } = qs.qty;
      const rec: Record<string, unknown> = { dogs, cats, nights };
      if (cantBeLeftAloneDays > 0)
        rec.cantBeLeftAloneDays = cantBeLeftAloneDays;
      if (walkMinutesPerDay > 0) rec.walkMinutesPerDay = walkMinutesPerDay;
      if (holidayDays > 0) rec.holidayDays = holidayDays;
      return rec;
    }
    case "check_in":
    case "training":
      return { hours: qs.qty.hours };
    case "walk":
      return { hours: qs.qty.hours, dogs: qs.qty.dogs };
  }
}

// ── Sub-components for quantity inputs ────────────────────────────────────────

function NumberField({
  id,
  label,
  value,
  min,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        value={value}
        min={min ?? 0}
        step={step ?? 1}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onChange(n);
        }}
        className="w-28"
      />
    </div>
  );
}

function HouseSittingForm({
  qty,
  onChange,
}: {
  qty: HouseSittingQty;
  onChange: (q: HouseSittingQty) => void;
}) {
  const set = (patch: Partial<HouseSittingQty>) =>
    onChange({ ...qty, ...patch });
  return (
    <fieldset className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <legend className="col-span-full mb-2 text-sm font-medium">
        Stay details
      </legend>
      <NumberField
        id="hs-dogs"
        label="Dogs"
        value={qty.dogs}
        min={1}
        onChange={(v) => set({ dogs: Math.round(v) })}
      />
      <NumberField
        id="hs-cats"
        label="Cats"
        value={qty.cats}
        min={0}
        onChange={(v) => set({ cats: Math.round(v) })}
      />
      <NumberField
        id="hs-nights"
        label="Nights"
        value={qty.nights}
        min={1}
        step={0.5}
        onChange={(v) => set({ nights: v })}
      />
      <NumberField
        id="hs-cant-alone"
        label="Can't-be-left-alone days"
        value={qty.cantBeLeftAloneDays}
        min={0}
        onChange={(v) => set({ cantBeLeftAloneDays: Math.round(v) })}
      />
      <NumberField
        id="hs-walk-min"
        label="Walk min/day"
        value={qty.walkMinutesPerDay}
        min={0}
        step={15}
        onChange={(v) => set({ walkMinutesPerDay: v })}
      />
      <NumberField
        id="hs-holiday"
        label="Holiday days"
        value={qty.holidayDays}
        min={0}
        onChange={(v) => set({ holidayDays: Math.round(v) })}
      />
    </fieldset>
  );
}

function WalkForm({
  qty,
  onChange,
}: {
  qty: WalkQty;
  onChange: (q: WalkQty) => void;
}) {
  return (
    <fieldset className="flex flex-wrap gap-4">
      <legend className="mb-2 w-full text-sm font-medium">Walk details</legend>
      <NumberField
        id="walk-hours"
        label="Hours"
        value={qty.hours}
        min={0.25}
        step={0.25}
        onChange={(v) => onChange({ ...qty, hours: v })}
      />
      <NumberField
        id="walk-dogs"
        label="Dogs"
        value={qty.dogs}
        min={1}
        onChange={(v) => onChange({ ...qty, dogs: Math.round(v) })}
      />
    </fieldset>
  );
}

function SimpleHoursForm({
  id,
  qty,
  onChange,
}: {
  id: string;
  qty: SimpleHoursQty;
  onChange: (q: SimpleHoursQty) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Duration</legend>
      <NumberField
        id={id}
        label="Hours"
        value={qty.hours}
        min={0.25}
        step={0.25}
        onChange={(v) => onChange({ hours: v })}
      />
    </fieldset>
  );
}

// ── Message banner ─────────────────────────────────────────────────────────────

function MessageBanner({ message }: { message: UserMessage }) {
  const base = "rounded-lg border px-4 py-3 text-sm";
  const classes: Record<MessageTone, string> = {
    success: `${base} border-border bg-muted text-foreground`,
    error: `${base} border-destructive/40 bg-destructive/10 text-destructive`,
    info: `${base} border-border bg-muted text-muted-foreground`,
  };

  // Text is rendered as plain text (auto-escaped by React). Structured actions
  // (e.g. the login CTA) become real elements — no HTML is ever injected.
  return (
    <div role="alert" className={classes[message.tone]}>
      {message.text}
      {message.action === "login" && (
        <>
          {" "}
          <a
            href="/login"
            className="text-foreground underline underline-offset-2"
          >
            Log in
          </a>
        </>
      )}
    </div>
  );
}

// ── Quote breakdown ────────────────────────────────────────────────────────────

function QuotePanel({ preview }: { preview: BookingQuotePreview }) {
  return (
    <section
      aria-label="Price estimate"
      className="border-border bg-card text-card-foreground rounded-lg border p-4"
    >
      <h2 className="mb-3 text-sm font-semibold">Price estimate</h2>
      <ul className="space-y-1 text-sm">
        {preview.breakdown.lines.map((line, i) => (
          <li key={i} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{line.label}</span>
            <span>{centsToDollars(line.amountCents)}</span>
          </li>
        ))}
      </ul>
      <div className="border-border mt-3 flex justify-between border-t pt-3 font-medium">
        <span>Total</span>
        <span>{centsToDollars(preview.finalCents)}</span>
      </div>
      {preview.requiresApproval && (
        <p className="text-muted-foreground mt-2 text-xs">
          This booking requires Cal&apos;s approval before it is confirmed.
        </p>
      )}
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface BookClientProps {
  services: ServiceOption[];
  rules: BookingRuleSettings;
}

export function BookClient({ services, rules }: BookClientProps) {
  // ── State ──────────────────────────────────────────────────────────────────

  const [selectedSlug, setSelectedSlug] = useState<string>(
    services[0]?.slug ?? "",
  );
  const [selectedSlot, setSelectedSlot] = useState<{
    startsAt: Date;
    endsAt: Date;
  } | null>(null);
  const [quantities, setQuantities] = useState<QuantityState | null>(null);
  const [recurringOn, setRecurringOn] = useState(false);
  const [occurrenceCount, setOccurrenceCount] = useState(4);

  const [quote, setQuote] = useState<BookingQuotePreview | null>(null);
  const [previewMsg, setPreviewMsg] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [submitMsg, setSubmitMsg] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [submitDone, setSubmitDone] = useState(false);

  const [isPreviewing, startPreviewing] = useTransition();
  const [isSubmitting, startSubmitting] = useTransition();

  // ── Derived values ─────────────────────────────────────────────────────────

  const selectedService = services.find((s) => s.slug === selectedSlug) ?? null;

  /** Duration in ms for the selected service + quantities. */
  const durationMs = (() => {
    if (!selectedService) return DEFAULT_DURATION_MS;
    if (
      selectedService.pricing_type === "house_sitting" &&
      quantities?.type === "house_sitting"
    ) {
      // house_sitting: nights × 24 h
      return quantities.qty.nights * 24 * 60 * 60 * 1000;
    }
    return (selectedService.default_duration_min ?? 60) * 60 * 1000;
  })();

  // ── useAvailability hook ───────────────────────────────────────────────────

  const {
    openSlots,
    loading: slotsLoading,
    error: slotsError,
  } = useAvailability({ durationMs, rules });

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleServiceChange(slug: string) {
    setSelectedSlug(slug);
    setSelectedSlot(null);
    setQuantities(null);
    setQuote(null);
    setPreviewMsg(null);
    setSubmitMsg(null);
    setSubmitDone(false);
    const svc = services.find((s) => s.slug === slug);
    if (svc) setQuantities(defaultQuantities(svc.pricing_type));
  }

  // Initialise quantities when service first selected (on mount).
  if (selectedService && quantities === null) {
    setQuantities(defaultQuantities(selectedService.pricing_type));
  }

  function handleSlotSelect(slot: { startsAt: Date; endsAt: Date }) {
    setSelectedSlot(slot);
    setQuote(null);
    setPreviewMsg(null);
    setSubmitMsg(null);
    setSubmitDone(false);
  }

  function handleGetQuote() {
    if (!selectedService || !selectedSlot || !quantities) return;

    const endsAt = new Date(selectedSlot.startsAt.getTime() + durationMs);
    const input = {
      serviceSlug: selectedService.slug,
      startsAt: selectedSlot.startsAt,
      endsAt,
      quantities: quantitiesToRecord(quantities),
      recurringRule: recurringOn
        ? { freq: "weekly" as const, interval: 1, count: occurrenceCount }
        : null,
    };

    startPreviewing(async () => {
      const result: PreviewActionResult = await previewQuote(input);
      const out = previewResultMessage(result);
      if (out.kind === "quote") {
        setQuote(out.preview);
        setPreviewMsg(null);
      } else {
        setQuote(null);
        setPreviewMsg(out.message);
      }
    });
  }

  function handleSubmit() {
    if (!selectedService || !selectedSlot || !quantities) return;

    const endsAt = new Date(selectedSlot.startsAt.getTime() + durationMs);
    const input = {
      serviceSlug: selectedService.slug,
      startsAt: selectedSlot.startsAt,
      endsAt,
      quantities: quantitiesToRecord(quantities),
      recurringRule: recurringOn
        ? { freq: "weekly" as const, interval: 1, count: occurrenceCount }
        : null,
    };

    startSubmitting(async () => {
      const result: CreateBookingResult = await createBooking(input);
      const requiresApproval = quote?.requiresApproval ?? true;
      const msg = createResultMessage(result, requiresApproval);
      setSubmitMsg(msg);
      if (result.kind === "success") {
        setSubmitDone(true);
      }
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (services.length === 0) {
    return (
      <p className="text-muted-foreground">
        No services are currently available. Check back soon.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ── 1. Service picker ──────────────────────────────────────────────── */}
      <section aria-labelledby="service-heading">
        <h2 id="service-heading" className="mb-3 text-sm font-semibold">
          1. Choose a service
        </h2>
        <div className="flex flex-col gap-1">
          <Label htmlFor="service-select">Service</Label>
          <select
            id="service-select"
            value={selectedSlug}
            onChange={(e) => handleServiceChange(e.target.value)}
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 rounded-lg border bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:ring-3"
          >
            {services.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
          {selectedService?.description && (
            <p className="text-muted-foreground mt-1 text-xs">
              {selectedService.description}
            </p>
          )}
        </div>
      </section>

      {/* ── 2. Quantity inputs ─────────────────────────────────────────────── */}
      {quantities !== null && (
        <section aria-labelledby="qty-heading">
          <h2 id="qty-heading" className="mb-3 text-sm font-semibold">
            2. Details
          </h2>
          {quantities.type === "house_sitting" && (
            <HouseSittingForm
              qty={quantities.qty}
              onChange={(q) => {
                setQuantities({ type: "house_sitting", qty: q });
                setQuote(null);
                setPreviewMsg(null);
              }}
            />
          )}
          {quantities.type === "walk" && (
            <WalkForm
              qty={quantities.qty}
              onChange={(q) => {
                setQuantities({ type: "walk", qty: q });
                setQuote(null);
                setPreviewMsg(null);
              }}
            />
          )}
          {quantities.type === "check_in" && (
            <SimpleHoursForm
              id="checkin-hours"
              qty={quantities.qty}
              onChange={(q) => {
                setQuantities({ type: "check_in", qty: q });
                setQuote(null);
                setPreviewMsg(null);
              }}
            />
          )}
          {quantities.type === "training" && (
            <SimpleHoursForm
              id="training-hours"
              qty={quantities.qty}
              onChange={(q) => {
                setQuantities({ type: "training", qty: q });
                setQuote(null);
                setPreviewMsg(null);
              }}
            />
          )}
        </section>
      )}

      {/* ── 3. Slot picker ─────────────────────────────────────────────────── */}
      <section aria-labelledby="slot-heading">
        <h2 id="slot-heading" className="mb-3 text-sm font-semibold">
          3. Pick a time
        </h2>
        {slotsLoading && (
          <p className="text-muted-foreground text-sm">Loading availability…</p>
        )}
        {slotsError && (
          <MessageBanner message={{ tone: "error", text: slotsError }} />
        )}
        {!slotsLoading && !slotsError && openSlots.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No open slots right now. Check back later or contact Cal directly.
          </p>
        )}
        {!slotsLoading && openSlots.length > 0 && (
          <ul
            role="listbox"
            aria-label="Available time slots"
            className="flex flex-col gap-2"
          >
            {openSlots.slice(0, 20).map((slot, i) => {
              const isSelected =
                selectedSlot?.startsAt.getTime() === slot.startsAt.getTime();
              return (
                <li key={i} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => handleSlotSelect(slot)}
                    className={
                      "focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-lg border px-4 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-3 " +
                      (isSelected
                        ? "border-foreground bg-secondary text-secondary-foreground"
                        : "border-border bg-background hover:bg-muted")
                    }
                  >
                    {formatSlotLabel(slot)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── 4. Weekly recurring toggle ─────────────────────────────────────── */}
      <section aria-labelledby="recur-heading">
        <h2 id="recur-heading" className="mb-3 text-sm font-semibold">
          4. Recurring (optional)
        </h2>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <input
              id="recurring-toggle"
              type="checkbox"
              checked={recurringOn}
              onChange={(e) => {
                setRecurringOn(e.target.checked);
                setQuote(null);
                setPreviewMsg(null);
              }}
              className="border-border accent-foreground focus-visible:outline-ring h-4 w-4 rounded focus-visible:outline-2"
            />
            <Label htmlFor="recurring-toggle">Repeat weekly</Label>
          </div>
          {recurringOn && (
            <div className="ml-7 flex flex-col gap-1">
              <Label htmlFor="occurrence-count">Number of weeks</Label>
              <Input
                id="occurrence-count"
                type="number"
                value={occurrenceCount}
                min={2}
                max={52}
                step={1}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!isNaN(n) && n >= 2) {
                    setOccurrenceCount(n);
                    setQuote(null);
                    setPreviewMsg(null);
                  }
                }}
                className="w-28"
              />
              <p className="text-muted-foreground text-xs">
                Books {occurrenceCount} weekly occurrences starting from
                selected slot.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── 5. Get quote ───────────────────────────────────────────────────── */}
      <section aria-labelledby="quote-heading">
        <h2 id="quote-heading" className="mb-3 text-sm font-semibold">
          5. Get a price estimate
        </h2>
        <Button
          variant="outline"
          onClick={handleGetQuote}
          disabled={!selectedSlot || isPreviewing || isSubmitting || submitDone}
        >
          {isPreviewing ? "Loading…" : "Get quote"}
        </Button>

        {previewMsg && (
          <div className="mt-4">
            <MessageBanner message={previewMsg} />
          </div>
        )}

        {quote && (
          <div className="mt-4">
            <QuotePanel preview={quote} />
          </div>
        )}
      </section>

      {/* ── 6. Submit ──────────────────────────────────────────────────────── */}
      {!submitDone && (
        <section aria-labelledby="submit-heading">
          <h2 id="submit-heading" className="mb-3 text-sm font-semibold">
            6. Confirm booking
          </h2>
          <Button
            onClick={handleSubmit}
            disabled={!selectedSlot || !quote || isSubmitting || isPreviewing}
          >
            {isSubmitting ? "Submitting…" : "Book now"}
          </Button>
          {!quote && (
            <p className="text-muted-foreground mt-2 text-xs">
              Get a quote first to enable booking.
            </p>
          )}
        </section>
      )}

      {/* ── Submit result ──────────────────────────────────────────────────── */}
      {submitMsg && (
        <div role="status" aria-live="polite">
          <MessageBanner message={submitMsg} />
        </div>
      )}
    </div>
  );
}
