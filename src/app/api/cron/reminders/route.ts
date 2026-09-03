/**
 * GET /api/cron/reminders
 *
 * Vercel cron endpoint — sends reminder emails for confirmed bookings
 * starting within the lead window. Auth-gated via CRON_SECRET bearer token.
 *
 * Security: unauthenticated requests are rejected with 401.
 * Vercel sets the Authorization header automatically when invoking cron jobs;
 * the secret must match CRON_SECRET in the deployment environment.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertCronAuth } from "@/lib/cron-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { ResendMailer, runReminderCron } from "@/features/notifications";

// Allow up to 60s: a backlog of reminder sends can exceed the default 15s.
export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!assertCronAuth(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Construct the mailer/service client inside try/catch — ResendMailer throws
  // if RESEND_API_KEY/EMAIL_FROM are unset; surface that as a 500, never an
  // unhandled exception.
  try {
    const serviceClient = createServiceClient();
    const mailer = new ResendMailer();
    const now = new Date();

    const result = await runReminderCron({ serviceClient, mailer, now });

    if (!result.ok) {
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
