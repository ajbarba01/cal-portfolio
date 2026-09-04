/**
 * Pure email payload builders — no IO, no side-effects.
 * All functions are unit-testable without sending anything.
 *
 * Every message goes through one shell (`renderEmail`), so the HTML chrome,
 * the plain-text alternative and the escaping are written once and cannot
 * drift between templates.
 *
 * Times are rendered in America/Denver (Mountain Time).
 * Money is stored as integer cents and displayed as $X.XX.
 *
 * Register: the two emails Cal signs are Cal's own first person; the notices
 * the system sends on his behalf — the received acknowledgement and the admin
 * alerts — are third person about Cal and carry no signature.
 */

import { absoluteUrl } from "@/features/seo";
import type { EmailMessage } from "./types";

// ──────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ──────────────────────────────────────────────────────────────────────────────

const DENVER_TZ = "America/Denver";

const SIGNATURE = "— Cal Barba";

/** Where a client reads the booking any of these emails is about. */
const CLIENT_BOOKINGS_LINK = {
  label: "View your bookings",
  url: absoluteUrl("/account/bookings"),
};

/** Where Cal answers a message: the admin queue, deep-linked where possible. */
const adminBookingLink = (bookingId: string) => ({
  label: "View the booking",
  url: absoluteUrl(`/admin/bookings?booking=${encodeURIComponent(bookingId)}`),
});

const ADMIN_INQUIRIES_LINK = {
  label: "View inquiries",
  url: absoluteUrl("/admin/inquiries"),
};

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

/** A start/end value as the emails print it, timezone named so it can't be misread. */
function formatBookingTime(date: Date): string {
  return `${formatDateTime(date)} (Mountain Time)`;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Escape text interpolated into email HTML. Applied by the shell to every
 * value, because these templates carry admin-controlled service names and
 * public-form text (a sender's name and message) alike.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ──────────────────────────────────────────────────────────────────────────────
// The shell every template renders through
// ──────────────────────────────────────────────────────────────────────────────

/** A body paragraph, or a subheading introducing the paragraphs after it. */
type EmailBlock = { heading: string } | { text: string };

/** One detail line: a table row in HTML, a padded line in plain text. */
type EmailRow = [label: string, value: string];

interface EmailLayout {
  to: string;
  subject: string;
  heading: string;
  rows: EmailRow[];
  blocks?: EmailBlock[];
  link?: { label: string; url: string };
  /** Cal signs his own correspondence; system notices about him are unsigned. */
  signed?: boolean;
}

const ROW_STYLE = "padding:8px 0;";
const ROW_RULE = "border-bottom:1px solid #e5e5e5;";

function renderRow([label, value]: EmailRow, isLast: boolean): string {
  const style = `${ROW_STYLE}${isLast ? "" : ROW_RULE}`;
  return `<tr><th style="text-align:left;${style}">${escapeHtml(label)}</th><td style="${style}">${escapeHtml(value)}</td></tr>`;
}

function renderEmail(layout: EmailLayout): EmailMessage {
  const { to, subject, heading, rows, blocks = [], link, signed } = layout;

  // Pad to the widest label so the plain-text table reads as columns.
  const labelWidth = Math.max(0, ...rows.map(([label]) => label.length)) + 2;
  const textLines = [
    heading,
    "",
    ...rows.map(
      ([label, value]) => `${`${label}:`.padEnd(labelWidth)}${value}`,
    ),
  ];
  for (const block of blocks) {
    textLines.push("", "heading" in block ? block.heading : block.text);
  }
  if (link) textLines.push("", `${link.label}: ${link.url}`);
  if (signed) textLines.push("", SIGNATURE);

  const htmlBlocks = blocks.map((block) =>
    "heading" in block
      ? `  <h2 style="font-size:1.1rem;margin:1.5rem 0 0.5rem;">${escapeHtml(block.heading)}</h2>`
      : `  <p style="margin-bottom:0.5rem;white-space:pre-wrap;">${escapeHtml(block.text)}</p>`,
  );
  if (link) {
    htmlBlocks.push(
      `  <p style="margin:1.5rem 0 0.5rem;"><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></p>`,
    );
  }
  if (signed) {
    htmlBlocks.push(`  <p style="color:#666;">${escapeHtml(SIGNATURE)}</p>`);
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>${escapeHtml(subject)}</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a;">
  <h1 style="font-size:1.5rem;margin-bottom:1rem;">${escapeHtml(heading)}</h1>
  <table style="border-collapse:collapse;width:100%;margin-bottom:1.5rem;">
${rows.map((row, index) => `    ${renderRow(row, index === rows.length - 1)}`).join("\n")}
  </table>
${htmlBlocks.join("\n")}
</body>
</html>
`.trim();

  return { to, subject, html, text: textLines.join("\n") };
}

/** The closing line on every client email; the reply lands in Cal's inbox. */
const REPLY_BLOCK: EmailBlock = { text: "Questions? Reply to this email." };

// ──────────────────────────────────────────────────────────────────────────────
// Client emails
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
  /**
   * The payments kill-switch. With prepay disabled sitewide there is nothing
   * for the client to pay from their bookings page, so the email does not
   * offer it; what they owe and the refund policy are unaffected.
   */
  paymentsEnabled: boolean;
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
    paymentsEnabled,
  } = input;

  return renderEmail({
    to,
    subject: `Booking confirmed: ${serviceName}`,
    heading: "Your booking is confirmed!",
    rows: [
      ["Service", serviceName],
      ["Starts", formatBookingTime(startsAt)],
      ["Ends", formatBookingTime(endsAt)],
      ["Total", formatCents(finalCents)],
    ],
    blocks: [
      { heading: "Payment" },
      ...(paymentsEnabled
        ? [
            {
              text: `You can prepay anytime from your bookings page, or pay after your ${serviceName}.`,
            },
          ]
        : []),
      {
        // Alex's wording, with the two numbers still read from settings rather
        // than written into the sentence.
        text: `Note: cancellations within ${cancellationFullRefundHours}hrs of the booking will only refund ${lateCancelRefundPct}% of the cost.`,
      },
      REPLY_BLOCK,
    ],
    link: CLIENT_BOOKINGS_LINK,
    signed: true,
  });
}

export interface BookingReminderInput {
  to: string;
  serviceName: string;
  startsAt: Date;
}

export function buildBookingReminderEmail(
  input: BookingReminderInput,
): EmailMessage {
  const { to, serviceName, startsAt } = input;

  return renderEmail({
    to,
    subject: `Reminder: ${serviceName} coming up`,
    heading: "Upcoming booking reminder",
    rows: [
      ["Service", serviceName],
      ["Starts", formatBookingTime(startsAt)],
    ],
    blocks: [REPLY_BLOCK],
    link: CLIENT_BOOKINGS_LINK,
    signed: true,
  });
}

export interface BookingReceivedInput {
  to: string;
  serviceName: string;
  startsAt: Date;
  endsAt: Date;
  finalCents: number;
}

/**
 * The acknowledgement a client gets for a request that lands
 * `pending_approval`. It must not read as a confirmation: the booking is not
 * confirmed until Cal approves it, and the confirmation email is sent then.
 */
export function buildBookingReceivedEmail(
  input: BookingReceivedInput,
): EmailMessage {
  const { to, serviceName, startsAt, endsAt, finalCents } = input;

  return renderEmail({
    to,
    subject: `Booking request received: ${serviceName}`,
    heading: "Booking request received",
    rows: [
      ["Service", serviceName],
      ["Starts", formatBookingTime(startsAt)],
      ["Ends", formatBookingTime(endsAt)],
      ["Total", formatCents(finalCents)],
    ],
    // No reply line: this one is sent from the noreply address, unlike the
    // confirmation and reminder emails Cal signs.
    blocks: [
      {
        text: "Your request will be reviewed shortly and you'll receive a confirmation email.",
      },
    ],
    link: CLIENT_BOOKINGS_LINK,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin alerts — sent only to the address in ADMIN_NOTIFICATION_EMAIL
// ──────────────────────────────────────────────────────────────────────────────

export interface BookingRequestAlertInput {
  bookingId: string;
  clientName: string;
  clientEmail: string;
  serviceName: string;
  startsAt: Date;
  endsAt: Date;
  finalCents: number;
}

export function buildBookingRequestAlertEmail(
  to: string,
  input: BookingRequestAlertInput,
): EmailMessage {
  const {
    bookingId,
    clientName,
    clientEmail,
    serviceName,
    startsAt,
    endsAt,
    finalCents,
  } = input;

  return renderEmail({
    to,
    subject: `New booking request: ${clientName}`,
    heading: "New booking request",
    rows: [
      ["Client", clientName],
      ["Email", clientEmail],
      ["Service", serviceName],
      ["Starts", formatBookingTime(startsAt)],
      ["Ends", formatBookingTime(endsAt)],
      ["Total", formatCents(finalCents)],
    ],
    link: adminBookingLink(bookingId),
  });
}

export interface InquiryAlertInput {
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
}

export function buildInquiryAlertEmail(
  to: string,
  input: InquiryAlertInput,
): EmailMessage {
  const { name, email, phone, subject, message } = input;

  // Phone and subject are optional on the contact form; an empty row would
  // read as missing data rather than as data the sender never supplied.
  const rows: EmailRow[] = [
    ["Name", name],
    ["Email", email],
  ];
  if (phone) rows.push(["Phone", phone]);
  if (subject) rows.push(["Subject", subject]);

  return renderEmail({
    to,
    subject: `New inquiry: ${name}`,
    heading: "New inquiry",
    rows,
    blocks: [{ text: message }],
    link: ADMIN_INQUIRIES_LINK,
  });
}

export interface BookingCancelledAlertInput {
  bookingId: string;
  clientName: string;
  clientEmail: string;
  serviceName: string;
  startsAt: Date;
}

export function buildBookingCancelledAlertEmail(
  to: string,
  input: BookingCancelledAlertInput,
): EmailMessage {
  const { bookingId, clientName, clientEmail, serviceName, startsAt } = input;

  return renderEmail({
    to,
    subject: `Booking cancelled: ${clientName}`,
    heading: "Booking cancelled",
    rows: [
      ["Client", clientName],
      ["Email", clientEmail],
      ["Service", serviceName],
      ["Starts", formatBookingTime(startsAt)],
    ],
    link: adminBookingLink(bookingId),
  });
}
