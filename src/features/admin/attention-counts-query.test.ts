import { describe, expect, it } from "vitest";
import { computeAttentionCounts } from "./attention-counts-query";

describe("computeAttentionCounts", () => {
  it("counts pending approvals and new inquiries; conflicts always 0", () => {
    const now = new Date("2026-06-12T12:00:00Z");
    const counts = computeAttentionCounts({
      bookings: [
        { status: "pending_approval" },
        { status: "confirmed" },
        { status: "pending_approval" },
      ],
      inquiries: [{ status: "new" }, { status: "resolved" }],
      reviews: [],
      now,
    });
    expect(counts).toEqual({
      pendingApprovals: 2,
      newInquiries: 1,
      flaggedConflicts: 0,
      recentReviews: 0,
    });
  });

  it("returns all zeros for empty arrays", () => {
    const now = new Date("2026-06-12T12:00:00Z");
    const counts = computeAttentionCounts({
      bookings: [],
      inquiries: [],
      reviews: [],
      now,
    });
    expect(counts).toEqual({
      pendingApprovals: 0,
      newInquiries: 0,
      flaggedConflicts: 0,
      recentReviews: 0,
    });
  });

  it("treats unknown statuses as non-matching", () => {
    const now = new Date("2026-06-12T12:00:00Z");
    const counts = computeAttentionCounts({
      bookings: [{ status: "confirmed" }, { status: "cancelled" }],
      inquiries: [{ status: "resolved" }, { status: "replied" }],
      reviews: [],
      now,
    });
    expect(counts).toEqual({
      pendingApprovals: 0,
      newInquiries: 0,
      flaggedConflicts: 0,
      recentReviews: 0,
    });
  });

  it("counts reviews created within the last 7 days", () => {
    const now = new Date("2026-06-12T12:00:00Z");
    // 3 days ago — within window
    const recent = new Date("2026-06-09T08:00:00Z").toISOString();
    // 8 days ago — outside window
    const old = new Date("2026-06-04T08:00:00Z").toISOString();
    const counts = computeAttentionCounts({
      bookings: [],
      inquiries: [],
      reviews: [
        { created_at: recent },
        { created_at: recent },
        { created_at: old },
      ],
      now,
    });
    expect(counts).toEqual({
      pendingApprovals: 0,
      newInquiries: 0,
      flaggedConflicts: 0,
      recentReviews: 2,
    });
  });

  it("excludes reviews on the 7-day boundary (exactly 7 days ago is outside)", () => {
    const now = new Date("2026-06-12T12:00:00Z");
    // Exactly 7 days ago
    const boundary = new Date("2026-06-05T12:00:00Z").toISOString();
    // 6 days 23 h ago — still inside
    const inside = new Date("2026-06-05T13:00:00Z").toISOString();
    const counts = computeAttentionCounts({
      bookings: [],
      inquiries: [],
      reviews: [{ created_at: boundary }, { created_at: inside }],
      now,
    });
    expect(counts.recentReviews).toBe(1);
  });
});
