/**
 * Admin reviews moderation — server component.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { listReviewsCore } from "@/features/admin/reviews-actions";
import { ReviewsClient } from "./_components/reviews-client";

export default async function AdminReviewsPage() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  const serviceClient = createServiceClient();
  const result = await listReviewsCore({
    serviceClient,
    actorUserId: user!.id,
  });

  if (result.kind === "forbidden") {
    return <p className="text-destructive p-8">Access denied.</p>;
  }

  if (result.kind === "error") {
    return (
      <p className="text-destructive p-8">
        Failed to load reviews: {result.message}
      </p>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">
        Reviews Moderation ({result.reviews.length})
      </h1>
      <ReviewsClient initialReviews={result.reviews} />
    </main>
  );
}
