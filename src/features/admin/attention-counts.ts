/**
 * What needs Cal's attention right now: the counts behind the admin nav badges
 * and the dashboard's attention list, plus the mapping from those counts to the
 * badges the app shell renders.
 */
export interface AttentionCounts {
  /** Bookings awaiting approval, whatever month they start in. */
  pendingApprovals: number;
  newInquiries: number;
  /** Reviews submitted in the last 7 days. */
  recentReviews: number;
}

/** All zeros — what a caller who is not an admin sees. */
export const emptyAttentionCounts: AttentionCounts = {
  pendingApprovals: 0,
  newInquiries: 0,
  recentReviews: 0,
};

/**
 * Badge counts keyed by nav href. Structurally the `NavBadges` the app shell
 * takes, declared here so the feature does not import the component layer.
 */
export type NavBadgeMap = Record<string, { count: number; label: string }>;

/**
 * The admin nav badges for `counts`. One mapping for both shells — the
 * server-rendered sidebar and the client-resolved mobile drawer each used to
 * build their own copy of it.
 */
export function navBadgesFor(counts: AttentionCounts): NavBadgeMap {
  return {
    "/admin/bookings": {
      count: counts.pendingApprovals,
      label: "awaiting approval",
    },
    "/admin/inquiries": { count: counts.newInquiries, label: "new" },
  };
}
