/**
 * /onboarding — stateful wizard.
 *
 * Reads onboarding_status from the signed-in user's profile (service-role, consistent
 * with the book page pattern) and renders the step that matches:
 *
 *   info_pending         → Step 1: profile + emergency info form (InfoStep client component)
 *   meet_greet_pending   → Step 2: MeetGreetStep — embedded meet-greet scheduler
 *                          (collapses to a booked status card once a visit exists;
 *                          "View / reschedule" re-opens it inline)
 *   approved             → defensive redirect to /account (middleware handles this normally)
 *   declined             → polite "reach out" panel
 *
 * The booked card polls (RefreshOnInterval) so that once Cal approves, the next
 * server render hits the approved → /account redirect and moves the client on.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InfoStep } from "./_components/info-step";
import { MeetGreetStep } from "./_components/meet-greet-step";
import { loadBookingFormData } from "@/features/booking";

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
  let activeBookingId: string | null = null;
  let activeBookingStartsAt: string | null = null;

  if (status === "meet_greet_pending") {
    const { data: bookingRow } = await svc
      .from("bookings")
      .select("id, starts_at, services!inner(slug)")
      .eq("client_id", user.id)
      .eq("services.slug", "meet-greet")
      .in("status", ["pending_approval", "confirmed"])
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(1)
      .single();

    activeBookingId = typeof bookingRow?.id === "string" ? bookingRow.id : null;
    activeBookingStartsAt =
      typeof bookingRow?.starts_at === "string" ? bookingRow.starts_at : null;
  }

  // Load booking rules + busy ranges for the embedded meet-greet scheduler.
  let meetGreetFormData: Awaited<
    ReturnType<typeof loadBookingFormData>
  > | null = null;
  if (status === "meet_greet_pending") {
    meetGreetFormData = await loadBookingFormData("meet-greet");
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

  if (status === "meet_greet_pending") {
    if (!meetGreetFormData || !meetGreetFormData.ok) {
      return (
        <PageContainer width="app" className="py-10">
          <StepBar step={2} />
          <p className="text-destructive">
            Could not load scheduling. Please try again later.
          </p>
        </PageContainer>
      );
    }
    return (
      <PageContainer width="app" className="py-10">
        <StepBar step={2} />
        <PageHeader
          title="Schedule your meet &amp; greet"
          subtitle="Before your first booking, Cal comes by to meet you and your pets in person."
        />
        <MeetGreetStep
          rules={meetGreetFormData.data.rules}
          initialBusy={meetGreetFormData.data.initialBusy}
          bookingId={activeBookingId}
          bookingStartsAt={activeBookingStartsAt}
        />
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
