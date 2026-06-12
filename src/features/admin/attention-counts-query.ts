import type { AttentionCounts } from "./attention-counts";
import { listBookingsInRange } from "@/features/admin";
import { listInquiries } from "@/features/inquiries";
import { listReviews } from "./reviews-actions";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** The reducer only reads `.status`; keep its inputs decoupled from DB row types. */
interface StatusRow {
  status: string;
}

interface ReviewCreatedRow {
  created_at: string;
}

export function computeAttentionCounts({
  bookings,
  inquiries,
  reviews,
  now,
}: {
  bookings: StatusRow[];
  inquiries: StatusRow[];
  reviews: ReviewCreatedRow[];
  now: Date;
}): AttentionCounts {
  const pendingApprovals = bookings.filter(
    (b) => b.status === "pending_approval",
  ).length;
  const newInquiries = inquiries.filter((i) => i.status === "new").length;

  const windowStart = now.getTime() - SEVEN_DAYS_MS;
  const recentReviews = reviews.filter(
    (r) => new Date(r.created_at).getTime() > windowStart,
  ).length;

  return { pendingApprovals, newInquiries, flaggedConflicts: 0, recentReviews };
}

export async function getAttentionCounts(): Promise<AttentionCounts> {
  // Scoped to the current UTC month, mirroring the dashboard's window so the nav
  // badges and the dashboard agree. Pending-approval bookings are near-term, so
  // this window captures what needs Cal now without an extra unbounded read.
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const range = {
    startIso: new Date(Date.UTC(year, month, 1)).toISOString(),
    endIso: new Date(Date.UTC(year, month + 1, 1)).toISOString(),
  };

  const [bookingsResult, inquiriesResult, reviewsResult] = await Promise.all([
    listBookingsInRange(range),
    listInquiries(),
    listReviews(),
  ]);

  const bookings =
    bookingsResult.kind === "success" ? bookingsResult.bookings : [];
  const inquiries =
    inquiriesResult.kind === "success" ? inquiriesResult.inquiries : [];
  const reviews = reviewsResult.kind === "success" ? reviewsResult.reviews : [];

  return computeAttentionCounts({ bookings, inquiries, reviews, now });
}
