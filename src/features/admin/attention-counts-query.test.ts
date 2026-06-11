import { describe, expect, it } from "vitest";
import { computeAttentionCounts } from "./attention-counts-query";

describe("computeAttentionCounts", () => {
  it("counts pending approvals and new inquiries; conflicts always 0", () => {
    const counts = computeAttentionCounts({
      bookings: [
        { status: "pending_approval" },
        { status: "confirmed" },
        { status: "pending_approval" },
      ],
      inquiries: [{ status: "new" }, { status: "resolved" }],
    });
    expect(counts).toEqual({
      pendingApprovals: 2,
      newInquiries: 1,
      flaggedConflicts: 0,
    });
  });

  it("returns all zeros for empty arrays", () => {
    const counts = computeAttentionCounts({ bookings: [], inquiries: [] });
    expect(counts).toEqual({
      pendingApprovals: 0,
      newInquiries: 0,
      flaggedConflicts: 0,
    });
  });

  it("treats unknown statuses as non-matching", () => {
    const counts = computeAttentionCounts({
      bookings: [{ status: "confirmed" }, { status: "cancelled" }],
      inquiries: [{ status: "resolved" }, { status: "replied" }],
    });
    expect(counts).toEqual({
      pendingApprovals: 0,
      newInquiries: 0,
      flaggedConflicts: 0,
    });
  });
});
