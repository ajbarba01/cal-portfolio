/**
 * Unit tests for pure email builders.
 *
 * No IO — tests run without any Supabase connection or Resend key.
 */

import { describe, it, expect } from "vitest";
import {
  buildBookingCancelledAlertEmail,
  buildBookingConfirmationEmail,
  buildBookingReceivedEmail,
  buildBookingReminderEmail,
  buildBookingRequestAlertEmail,
  buildInquiryAlertEmail,
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
    cancellationFullRefundHours: 48,
    lateCancelRefundPct: 50,
    paymentsEnabled: true,
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

  it("renders the payment policy from settings (not hardcoded), first-person", () => {
    const msg = buildBookingConfirmationEmail({
      ...input,
      finalCents: 6000,
      cancellationFullRefundHours: 48,
      lateCancelRefundPct: 50,
    });
    expect(msg.text).toContain("48");
    expect(msg.text).toContain("50%");
    expect(msg.text.toLowerCase()).toContain("prepay");
    expect(msg.html).toContain("48");
    expect(msg.html).toContain("50%");
  });

  it("reflects different settings values verbatim", () => {
    const msg = buildBookingConfirmationEmail({
      ...input,
      cancellationFullRefundHours: 24,
      lateCancelRefundPct: 75,
    });
    expect(msg.text).toContain("24");
    expect(msg.text).toContain("75%");
  });

  it("drops the prepay sentence when payments are disabled", () => {
    const msg = buildBookingConfirmationEmail({
      ...input,
      paymentsEnabled: false,
    });
    expect(msg.text.toLowerCase()).not.toContain("prepay");
    expect(msg.html.toLowerCase()).not.toContain("prepay");
  });

  it("keeps the refund policy when payments are disabled", () => {
    const msg = buildBookingConfirmationEmail({
      ...input,
      paymentsEnabled: false,
    });
    expect(msg.text).toContain("48");
    expect(msg.text).toContain("50%");
    expect(msg.html).toContain("50%");
  });

  it("reads the refund policy numbers from settings, not the sentence", () => {
    const msg = buildBookingConfirmationEmail({
      ...input,
      cancellationFullRefundHours: 24,
      lateCancelRefundPct: 75,
    });
    expect(msg.text).toContain(
      "Note: cancellations within 24hrs of the booking will only refund 75% of the cost.",
    );
  });

  it("links to the client's bookings page", () => {
    const msg = buildBookingConfirmationEmail(input);
    expect(msg.text).toContain("/account/bookings");
    expect(msg.html).toMatch(/href="https?:\/\/[^"]*\/account\/bookings"/);
  });

  it("signs off as Cal", () => {
    const msg = buildBookingConfirmationEmail(input);
    expect(msg.text).toContain("Cal Barba");
    expect(msg.html).toContain("Cal Barba");
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

  it("links to the client's bookings page", () => {
    const msg = buildBookingReminderEmail(input);
    expect(msg.text).toContain("/account/bookings");
    expect(msg.html).toMatch(/href="https?:\/\/[^"]*\/account\/bookings"/);
  });
});

describe("buildBookingReceivedEmail", () => {
  const input = {
    to: "client@example.com",
    serviceName: "Dog Walk",
    startsAt: KNOWN_START_UTC,
    endsAt: KNOWN_END_UTC,
    finalCents: 6500,
  };

  it("addresses the client and names the service in the subject", () => {
    const msg = buildBookingReceivedEmail(input);
    expect(msg.to).toBe("client@example.com");
    expect(msg.subject).toContain("Dog Walk");
  });

  it("does not claim the booking is confirmed", () => {
    const msg = buildBookingReceivedEmail(input);
    expect(msg.subject.toLowerCase()).not.toContain("confirmed");
    expect(msg.text.toLowerCase()).not.toContain("is confirmed");
  });

  it("says what happens next without inviting a reply", () => {
    const msg = buildBookingReceivedEmail(input);
    expect(msg.text).toContain("reviewed shortly");
    expect(msg.text).not.toContain(" we ");
    expect(msg.text).not.toContain("Reply to this email");
  });

  it("carries the booked times, total and bookings link", () => {
    const msg = buildBookingReceivedEmail(input);
    expect(msg.text).toMatch(/2:00\s*PM/i);
    expect(msg.text).toContain("$65.00");
    expect(msg.text).toContain("/account/bookings");
  });

  it("escapes an admin-controlled service name", () => {
    const msg = buildBookingReceivedEmail({
      ...input,
      serviceName: "<script>alert(1)</script>",
    });
    expect(msg.html).not.toContain("<script>");
    expect(msg.html).toContain("&lt;script&gt;");
  });
});

describe("buildBookingRequestAlertEmail", () => {
  const input = {
    bookingId: "bk-001",
    clientName: "Jane Doe",
    clientEmail: "jane@example.com",
    serviceName: "Dog Walk",
    startsAt: KNOWN_START_UTC,
    endsAt: KNOWN_END_UTC,
    finalCents: 6500,
  };

  it("goes to the address it is given, not to the client", () => {
    const msg = buildBookingRequestAlertEmail("cal@example.com", input);
    expect(msg.to).toBe("cal@example.com");
  });

  it("names the client in the subject and the details in the body", () => {
    const msg = buildBookingRequestAlertEmail("cal@example.com", input);
    expect(msg.subject).toContain("Jane Doe");
    expect(msg.text).toContain("jane@example.com");
    expect(msg.text).toContain("Dog Walk");
    expect(msg.text).toContain("$65.00");
  });

  it("links to the booking in the admin queue", () => {
    const msg = buildBookingRequestAlertEmail("cal@example.com", input);
    expect(msg.text).toContain("/admin/bookings?booking=bk-001");
  });

  it("escapes a client-supplied name", () => {
    const msg = buildBookingRequestAlertEmail("cal@example.com", {
      ...input,
      clientName: "<img src=x onerror=alert(1)>",
    });
    expect(msg.html).not.toContain("<img");
    expect(msg.html).toContain("&lt;img");
  });
});

describe("buildInquiryAlertEmail", () => {
  const input = {
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "303-555-0100",
    subject: "House sitting in July",
    message: "Are you free the week of the 4th?",
  };

  it("carries the sender, their message and a link to the queue", () => {
    const msg = buildInquiryAlertEmail("cal@example.com", input);
    expect(msg.to).toBe("cal@example.com");
    expect(msg.subject).toContain("Jane Doe");
    expect(msg.text).toContain("jane@example.com");
    expect(msg.text).toContain("303-555-0100");
    expect(msg.text).toContain("House sitting in July");
    expect(msg.text).toContain("Are you free the week of the 4th?");
    expect(msg.text).toContain("/admin/inquiries");
  });

  it("omits the rows the sender left blank", () => {
    const msg = buildInquiryAlertEmail("cal@example.com", {
      ...input,
      phone: null,
      subject: null,
    });
    expect(msg.text).not.toContain("Phone");
    expect(msg.text).not.toContain("Subject:");
  });

  it("escapes a sender-supplied message", () => {
    const msg = buildInquiryAlertEmail("cal@example.com", {
      ...input,
      message: "<script>alert(1)</script>",
    });
    expect(msg.html).not.toContain("<script>");
    expect(msg.html).toContain("&lt;script&gt;");
  });
});

describe("buildBookingCancelledAlertEmail", () => {
  const input = {
    bookingId: "bk-001",
    clientName: "Jane Doe",
    clientEmail: "jane@example.com",
    serviceName: "Dog Walk",
    startsAt: KNOWN_START_UTC,
  };

  it("names the client and the cancelled booking", () => {
    const msg = buildBookingCancelledAlertEmail("cal@example.com", input);
    expect(msg.to).toBe("cal@example.com");
    expect(msg.subject.toLowerCase()).toContain("cancelled");
    expect(msg.subject).toContain("Jane Doe");
    expect(msg.text).toContain("Dog Walk");
    expect(msg.text).toMatch(/2:00\s*PM/i);
    expect(msg.text).toContain("/admin/bookings?booking=bk-001");
  });
});
