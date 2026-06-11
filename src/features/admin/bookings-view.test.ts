import { describe, expect, it } from "vitest";

import type { BookingCalendarRow } from "./bookings-calendar-actions";
import { daysWithMatch, filterBookings, isolate } from "./bookings-view";

// ── fixtures ──────────────────────────────────────────────────────────────────

function row(
  overrides: Partial<BookingCalendarRow> & { id: string },
): BookingCalendarRow {
  return {
    id: overrides.id,
    client_id: overrides.client_id ?? "client-1",
    client_name: overrides.client_name ?? "Jane Doe",
    service_name: overrides.service_name ?? "Dog Walk",
    status: overrides.status ?? "confirmed",
    starts_at: overrides.starts_at ?? "2025-12-23T21:00:00.000Z", // 2 PM Denver (UTC-7)
    ends_at: overrides.ends_at ?? "2025-12-23T21:30:00.000Z",
    final_cents: overrides.final_cents ?? 4500,
    payment_status: overrides.payment_status ?? "unpaid",
  };
}

const pending = row({
  id: "a",
  status: "pending_approval",
  client_name: "Jane Doe",
  service_name: "Dog Walk",
});
const confirmed = row({
  id: "b",
  status: "confirmed",
  client_name: "Sam Reyes",
  service_name: "House Sitting",
});
const cancelled = row({
  id: "c",
  status: "cancelled",
  client_name: "Pat Smith",
  service_name: "Dog Walk",
});

const ALL = [pending, confirmed, cancelled];

// ── filterBookings ─────────────────────────────────────────────────────────────

describe("filterBookings", () => {
  it("status=all returns all rows", () => {
    expect(filterBookings(ALL, { status: "all", query: "" })).toHaveLength(3);
  });

  it("status filter keeps only matching rows", () => {
    const result = filterBookings(ALL, {
      status: "pending_approval",
      query: "",
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("query filter matches client name case-insensitively", () => {
    const result = filterBookings(ALL, { status: "all", query: "jane" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("empty query returns all (after status filter)", () => {
    const result = filterBookings(ALL, { status: "confirmed", query: "" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b");
  });

  it("combined: status + query filter", () => {
    const extra = row({
      id: "d",
      status: "pending_approval",
      client_name: "Sam P",
    });
    const result = filterBookings([...ALL, extra], {
      status: "pending_approval",
      query: "jane",
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("returns [] when nothing matches", () => {
    expect(filterBookings(ALL, { status: "all", query: "zzz" })).toHaveLength(
      0,
    );
  });

  it("service filter keeps only rows with matching service_name", () => {
    const result = filterBookings(ALL, {
      status: "all",
      query: "",
      service: "Dog Walk",
    });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("service='all' is a no-op (returns all rows)", () => {
    const result = filterBookings(ALL, {
      status: "all",
      query: "",
      service: "all",
    });
    expect(result).toHaveLength(3);
  });

  it("service=undefined is a no-op (backward-compat)", () => {
    const result = filterBookings(ALL, { status: "all", query: "" });
    expect(result).toHaveLength(3);
  });

  it("service filter combined with status + query", () => {
    const result = filterBookings(ALL, {
      status: "pending_approval",
      query: "jane",
      service: "Dog Walk",
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("service filter returns [] when no rows match service", () => {
    const result = filterBookings(ALL, {
      status: "all",
      query: "",
      service: "Cat Sitting",
    });
    expect(result).toHaveLength(0);
  });
});

// ── daysWithMatch ─────────────────────────────────────────────────────────────

describe("daysWithMatch", () => {
  // 2025-12-23T21:00:00Z = 2025-12-23 14:00 Denver (UTC-7)
  // 2026-01-04T08:00:00Z = 2026-01-04 01:00 Denver (UTC-7)
  const rowA = row({
    id: "a",
    client_name: "Jane Doe",
    starts_at: "2025-12-23T21:00:00.000Z",
  });
  const rowB = row({
    id: "b",
    client_name: "Sam Reyes",
    starts_at: "2026-01-04T08:00:00.000Z",
  });

  it("returns day keys for all rows when query is empty", () => {
    const days = daysWithMatch([rowA, rowB], "");
    expect(days.has("2025-12-23")).toBe(true);
    expect(days.has("2026-01-04")).toBe(true);
    expect(days.size).toBe(2);
  });

  it("returns only days matching query", () => {
    const days = daysWithMatch([rowA, rowB], "jane");
    expect(days.has("2025-12-23")).toBe(true);
    expect(days.has("2026-01-04")).toBe(false);
  });

  it("multiple rows on same day collapsed to one key", () => {
    const rowC = row({
      id: "c",
      client_name: "Jane Smith",
      starts_at: "2025-12-23T22:00:00.000Z",
    });
    const days = daysWithMatch([rowA, rowC], "jane");
    expect(days.has("2025-12-23")).toBe(true);
    expect(days.size).toBe(1);
  });

  it("returns empty set when no rows match", () => {
    const days = daysWithMatch([rowA, rowB], "zzz");
    expect(days.size).toBe(0);
  });
});

// ── isolate ───────────────────────────────────────────────────────────────────

describe("isolate", () => {
  it("returns [row] for a matching id", () => {
    const result = isolate(ALL, "b");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b");
  });

  it("returns [] when id not found", () => {
    expect(isolate(ALL, "missing")).toHaveLength(0);
  });
});
