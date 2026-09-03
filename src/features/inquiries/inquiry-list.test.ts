import { describe, expect, it } from "vitest";

import type { InquiryRow } from "./inquiry-actions";
import {
  canEditInquiry,
  filterInquiries,
  formatInquiryDate,
} from "./inquiry-list";

function row(overrides: Partial<InquiryRow>): InquiryRow {
  return {
    id: "1",
    client_id: "c1",
    name: "Jamie Rivera",
    email: "jamie@example.com",
    phone: null,
    subject: "Weekend walks",
    message: "Do you cover weekends?",
    status: "new",
    replied_at: null,
    resolved_at: null,
    created_at: "2026-06-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("filterInquiries", () => {
  const rows = [
    row({ id: "1", subject: "Weekend walks", status: "new" }),
    row({
      id: "2",
      subject: "Holiday rates",
      message: "fourth of july",
      status: "resolved",
    }),
    row({
      id: "3",
      subject: null,
      name: "Priya Anand",
      email: "priya@example.com",
      message: "House sitting needed.",
      status: "new",
    }),
  ];

  it("filters by status", () => {
    expect(filterInquiries(rows, "", "new").map((r) => r.id)).toEqual([
      "1",
      "3",
    ]);
    expect(filterInquiries(rows, "", "resolved").map((r) => r.id)).toEqual([
      "2",
    ]);
    expect(filterInquiries(rows, "", "all")).toHaveLength(3);
  });

  it("matches case-insensitively across subject, message, name, and email", () => {
    expect(filterInquiries(rows, "WEEKEND", "all").map((r) => r.id)).toEqual([
      "1",
    ]);
    expect(filterInquiries(rows, "july", "all").map((r) => r.id)).toEqual([
      "2",
    ]);
    expect(filterInquiries(rows, "priya@", "all").map((r) => r.id)).toEqual([
      "3",
    ]);
    expect(
      filterInquiries(rows, "priya anand", "all").map((r) => r.id),
    ).toEqual(["3"]);
  });

  it("combines query and status", () => {
    expect(filterInquiries(rows, "a", "new").map((r) => r.id)).toEqual([
      "1",
      "3",
    ]);
  });
});

describe("canEditInquiry", () => {
  it("allows editing only an unanswered, still-new inquiry", () => {
    expect(canEditInquiry({ status: "new", replied_at: null })).toBe(true);
    expect(
      canEditInquiry({ status: "new", replied_at: "2026-06-02T00:00:00.000Z" }),
    ).toBe(false);
    expect(canEditInquiry({ status: "resolved", replied_at: null })).toBe(
      false,
    );
    expect(canEditInquiry({ status: "resolved", replied_at: "x" })).toBe(false);
  });
});

describe("formatInquiryDate", () => {
  it("renders a human date and time with a separator", () => {
    const out = formatInquiryDate("2026-06-03T20:14:00.000Z");
    expect(out).toMatch(/Jun\s+3,?\s+2026/);
    expect(out).toContain("·");
  });
});
