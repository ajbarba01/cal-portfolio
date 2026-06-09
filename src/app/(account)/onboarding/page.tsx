/**
 * /onboarding — stateful wizard.
 *
 * Reads onboarding_status from the signed-in user's profile (service-role, consistent
 * with the book page pattern) and renders the step that matches:
 *
 *   info_pending         → Step 1: profile + emergency info form (InfoStep client component)
 *   meet_greet_pending   → Step 2a (no active booking): schedule-your-meet-greet CTA
 *                          Step 2b (booking exists):    status card with date/time + reschedule link
 *   approved             → defensive redirect to /account (middleware handles this normally)
 *   declined             → polite "reach out" panel
 *
 * RETURNTO NOTE: safeReturnTo only allows paths under /book/. A returnTo=/onboarding
 * passed from the meet-greet booking flow would be rejected. After booking the
 * meet-greet, the user lands on the default post-booking page. When they next visit
 * /onboarding the status-card (Step 2b) renders automatically. See return-to.ts.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { InfoStep } from "./_components/info-step";

// ── Progress indicator ────────────────────────────────────────────────────────

function StepBar({ step }: { step: 1 | 2 }) {
  return (
    <div
      aria-label={`Step ${step} of 2`}
      className="mb-6 flex items-center gap-2"
    >
      <div
        className={`h-1 flex-1 rounded-full transition-colors ${step >= 1 ? "bg-brand" : "bg-border"}`}
      />
      <div
        className={`h-1 flex-1 rounded-full transition-colors ${step >= 2 ? "bg-brand" : "bg-border"}`}
      />
      <span className="text-muted-foreground ml-1 text-xs tabular-nums">
        {step} / 2
      </span>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const returnToParam = sp.returnTo;
  const returnTo =
    typeof returnToParam === "string" ? returnToParam : undefined;

  // Auth check — mirror account layout pattern.
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) redirect("/login");

  // Read profile via service role — consistent with book page pattern.
  const svc = createServiceClient();

  const { data: profile } = await svc
    .from("profiles")
    .select("onboarding_status")
    .eq("id", user.id)
    .single();

  const status =
    (profile?.onboarding_status as string | null) ?? "info_pending";

  // Approved users should not land here (middleware redirects them), but defend.
  if (status === "approved") {
    redirect("/account");
  }

  // For meet_greet_pending: check for an active (pending or confirmed) meet-and-greet booking.
  let activeBookingStartsAt: string | null = null;

  if (status === "meet_greet_pending") {
    const { data: bookingRow } = await svc
      .from("bookings")
      .select("starts_at, services!inner(slug)")
      .eq("client_id", user.id)
      .eq("services.slug", "meet-greet")
      .in("status", ["pending_approval", "confirmed"])
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(1)
      .single();

    activeBookingStartsAt =
      typeof bookingRow?.starts_at === "string" ? bookingRow.starts_at : null;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (status === "info_pending") {
    return (
      <PageContainer width="read" className="py-10">
        <StepBar step={1} />
        <PageHeader
          title="Welcome — let's get you set up"
          subtitle="Fill in your profile and emergency info before booking."
        />
        <InfoStep returnTo={returnTo} />
      </PageContainer>
    );
  }

  if (status === "meet_greet_pending" && !activeBookingStartsAt) {
    return (
      <PageContainer width="read" className="py-10">
        <StepBar step={2} />
        <PageHeader
          title="Schedule your meet &amp; greet"
          subtitle="Before your first booking, Cal comes by to meet you and your pets in person."
        />

        <div className="bg-card border-border flex flex-col gap-4 rounded-xl border p-6">
          {/* Paw icon accent */}
          <div
            aria-hidden="true"
            className="bg-section-alt text-brand flex h-14 w-14 items-center justify-center rounded-full text-2xl"
          >
            🐾
          </div>

          <p className="text-foreground text-sm leading-relaxed">
            It&apos;s a free, ~30-minute in-person visit so Cal can meet you and
            your pets before your first booking. Pick any open slot that works
            for you.
          </p>

          <Link
            href="/book/meet-greet"
            className={cn(buttonVariants(), "mt-2 w-full sm:w-auto")}
          >
            Pick a time →
          </Link>

          <p className="text-muted-foreground text-xs">
            After the visit, Cal will confirm you and your bookings will open
            up.
          </p>
        </div>
      </PageContainer>
    );
  }

  if (status === "meet_greet_pending" && activeBookingStartsAt) {
    const formattedDate = formatDenver(activeBookingStartsAt);

    return (
      <PageContainer width="read" className="py-10">
        <StepBar step={2} />
        <PageHeader
          title="You're booked"
          subtitle="Cal will confirm you after the visit — then your bookings open up."
        />

        {/* Status card */}
        <div className="bg-card border-border flex flex-col gap-5 rounded-xl border p-6">
          {/* Confirmation row */}
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="bg-status-available text-status-available-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base"
            >
              ✓
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                Meet &amp; greet booked
              </p>
              <p className="font-heading text-foreground text-lg font-semibold">
                {formattedDate}
              </p>
            </div>
          </div>

          {/* Awaiting badge */}
          <div>
            <Badge variant="pending">
              <span aria-hidden="true">⏳</span> Awaiting Cal&apos;s
              confirmation
            </Badge>
          </div>

          <p className="text-muted-foreground text-sm leading-relaxed">
            After your visit, Cal will confirm you and your booking opens up.
            We&apos;ll email you.
          </p>

          {/* Reschedule link */}
          <Link
            href="/account/bookings"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "w-full sm:w-auto",
            )}
          >
            View or reschedule
          </Link>
        </div>
      </PageContainer>
    );
  }

  // declined (or any unrecognised future status). Copy is Cal's voice → placeholders.
  return (
    <PageContainer width="read" className="py-10">
      <PageHeader
        title="[[HEADER: declined onboarding — invite the client to contact Cal]]"
        subtitle="[[BODY: declined onboarding — ask the client to reach out to Cal to sort it out]]"
      />
      <div className="bg-card border-border flex flex-col gap-5 rounded-xl border p-6">
        {/* Illustration accent */}
        <div
          aria-hidden="true"
          className="bg-section-alt flex h-14 w-14 items-center justify-center rounded-full text-2xl"
        >
          ✉️
        </div>

        <Link
          href="/contact"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-full sm:w-auto",
          )}
        >
          Contact Cal
        </Link>
      </div>
    </PageContainer>
  );
}
