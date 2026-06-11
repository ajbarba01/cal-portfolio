/**
 * Pure email payload builders — no IO, no side-effects.
 * All functions are unit-testable without sending anything.
 *
 * Times are rendered in America/Denver (Mountain Time).
 * Money is stored as integer cents and displayed as $X.XX.
 *
 * TODO: real copy/branding before launch — current copy is wireframe-level.
 */

import type { EmailMessage } from "./types";

// ──────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ──────────────────────────────────────────────────────────────────────────────

const DENVER_TZ = "America/Denver";

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-US", {
    timeZone: DENVER_TZ,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Escape text interpolated into email HTML (serviceName is admin-controlled). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ──────────────────────────────────────────────────────────────────────────────
// Booking confirmation
// ──────────────────────────────────────────────────────────────────────────────

export interface BookingConfirmationInput {
  to: string;
  serviceName: string;
  startsAt: Date;
  endsAt: Date;
  finalCents: number;
  /** From settings.cancellation_full_refund_hours — never hardcoded. */
  cancellationFullRefundHours: number;
  /** From settings.late_cancel_refund_pct — never hardcoded. */
  lateCancelRefundPct: number;
}

export function buildBookingConfirmationEmail(
  input: BookingConfirmationInput,
): EmailMessage {
  const {
    to,
    serviceName,
    startsAt,
    endsAt,
    finalCents,
    cancellationFullRefundHours,
    lateCancelRefundPct,
  } = input;
  const startStr = formatDateTime(startsAt);
  const endStr = formatDateTime(endsAt);
  const priceStr = formatCents(finalCents);

  const subject = `Booking confirmed: ${serviceName}`;
  const serviceHtml = escapeHtml(serviceName);
  const subjectHtml = escapeHtml(subject);

  const text = [
    `Your booking is confirmed!`,
    ``,
    `Service: ${serviceName}`,
    `Starts: ${startStr} (Mountain Time)`,
    `Ends:   ${endStr} (Mountain Time)`,
    `Total:  ${priceStr}`,
    ``,
    `Payment`,
    `You can prepay anytime from your bookings page, or pay after your ${serviceName}.`,
    `Cancel ${cancellationFullRefundHours}+ hours before the start and I refund you in full;`,
    `cancel within ${cancellationFullRefundHours} hours and I refund ${lateCancelRefundPct}%.`,
    ``,
    `Questions? Reply to this email.`,
    ``,
    `— Cal Barba`,
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>${subjectHtml}</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a;">
  <h1 style="font-size:1.5rem;margin-bottom:1rem;">Your booking is confirmed!</h1>
  <table style="border-collapse:collapse;width:100%;margin-bottom:1.5rem;">
    <tr><th style="text-align:left;padding:8px 0;border-bottom:1px solid #e5e5e5;">Service</th><td style="padding:8px 0;border-bottom:1px solid #e5e5e5;">${serviceHtml}</td></tr>
    <tr><th style="text-align:left;padding:8px 0;border-bottom:1px solid #e5e5e5;">Starts</th><td style="padding:8px 0;border-bottom:1px solid #e5e5e5;">${startStr} (Mountain Time)</td></tr>
    <tr><th style="text-align:left;padding:8px 0;border-bottom:1px solid #e5e5e5;">Ends</th><td style="padding:8px 0;border-bottom:1px solid #e5e5e5;">${endStr} (Mountain Time)</td></tr>
    <tr><th style="text-align:left;padding:8px 0;">Total</th><td style="padding:8px 0;">${priceStr}</td></tr>
  </table>
  <h2 style="font-size:1.1rem;margin:1.5rem 0 0.5rem;">Payment</h2>
  <p style="margin-bottom:0.5rem;">You can prepay anytime from your bookings page, or pay after your ${serviceHtml}.</p>
  <p style="margin-bottom:1rem;">Cancel ${cancellationFullRefundHours}+ hours before the start and I refund you in full; cancel within ${cancellationFullRefundHours} hours and I refund ${lateCancelRefundPct}%.</p>
  <p style="margin-bottom:0.5rem;">Questions? Reply to this email.</p>
  <p style="color:#666;">— Cal Barba</p>
</body>
</html>
`.trim();

  return { to, subject, html, text };
}

// ──────────────────────────────────────────────────────────────────────────────
// Booking reminder
// ──────────────────────────────────────────────────────────────────────────────

export interface BookingReminderInput {
  to: string;
  serviceName: string;
  startsAt: Date;
}

export function buildBookingReminderEmail(
  input: BookingReminderInput,
): EmailMessage {
  const { to, serviceName, startsAt } = input;
  const startStr = formatDateTime(startsAt);

  const subject = `Reminder: ${serviceName} coming up`;
  const serviceHtml = escapeHtml(serviceName);
  const subjectHtml = escapeHtml(subject);

  const text = [
    `Just a reminder about your upcoming booking.`,
    ``,
    `Service: ${serviceName}`,
    `Starts:  ${startStr} (Mountain Time)`,
    ``,
    `Questions? Reply to this email.`,
    ``,
    `— Cal Barba`,
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>${subjectHtml}</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a;">
  <h1 style="font-size:1.5rem;margin-bottom:1rem;">Upcoming booking reminder</h1>
  <table style="border-collapse:collapse;width:100%;margin-bottom:1.5rem;">
    <tr><th style="text-align:left;padding:8px 0;border-bottom:1px solid #e5e5e5;">Service</th><td style="padding:8px 0;border-bottom:1px solid #e5e5e5;">${serviceHtml}</td></tr>
    <tr><th style="text-align:left;padding:8px 0;">Starts</th><td style="padding:8px 0;">${startStr} (Mountain Time)</td></tr>
  </table>
  <p style="margin-bottom:0.5rem;">Questions? Reply to this email.</p>
  <p style="color:#666;">— Cal Barba</p>
</body>
</html>
`.trim();

  return { to, subject, html, text };
}
