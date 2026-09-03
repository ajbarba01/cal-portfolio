/**
 * GET /api/cron/series-roll
 *
 * Vercel cron endpoint — promotes in-horizon pending bookings to confirmed and
 * extends active recurring series. Auth-gated via CRON_SECRET bearer token.
 *
 * Security: unauthenticated requests are rejected with 401.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertCronAuth } from "@/lib/cron-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { runSeriesRollCron } from "@/features/booking";

// Allow up to 60s: promoting a day of bookings sends confirmation mail per
// booking, which can exceed the default 15s.
export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!assertCronAuth(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Construct the service client inside try/catch — it throws when the Supabase
  // env vars are unset; surface that as a 500, never an unhandled exception.
  try {
    const serviceClient = createServiceClient();
    const now = new Date();

    const result = await runSeriesRollCron({ serviceClient, now });

    if (!result.ok) {
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
