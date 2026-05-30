/**
 * Unit tests for pure email builders.
 *
 * No IO — tests run without any Supabase connection or Resend key.
 */

import { describe, it, expect } from "vitest";
import {
  buildBookingConfirmationEmail,
  buildBookingReminderEmail,
} from "./emails";

// A known time: 2026-06-15 20:00 UTC = 2026-06-15 14:00 MDT (UTC-6)
const KNOWN_START_UTC = new Date("2026-06-15T20:00:00.000Z");
const KNOWN_END_UTC = new Date("2026-06-15T22:00:00.000Z");

describe("buildBookingConfirmationEmail", () => {
  const input = {
    to: "client@example.com",
    serviceName: "Dog Walk",
    startsAt: KNOWN_START_UTC,
    endsAt: KNOWN_END_UTC,
    finalCents: 6500,
  };

  it("has the correct recipient", () => {
    const msg = buildBookingConfirmationEmail(input);
    expect(msg.to).toBe("client@example.com");
  });

  it("subject includes service name", () => {
    const msg = buildBookingConfirmationEmail(input);
    expect(msg.subject).toContain("Dog Walk");
    expect(msg.subject).toContain("confirmed");
  });

  it("html includes Denver-rendered start time", () => {
    const msg = buildBookingConfirmationEmail(input);
    // 20:00 UTC = 14:00 MDT — expect "2:00 PM" somewhere in the output
    expect(msg.html).toMatch(/2:00\s*PM/i);
    // Also check it mentions Mountain Time
    expect(msg.html).toContain("Mountain Time");
  });

  it("text includes Denver-rendered start time", () => {
    const msg = buildBookingConfirmationEmail(input);
    expect(msg.text).toMatch(/2:00\s*PM/i);
    expect(msg.text).toContain("Mountain Time");
  });

  it("html and text include the dollar amount", () => {
    const msg = buildBookingConfirmationEmail(input);
    expect(msg.html).toContain("$65.00");
    expect(msg.text).toContain("$65.00");
  });

  it("html and text include the service name", () => {
    const msg = buildBookingConfirmationEmail(input);
    expect(msg.html).toContain("Dog Walk");
    expect(msg.text).toContain("Dog Walk");
  });
});

describe("buildBookingReminderEmail", () => {
  const input = {
    to: "client@example.com",
    serviceName: "House Sitting",
    startsAt: KNOWN_START_UTC,
  };

  it("has the correct recipient", () => {
    const msg = buildBookingReminderEmail(input);
    expect(msg.to).toBe("client@example.com");
  });

  it("subject includes service name and reminder keyword", () => {
    const msg = buildBookingReminderEmail(input);
    expect(msg.subject).toContain("House Sitting");
    expect(msg.subject.toLowerCase()).toContain("reminder");
  });

  it("html includes Denver-rendered start time", () => {
    const msg = buildBookingReminderEmail(input);
    expect(msg.html).toMatch(/2:00\s*PM/i);
    expect(msg.html).toContain("Mountain Time");
  });

  it("text includes Denver-rendered start time", () => {
    const msg = buildBookingReminderEmail(input);
    expect(msg.text).toMatch(/2:00\s*PM/i);
    expect(msg.text).toContain("Mountain Time");
  });

  it("html and text include the service name", () => {
    const msg = buildBookingReminderEmail(input);
    expect(msg.html).toContain("House Sitting");
    expect(msg.text).toContain("House Sitting");
  });
});
