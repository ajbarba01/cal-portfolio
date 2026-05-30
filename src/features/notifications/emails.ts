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

// ──────────────────────────────────────────────────────────────────────────────
// Booking confirmation
// ──────────────────────────────────────────────────────────────────────────────

export interface BookingConfirmationInput {
  to: string;
  serviceName: string;
  startsAt: Date;
  endsAt: Date;
  finalCents: number;
}

export function buildBookingConfirmationEmail(
  input: BookingConfirmationInput,
): EmailMessage {
  const { to, serviceName, startsAt, endsAt, finalCents } = input;
  const startStr = formatDateTime(startsAt);
  const endStr = formatDateTime(endsAt);
  const priceStr = formatCents(finalCents);

  const subject = `Booking confirmed: ${serviceName}`;

  const text = [
    `Your booking is confirmed!`,
    ``,
    `Service: ${serviceName}`,
    `Starts: ${startStr} (Mountain Time)`,
    `Ends:   ${endStr} (Mountain Time)`,
    `Total:  ${priceStr}`,
    ``,
    `Questions? Reply to this email.`,
    ``,
    `— Cal Barba`,
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>${subject}</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a;">
  <h1 style="font-size:1.5rem;margin-bottom:1rem;">Your booking is confirmed!</h1>
  <table style="border-collapse:collapse;width:100%;margin-bottom:1.5rem;">
    <tr><th style="text-align:left;padding:8px 0;border-bottom:1px solid #e5e5e5;">Service</th><td style="padding:8px 0;border-bottom:1px solid #e5e5e5;">${serviceName}</td></tr>
    <tr><th style="text-align:left;padding:8px 0;border-bottom:1px solid #e5e5e5;">Starts</th><td style="padding:8px 0;border-bottom:1px solid #e5e5e5;">${startStr} (Mountain Time)</td></tr>
    <tr><th style="text-align:left;padding:8px 0;border-bottom:1px solid #e5e5e5;">Ends</th><td style="padding:8px 0;border-bottom:1px solid #e5e5e5;">${endStr} (Mountain Time)</td></tr>
    <tr><th style="text-align:left;padding:8px 0;">Total</th><td style="padding:8px 0;">${priceStr}</td></tr>
  </table>
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
<head><meta charset="UTF-8" /><title>${subject}</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a;">
  <h1 style="font-size:1.5rem;margin-bottom:1rem;">Upcoming booking reminder</h1>
  <table style="border-collapse:collapse;width:100%;margin-bottom:1.5rem;">
    <tr><th style="text-align:left;padding:8px 0;border-bottom:1px solid #e5e5e5;">Service</th><td style="padding:8px 0;border-bottom:1px solid #e5e5e5;">${serviceName}</td></tr>
    <tr><th style="text-align:left;padding:8px 0;">Starts</th><td style="padding:8px 0;">${startStr} (Mountain Time)</td></tr>
  </table>
  <p style="margin-bottom:0.5rem;">Questions? Reply to this email.</p>
  <p style="color:#666;">— Cal Barba</p>
</body>
</html>
`.trim();

  return { to, subject, html, text };
}
