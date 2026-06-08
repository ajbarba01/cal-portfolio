/**
 * Inquiry reply-draft builders. Pure, string-only. The generated body is kept
 * deliberately short (greeting + lead-in) so the resulting mailto: URL stays
 * well under browser/OS URL-length limits.
 */

export interface InquiryLike {
  name: string;
  subject: string | null;
  message: string;
}

export function replySubject(inquiry: InquiryLike): string {
  const subject = inquiry.subject?.trim();
  return subject ? `Re: ${subject}` : "Re: your inquiry";
}

export function replyBody(inquiry: InquiryLike): string {
  const firstName = inquiry.name.trim().split(/\s+/)[0] || "there";
  return `Hi ${firstName},\n\nThanks for reaching out - `;
}

/** Encoded mailto: with subject + body query params. */
export function mailtoUrl(
  email: string,
  subject: string,
  body: string,
): string {
  const params = new URLSearchParams({ subject, body });
  return `mailto:${email}?${params.toString()}`;
}

/** sms: deep link with an encoded body. SMS has no subject. */
export function smsUrl(phone: string, body: string): string {
  return `sms:${phone}?&body=${encodeURIComponent(body)}`;
}
