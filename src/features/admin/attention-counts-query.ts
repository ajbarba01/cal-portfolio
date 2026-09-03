/**
 * Live counts behind the admin nav badges and the dashboard's attention list.
 *
 * Counted in the database (`head: true`, no rows returned) rather than by
 * listing and reducing: the badges need three integers, and the list reads they
 * replaced pulled up to a thousand inquiry and review rows on every request to
 * an admin page — twice, once for the layout and once for the dashboard.
 */

import { cache } from "react";
import type { DbClient } from "@/lib/supabase/db-client";

import { assertActorIsAdmin } from "@/lib/admin-guard";
import { getActorOrRedirect } from "@/lib/admin-session";
import { createServiceClient } from "@/lib/supabase/service";

import { emptyAttentionCounts, type AttentionCounts } from "./attention-counts";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface AttentionCountsDeps {
  serviceClient: DbClient;
  actorUserId: string;
  now: Date;
}

/** The count, or 0 with the failure logged — one bad read must not blank the rest. */
function countOrZero(
  label: string,
  result: { count: number | null; error: unknown },
): number {
  if (result.error) {
    console.error(`attention counts: ${label} read failed`, result.error);
    return 0;
  }
  return result.count ?? 0;
}

/**
 * The counts for `actorUserId`, or zeros when they are not an admin: the
 * client-resolved header reads these through a server action, so a non-admin
 * caller must resolve to zeros rather than to any real number.
 */
export async function attentionCountsCore(
  deps: AttentionCountsDeps,
): Promise<AttentionCounts> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return emptyAttentionCounts;
  }

  const reviewedSince = new Date(
    deps.now.getTime() - SEVEN_DAYS_MS,
  ).toISOString();

  const [pending, inquiries, reviews] = await Promise.all([
    // Unwindowed on purpose: a booking pends because it starts beyond the
    // auto-confirm horizon, so clamping this to the current month hid exactly
    // the bookings that need Cal.
    deps.serviceClient
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_approval"),
    deps.serviceClient
      .from("inquiries")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
    deps.serviceClient
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .gt("created_at", reviewedSince),
  ]);

  return {
    pendingApprovals: countOrZero("pending approvals", pending),
    newInquiries: countOrZero("new inquiries", inquiries),
    recentReviews: countOrZero("recent reviews", reviews),
  };
}

/**
 * The signed-in admin's attention counts, memoized for the request so the
 * layout's badges, the dashboard and the header's badge action share one set of
 * reads instead of repeating them per caller.
 */
export const getAttentionCounts = cache(
  async (): Promise<AttentionCounts> =>
    attentionCountsCore({
      serviceClient: createServiceClient(),
      actorUserId: await getActorOrRedirect(),
      now: new Date(),
    }),
);
