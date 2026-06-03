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
import { createServiceClient } from "@/lib/supabase/service";
import { runSeriesRollCron } from "@/features/booking/series-cron";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const expected = cronSecret ? `Bearer ${cronSecret}` : null;

  if (!expected || authHeader !== expected) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const serviceClient = createServiceClient();
  const now = new Date();

  const result = await runSeriesRollCron({ serviceClient, now });

  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
