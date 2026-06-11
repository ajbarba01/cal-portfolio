import { paginate, type Page } from "@/lib/pagination";

import type { InquiryRow } from "./inquiry-actions";

// Re-exported for existing consumers; the implementation now lives in @/lib/pagination.
export { paginate, type Page };

const DENVER_TZ = "America/Denver";

export type StatusFilter = "all" | "new" | "resolved";

/**
 * Newest-first. Pure: returns a new array, never mutates the input.
 * `created_at` is ISO-8601, so direct string comparison is correct lexicographic
 * (and avoids locale-collation surprises from `localeCompare`).
 */
export function sortByRecency(inquiries: InquiryRow[]): InquiryRow[] {
  return [...inquiries].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  );
}

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
