import Link from "next/link";
import {
  ArrowRight,
  CheckSquare,
  CircleDollarSign,
  MessageSquare,
  Star,
  CheckCircle2,
} from "lucide-react";

import { formatCents } from "@/features/pricing";

export interface AttentionListProps {
  pendingApprovals: number;
  newInquiries: number;
  owing: {
    count: number;
    topName?: string | null;
    topAmountCents?: number;
    totalCents?: number;
  };
  reviewsToModerate: number;
}

export function AttentionList({
  pendingApprovals,
  newInquiries,
  owing,
  reviewsToModerate,
}: AttentionListProps) {
  const allClear =
    pendingApprovals === 0 &&
    newInquiries === 0 &&
    owing.count === 0 &&
    reviewsToModerate === 0;

  return (
    <section
      aria-label="Needs your attention"
      className="border-border bg-card overflow-hidden rounded-2xl border"
    >
      {/* Header band */}
      <div className="bg-warning/20 text-warning-foreground px-4 py-[11px] text-[11.5px] font-bold tracking-[0.05em] uppercase">
        Needs your attention
      </div>

      {allClear ? (
        /* Empty state */
        <div className="text-status-available-foreground flex items-center gap-2.5 px-4 py-[22px] text-sm font-medium">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          All caught up ✓
        </div>
      ) : (
        <ul role="list">
          {/* Pending approvals */}
          {pendingApprovals > 0 && (
            <li className="border-border flex items-center gap-[14px] border-t px-4 py-[14px]">
              {/* chip: gold */}
              <span
                className="bg-warning/20 text-warning-foreground flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[10px]"
                aria-hidden="true"
              >
                <CheckSquare className="h-[19px] w-[19px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-foreground text-sm font-semibold">
                  {pendingApprovals}{" "}
                  {pendingApprovals === 1
                    ? "booking awaiting approval"
                    : "bookings awaiting approval"}
                </p>
                <p className="text-muted-foreground text-xs">
                  Awaiting your approval
                </p>
              </div>
              <Link
                href="/admin/bookings?status=pending_approval"
                className="text-brand-strong focus-visible:ring-ring ml-auto inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                Review{" "}
                <ArrowRight className="h-[13px] w-[13px]" aria-hidden="true" />
              </Link>
            </li>
          )}

          {/* New inquiries */}
          {newInquiries > 0 && (
            <li className="border-border flex items-center gap-[14px] border-t px-4 py-[14px]">
              {/* chip: gold */}
              <span
                className="bg-warning/20 text-warning-foreground flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[10px]"
                aria-hidden="true"
              >
                <MessageSquare className="h-[19px] w-[19px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-foreground text-sm font-semibold">
                  {newInquiries} new{" "}
                  {newInquiries === 1 ? "inquiry" : "inquiries"}
                </p>
                <p className="text-muted-foreground text-xs">
                  From the contact form
                </p>
              </div>
              <Link
                href="/admin/inquiries"
                className="text-brand-strong focus-visible:ring-ring ml-auto inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                Open{" "}
                <ArrowRight className="h-[13px] w-[13px]" aria-hidden="true" />
              </Link>
            </li>
          )}

          {/* Owing clients — danger-warm only */}
          {owing.count > 0 && (
            <li className="border-border flex items-center gap-[14px] border-t px-4 py-[14px]">
              {/* chip: danger */}
              <span
                className="bg-destructive-warm/10 text-destructive-warm flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[10px]"
                aria-hidden="true"
              >
                <CircleDollarSign className="h-[19px] w-[19px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-destructive-warm text-sm font-semibold">
                  {owing.count === 1
                    ? "1 client owes a balance"
                    : `${owing.count} clients owe a balance`}
                </p>
                <p className="text-muted-foreground text-xs">
                  {owing.count === 1 &&
                  owing.topName != null &&
                  owing.topAmountCents != null
                    ? `${owing.topName} · ${formatCents(owing.topAmountCents)}`
                    : owing.totalCents != null
                      ? `${owing.count} clients · ${formatCents(owing.totalCents)}`
                      : `${owing.count} clients`}
                </p>
              </div>
              <Link
                href="/admin/clients"
                className="text-destructive-warm focus-visible:ring-ring ml-auto inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                Settle{" "}
                <ArrowRight className="h-[13px] w-[13px]" aria-hidden="true" />
              </Link>
            </li>
          )}

          {/* Reviews to moderate */}
          {reviewsToModerate > 0 && (
            <li className="border-border flex items-center gap-[14px] border-t px-4 py-[14px]">
              {/* chip: calm/green */}
              <span
                className="bg-status-available text-status-available-foreground flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[10px]"
                aria-hidden="true"
              >
                <Star className="h-[19px] w-[19px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-foreground text-sm font-semibold">
                  {reviewsToModerate}{" "}
                  {reviewsToModerate === 1 ? "review" : "reviews"} to moderate
                </p>
                <p className="text-muted-foreground text-xs">
                  Publish or reject
                </p>
              </div>
              <Link
                href="/admin/reviews"
                className="text-brand-strong focus-visible:ring-ring ml-auto inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                Moderate{" "}
                <ArrowRight className="h-[13px] w-[13px]" aria-hidden="true" />
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
