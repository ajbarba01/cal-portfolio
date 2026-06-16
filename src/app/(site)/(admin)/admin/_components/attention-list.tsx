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
import { Surface } from "@/components/ui/surface";

export interface AttentionListProps {
  pendingApprovals: number;
  newInquiries: number;
  owing: {
    count: number;
    topName?: string | null;
    topAmountCents?: number;
    totalCents?: number;
  };
  recentReviews: number;
}

export function AttentionList({
  pendingApprovals,
  newInquiries,
  owing,
  recentReviews,
}: AttentionListProps) {
  const allClear =
    pendingApprovals === 0 &&
    newInquiries === 0 &&
    owing.count === 0 &&
    recentReviews === 0;

  return (
    <Surface as="section" variant="emphasis" aria-label="Needs your attention">
      {/* Inner clip wrapper rounds the header band; overflow-hidden can't sit on
          the emphasis Surface itself — it would clip the bleeding shimmer ring. */}
      <div className="rounded-card overflow-hidden">
        {/* Header band */}
        <div className="bg-warning/20 text-warning-foreground px-4 py-2.75 text-[11.5px] font-bold tracking-wider uppercase">
          Needs your attention
        </div>

        {allClear ? (
          /* Empty state */
          <div className="text-status-available-foreground flex items-center gap-2.5 px-4 py-5.5 text-sm font-medium">
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
            All caught up ✓
          </div>
        ) : (
          <ul role="list">
            {/* Pending approvals */}
            {pendingApprovals > 0 && (
              <li className="border-border flex items-center gap-3.5 border-t px-4 py-3.5">
                {/* chip: gold */}
                <span
                  className="bg-warning/20 text-warning-foreground flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[10px]"
                  aria-hidden="true"
                >
                  <CheckSquare className="h-4.75 w-4.75" />
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
                  <ArrowRight className="h-3.25 w-3.25" aria-hidden="true" />
                </Link>
              </li>
            )}

            {/* New inquiries */}
            {newInquiries > 0 && (
              <li className="border-border flex items-center gap-3.5 border-t px-4 py-3.5">
                {/* chip: gold */}
                <span
                  className="bg-warning/20 text-warning-foreground flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[10px]"
                  aria-hidden="true"
                >
                  <MessageSquare className="h-4.75 w-4.75" />
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
                  <ArrowRight className="h-3.25 w-3.25" aria-hidden="true" />
                </Link>
              </li>
            )}

            {/* Owing clients — danger-warm only */}
            {owing.count > 0 && (
              <li className="border-border flex items-center gap-3.5 border-t px-4 py-3.5">
                {/* chip: danger */}
                <span
                  className="bg-destructive-warm/10 text-destructive-warm flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[10px]"
                  aria-hidden="true"
                >
                  <CircleDollarSign className="h-4.75 w-4.75" />
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
                  <ArrowRight className="h-3.25 w-3.25" aria-hidden="true" />
                </Link>
              </li>
            )}

            {/* New reviews in the last 7 days */}
            {recentReviews > 0 && (
              <li className="border-border flex items-center gap-3.5 border-t px-4 py-3.5">
                {/* chip: calm/green */}
                <span
                  className="bg-status-available text-status-available-foreground flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[10px]"
                  aria-hidden="true"
                >
                  <Star className="h-4.75 w-4.75" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-sm font-semibold">
                    {recentReviews} new{" "}
                    {recentReviews === 1 ? "review" : "reviews"} this week
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Submitted in the last 7 days
                  </p>
                </div>
                <Link
                  href="/admin/reviews"
                  className="text-brand-strong focus-visible:ring-ring ml-auto inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap hover:underline focus-visible:ring-2 focus-visible:outline-none"
                >
                  View{" "}
                  <ArrowRight className="h-3.25 w-3.25" aria-hidden="true" />
                </Link>
              </li>
            )}
          </ul>
        )}
      </div>
    </Surface>
  );
}
