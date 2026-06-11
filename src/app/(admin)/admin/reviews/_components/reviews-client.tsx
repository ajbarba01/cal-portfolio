"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  moderateReview,
  type ReviewRow,
  type ReviewStatus,
} from "@/features/admin";
import { cn } from "@/lib/utils";

// ──────────────────────────────────────────────────────────────────────────────
// Stars
// ──────────────────────────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <span
      className="text-warning-foreground inline-flex items-center gap-px"
      aria-label={`${rating} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            "h-3.5 w-3.5",
            i < rating ? "fill-current" : "fill-none",
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Status badge
// ──────────────────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: ReviewStatus }) {
  if (status === "published") {
    return <Badge variant="available">Published</Badge>;
  }
  if (status === "pending") {
    return <Badge variant="pending">Pending</Badge>;
  }
  // rejected → muted (default secondary)
  return <Badge variant="default">Rejected</Badge>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Filter tabs
// ──────────────────────────────────────────────────────────────────────────────

type ReviewFilter = "all" | ReviewStatus;

const TABS: { label: string; value: ReviewFilter }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Published", value: "published" },
  { label: "Rejected", value: "rejected" },
];

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────

export function ReviewsClient({
  initialReviews,
}: {
  initialReviews: ReviewRow[];
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<ReviewFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  function updateStatus(id: string, status: ReviewRow["status"]) {
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  async function handle(reviewId: string, status: "published" | "rejected") {
    setError(null);
    startTransition(async () => {
      const result = await moderateReview({ reviewId, status });
      if (result.kind === "success") {
        updateStatus(reviewId, status);
      } else {
        setError(
          "message" in result
            ? result.message
            : `Action failed: ${result.kind}`,
        );
      }
    });
  }

  const displayed = reviews.filter((r) => {
    if (activeTab !== "all" && r.status !== activeTab) return false;
    const q = searchQuery.trim().toLowerCase();
    if (q === "") return true;
    return (
      r.author_name.toLowerCase().includes(q) ||
      r.body.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {/* Search */}
      <Input
        type="search"
        placeholder="Search author or review text..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="max-w-sm"
        aria-label="Search reviews"
      />

      {/* Filter tabs */}
      <div
        className="bg-muted inline-flex gap-0.5 rounded-lg p-1"
        role="tablist"
        aria-label="Filter reviews by status"
      >
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              activeTab === tab.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No reviews match your filter.
        </p>
      ) : (
        <ul className="space-y-2">
          {displayed.map((r) => (
            <li
              key={r.id}
              className="bg-card border-border rounded-xl border px-4 py-3"
            >
              <div className="mb-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{r.author_name}</p>
                  <StarRating rating={r.rating} />
                  <span className="ml-auto">
                    <StatusPill status={r.status} />
                  </span>
                </div>
                <p className="mt-2 leading-snug">{r.body}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {new Date(r.created_at).toLocaleDateString("en-US")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handle(r.id, "published")}
                  disabled={isPending || r.status === "published"}
                >
                  Publish
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handle(r.id, "rejected")}
                  disabled={isPending || r.status === "rejected"}
                >
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
