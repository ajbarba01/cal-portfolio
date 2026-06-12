/**
 * What needs Cal's attention right now. The shape is the seam SP3b ships; SP5
 * wires real queries + the nav placement. Until then `emptyAttentionCounts`
 * keeps the admin nav rendering zero badges (no noise).
 */
export interface AttentionCounts {
  pendingApprovals: number;
  newInquiries: number;
  flaggedConflicts: number;
  /** Reviews submitted in the last 7 days (replaces the vestigial pending-moderation count). */
  recentReviews: number;
}

export const emptyAttentionCounts: AttentionCounts = {
  pendingApprovals: 0,
  newInquiries: 0,
  flaggedConflicts: 0,
  recentReviews: 0,
};
