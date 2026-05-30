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
import { createServiceClient } from "@/lib/supabase/service";
import { ResendMailer } from "@/features/notifications/resend-mailer";
import { runReminderCron } from "@/features/notifications/reminder-cron";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const expected = cronSecret ? `Bearer ${cronSecret}` : null;

  if (!expected || authHeader !== expected) {
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
