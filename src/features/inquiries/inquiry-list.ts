import type { InquiryRow } from "./inquiry-actions";

const DENVER_TZ = "America/Denver";

export type StatusFilter = "all" | "new" | "resolved";

/** Case-insensitive substring match across subject, message, name, email. */
export function filterInquiries(
  inquiries: InquiryRow[],
  query: string,
  status: StatusFilter,
): InquiryRow[] {
  const q = query.trim().toLowerCase();
  return inquiries.filter((inquiry) => {
    if (status !== "all" && inquiry.status !== status) return false;
    if (!q) return true;
    const haystack = [
      inquiry.subject,
      inquiry.message,
      inquiry.name,
      inquiry.email,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

/** Client may edit only an unanswered, still-new inquiry. */
export function canEditInquiry(
  inquiry: Pick<InquiryRow, "status" | "replied_at">,
): boolean {
  return inquiry.status === "new" && inquiry.replied_at === null;
}

/** e.g. "Jun 3, 2026 · 2:14 PM" in Cal's timezone. */
export function formatInquiryDate(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-US", {
    timeZone: DENVER_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("en-US", {
    timeZone: DENVER_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} · ${time}`;
}
