"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { moderateReview } from "@/features/admin/reviews-actions";
import type { ReviewRow } from "@/features/admin/reviews-actions";

export function ReviewsClient({
  initialReviews,
}: {
  initialReviews: ReviewRow[];
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {reviews.length === 0 ? (
        <p className="text-muted-foreground text-sm">No reviews found.</p>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-md border px-4 py-3">
              <div className="mb-3 text-sm">
                <div className="flex items-center gap-3">
                  <p className="font-medium">{r.author_name}</p>
                  <span className="text-muted-foreground">
                    {"★".repeat(r.rating)}
                    {"☆".repeat(5 - r.rating)}
                  </span>
                  <span
                    className={
                      r.status === "published"
                        ? "text-green-700"
                        : r.status === "rejected"
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }
                  >
                    {r.status}
                  </span>
                </div>
                <p className="mt-1">{r.body}</p>
                <p className="text-muted-foreground">
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
