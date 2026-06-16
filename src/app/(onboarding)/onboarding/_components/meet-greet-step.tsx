"use client";

import { useState } from "react";
import { MeetGreetScheduler } from "@/features/accounts";
import { ApprovalWatcher } from "./approval-watcher";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import type {
  BookingRuleSettings,
  PublicBusyRange,
} from "@/features/booking/index.client";

/** Format a UTC ISO string to a human-friendly date+time in America/Denver. */
function formatDenver(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

/**
 * Onboarding step 2 — embedded meet-and-greet scheduling with two states:
 *  • no booking yet → scheduler shown directly under the intro;
 *  • booked → scheduler collapses to a status card; "View / reschedule"
 *    re-opens it inline. While booked, ApprovalWatcher subscribes to the user's
 *    profile (realtime, 60s poll fallback) so that once Cal approves, the
 *    onboarding page's server redirect moves the client to /account.
 */
export function MeetGreetStep({
  userId,
  rules,
  initialBusy,
  bookingId,
  bookingStartsAt,
}: {
  /** Signed-in user id — drives the profile-approval realtime subscription. */
  userId: string;
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
  /** Id of the active meet-greet booking, or null if none yet (drives reschedule). */
  bookingId: string | null;
  /** ISO start of the active meet-greet booking, or null if none yet. */
  bookingStartsAt: string | null;
}) {
  const [rescheduling, setRescheduling] = useState(false);
  const showScheduler = bookingStartsAt === null || rescheduling;

  return (
    <Surface variant="plain" className="flex flex-col gap-5 p-6">
      {/* Intro */}
      <div className="border-border/60 flex items-center gap-3 border-b pb-4">
        <div
          aria-hidden="true"
          className="bg-section-alt text-brand flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl"
        >
          🐾
        </div>
        <p className="text-foreground text-sm leading-relaxed">
          A free, ~30-minute in-person visit so Cal can meet you and your pets
          before your first booking.
        </p>
      </div>

      {bookingStartsAt !== null && !rescheduling ? (
        <>
          <ApprovalWatcher userId={userId} />
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="bg-status-available text-status-available-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base"
            >
              ✓
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                Meet &amp; greet confirmed
              </p>
              <p className="font-heading text-foreground text-lg font-semibold">
                {formatDenver(bookingStartsAt)}
              </p>
            </div>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your visit is on Cal&apos;s calendar.{" "}
            <span aria-hidden="true"></span> After you meet in person, Cal
            approves your account and full booking opens up — we&apos;ll email
            you.
          </p>
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => setRescheduling(true)}
          >
            View / reschedule
          </Button>
        </>
      ) : null}

      {showScheduler ? (
        <MeetGreetScheduler
          rules={rules}
          initialBusy={initialBusy}
          reschedule={
            bookingId && bookingStartsAt
              ? { bookingId, fromStartsAt: bookingStartsAt }
              : undefined
          }
          onBooked={() => setRescheduling(false)}
        />
      ) : null}
    </Surface>
  );
}
