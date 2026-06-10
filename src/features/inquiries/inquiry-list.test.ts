import { describe, expect, it } from "vitest";

import type { InquiryRow } from "./inquiry-actions";
import {
  canEditInquiry,
  filterInquiries,
  formatInquiryDate,
  paginate,
  sortByRecency,
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

describe("sortByRecency", () => {
  it("orders newest first without mutating the input", () => {
    const a = row({ id: "a", created_at: "2026-06-01T00:00:00.000Z" });
    const b = row({ id: "b", created_at: "2026-06-03T00:00:00.000Z" });
    const c = row({ id: "c", created_at: "2026-06-02T00:00:00.000Z" });
    const input = [a, b, c];
    const sorted = sortByRecency(input);
    expect(sorted.map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(input.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

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
  });

  it("combines query and status", () => {
    expect(filterInquiries(rows, "a", "new").map((r) => r.id)).toEqual([
      "1",
      "3",
    ]);
  });
});

describe("paginate", () => {
  const items = [1, 2, 3, 4, 5];

  it("slices the requested page and reports the page count", () => {
    expect(paginate(items, 1, 2)).toEqual({
      items: [1, 2],
      page: 1,
      pageCount: 3,
    });
    expect(paginate(items, 2, 2)).toEqual({
      items: [3, 4],
      page: 2,
      pageCount: 3,
    });
    expect(paginate(items, 3, 2)).toEqual({
      items: [5],
      page: 3,
      pageCount: 3,
    });
  });

  it("clamps out-of-range pages and never reports fewer than one page", () => {
    expect(paginate(items, 99, 2).page).toBe(3);
    expect(paginate(items, 0, 2).page).toBe(1);
    expect(paginate([], 1, 2)).toEqual({ items: [], page: 1, pageCount: 1 });
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
    expect(out).toContain("Jun 3, 2026");
    expect(out).toContain("·");
  });
});
