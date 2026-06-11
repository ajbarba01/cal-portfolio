import type { AttentionCounts } from "./attention-counts";
import { listBookingsInRange } from "@/features/admin";
import { listInquiries } from "@/features/inquiries";

/** The reducer only reads `.status`; keep its inputs decoupled from DB row types. */
interface StatusRow {
  status: string;
}

export function computeAttentionCounts({
  bookings,
  inquiries,
}: {
  bookings: StatusRow[];
  inquiries: StatusRow[];
}): AttentionCounts {
  const pendingApprovals = bookings.filter(
    (b) => b.status === "pending_approval",
  ).length;
  const newInquiries = inquiries.filter((i) => i.status === "new").length;
  return { pendingApprovals, newInquiries, flaggedConflicts: 0 };
}

export async function getAttentionCounts(): Promise<AttentionCounts> {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const range = {
    startIso: new Date(Date.UTC(year, month, 1)).toISOString(),
    endIso: new Date(Date.UTC(year, month + 1, 1)).toISOString(),
  };

  const [bookingsResult, inquiriesResult] = await Promise.all([
    listBookingsInRange(range),
    listInquiries(),
  ]);

  const bookings =
    bookingsResult.kind === "success" ? bookingsResult.bookings : [];
  const inquiries =
    inquiriesResult.kind === "success" ? inquiriesResult.inquiries : [];

  return computeAttentionCounts({ bookings, inquiries });
}
