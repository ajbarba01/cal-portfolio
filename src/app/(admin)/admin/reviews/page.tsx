/**
 * Admin reviews moderation — server component.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { listReviewsCore } from "@/features/admin";
import { ReviewsClient } from "./_components/reviews-client";
import { ErrorState } from "@/components/feedback/error-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

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
    return (
      <ErrorState
        title="Access denied"
        message="You don't have permission to view this."
      />
    );
  }

  if (result.kind === "error") {
    return (
      <ErrorState
        title="Couldn't load this"
        message="We couldn't load this right now. Please try again."
      />
    );
  }

  return (
    <PageContainer width="app">
      <PageHeader title={`Reviews Moderation (${result.reviews.length})`} />
      <ReviewsClient initialReviews={result.reviews} />
    </PageContainer>
  );
}
