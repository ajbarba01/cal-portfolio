/**
 * Unit tests for the pure result→message mapping functions.
 * No DB, no browser, no React.
 */

import { describe, it, expect } from "vitest";
import {
  bookingSuccessSummary,
  createResultMessage,
  previewResultMessage,
} from "./messages";
import type { CreateBookingResult } from "@/features/booking/booking-service";
import type { PreviewActionResult } from "@/features/booking/quote-action";

// ── createResultMessage ───────────────────────────────────────────────────────

describe("createResultMessage", () => {
  it("success + requiresApproval=false → confirmed", () => {
    const result: CreateBookingResult = {
      kind: "success",
      bookingIds: ["abc"],
      warnings: [],
    };
    const msg = createResultMessage(result, false);
    expect(msg.tone).toBe("success");
    expect(msg.text).toMatch(/confirmed/i);
  });

  it("success + requiresApproval=true → pending approval", () => {
    const result: CreateBookingResult = {
      kind: "success",
      bookingIds: ["abc"],
      warnings: [],
    };
    const msg = createResultMessage(result, true);
    expect(msg.tone).toBe("info");
    expect(msg.text).toMatch(/pending/i);
  });

  it("slot_taken → pick another", () => {
    const result: CreateBookingResult = { kind: "slot_taken" };
    const msg = createResultMessage(result, false);
    expect(msg.tone).toBe("error");
    expect(msg.text).toMatch(/slot was just taken/i);
  });

  it("unavailable → surfaces reason", () => {
    const result: CreateBookingResult = {
      kind: "unavailable",
      reason: "Outside availability window.",
    };
    const msg = createResultMessage(result, false);
    expect(msg.tone).toBe("error");
    expect(msg.text).toBe("Outside availability window.");
  });

  it("refuse → surfaces reason", () => {
    const result: CreateBookingResult = {
      kind: "refuse",
      reason: "Too far away.",
    };
    const msg = createResultMessage(result, false);
    expect(msg.tone).toBe("error");
    expect(msg.text).toBe("Too far away.");
  });

  it("validation_error → surfaces message", () => {
    const result: CreateBookingResult = {
      kind: "validation_error",
      message: "dogs must be ≥ 1",
    };
    const msg = createResultMessage(result, false);
    expect(msg.tone).toBe("error");
    expect(msg.text).toBe("dogs must be ≥ 1");
  });

  it("error → surfaces message", () => {
    const result: CreateBookingResult = {
      kind: "error",
      message: "DB connection failed",
    };
    const msg = createResultMessage(result, false);
    expect(msg.tone).toBe("error");
    expect(msg.text).toBe("DB connection failed");
  });
});

// ── previewResultMessage ──────────────────────────────────────────────────────

describe("previewResultMessage", () => {
  it("not_authenticated → login prompt (info tone)", () => {
    const result: PreviewActionResult = { kind: "not_authenticated" };
    const out = previewResultMessage(result);
    expect(out.kind).toBe("message");
    if (out.kind === "message") {
      expect(out.message.tone).toBe("info");
      expect(out.message.text).toMatch(/log in/i);
      // Login CTA is a structured flag, not embedded HTML in the text.
      expect(out.message.action).toBe("login");
      expect(out.message.text).not.toMatch(/</);
    }
  });

  it("success → quote kind with preview", () => {
    const preview = {
      breakdown: {
        lines: [{ label: "Base", amountCents: 5000 }],
        finalCents: 5000,
      },
      finalCents: 5000,
      distanceMiles: 3.5,
      requiresApproval: false,
      decision: "auto" as const,
      approvalReasons: [],
      warnings: [],
      requirements: [],
    };
    const result: PreviewActionResult = { kind: "success", preview };
    const out = previewResultMessage(result);
    expect(out.kind).toBe("quote");
    if (out.kind === "quote") {
      expect(out.preview.finalCents).toBe(5000);
    }
  });

  it("refuse → error message with reason", () => {
    const result: PreviewActionResult = {
      kind: "refuse",
      reason: "Location too far.",
    };
    const out = previewResultMessage(result);
    expect(out.kind).toBe("message");
    if (out.kind === "message") {
      expect(out.message.tone).toBe("error");
      expect(out.message.text).toBe("Location too far.");
    }
  });

  it("validation_error → error message", () => {
    const result: PreviewActionResult = {
      kind: "validation_error",
      message: "hours must be positive",
    };
    const out = previewResultMessage(result);
    expect(out.kind).toBe("message");
    if (out.kind === "message") {
      expect(out.message.tone).toBe("error");
      expect(out.message.text).toBe("hours must be positive");
    }
  });

  it("error → error message", () => {
    const result: PreviewActionResult = {
      kind: "error",
      message: "Internal error",
    };
    const out = previewResultMessage(result);
    expect(out.kind).toBe("message");
    if (out.kind === "message") {
      expect(out.message.tone).toBe("error");
    }
  });
});

// ── bookingSuccessSummary (U1) ────────────────────────────────────────────────

describe("bookingSuccessSummary", () => {
  it("week-slots: service · day · fractional-hour duration · pets", () => {
    // 2025-06-16 is a Monday; 10:00–11:30 Denver (MDT, UTC-6).
    expect(
      bookingSuccessSummary({
        serviceName: "Walk",
        mode: "week-slots",
        startsAt: new Date("2025-06-16T16:00:00Z"),
        endsAt: new Date("2025-06-16T17:30:00Z"),
        petNames: ["Juniper"],
      }),
    ).toBe("Walk · Mon, Jun 16 · 1.5 hr · Juniper");
  });

  it("week-slots: sub-hour duration renders minutes; no pets segment when empty", () => {
    expect(
      bookingSuccessSummary({
        serviceName: "Drop-in",
        mode: "week-slots",
        startsAt: new Date("2025-06-16T16:00:00Z"),
        endsAt: new Date("2025-06-16T16:45:00Z"),
        petNames: [],
      }),
    ).toBe("Drop-in · Mon, Jun 16 · 45 min");
  });

  it("month-range: service · date range · nights · pets", () => {
    // Check-in Jun 16, check-out Jun 19 (both 6:30am Denver) = 3 nights.
    expect(
      bookingSuccessSummary({
        serviceName: "House sitting",
        mode: "month-range",
        startsAt: new Date("2025-06-16T12:30:00Z"),
        endsAt: new Date("2025-06-19T12:30:00Z"),
        petNames: ["Juniper", "Moss"],
      }),
    ).toBe(
      "House sitting · Mon, Jun 16 – Thu, Jun 19 · 3 nights · Juniper, Moss",
    );
  });

  it("month-range: a single night is singular", () => {
    expect(
      bookingSuccessSummary({
        serviceName: "House sitting",
        mode: "month-range",
        startsAt: new Date("2025-06-16T12:30:00Z"),
        endsAt: new Date("2025-06-17T12:30:00Z"),
        petNames: [],
      }),
    ).toBe("House sitting · Mon, Jun 16 – Tue, Jun 17 · 1 night");
  });
});
