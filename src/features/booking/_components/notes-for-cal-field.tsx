"use client";

/**
 * NotesForCalSection — the shared "Notes for Cal" step used by all three
 * booking surfaces (public create, admin create-on-behalf, account edit).
 * Renders the step head, the Textarea, and a live character counter against
 * BOOKING_COMMENTS_MAX (the same limit the server enforces).
 */

import { Textarea } from "@/components/ui/textarea";
import { CharCounter } from "@/components/ui/char-counter";
import { BOOKING_COMMENTS_MAX } from "../booking-service-shared";
import { BookingFlowStepHead } from "./booking-flow";

export function NotesForCalSection({
  id,
  num,
  value,
  onChange,
  placeholder,
}: {
  /** Unique textarea id per surface (label + counter ids derive from it). */
  id: string;
  /** Step number label, matching the surface's step sequence. */
  num: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const headingId = `${id}-heading`;
  const counterId = `${id}-counter`;
  return (
    <section aria-labelledby={headingId}>
      <BookingFlowStepHead
        num={num}
        label="Notes for Cal"
        labelId={headingId}
        hint="optional"
      />
      <label htmlFor={id} className="sr-only">
        Notes for Cal
      </label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={BOOKING_COMMENTS_MAX}
        aria-describedby={counterId}
        placeholder={placeholder}
      />
      <CharCounter
        id={counterId}
        value={value}
        max={BOOKING_COMMENTS_MAX}
        className="mt-1 text-right"
      />
    </section>
  );
}
