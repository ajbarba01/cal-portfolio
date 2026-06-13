/**
 * Admin settings editor — server component.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { getCachedUser } from "@/lib/supabase/server-cache";
import { getSettingsCore } from "@/features/admin";
import { SettingsClient } from "./_components/settings-client";
import { ErrorState } from "@/components/feedback/error-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

export default async function AdminSettingsPage() {
  const { user } = await getCachedUser();

  const serviceClient = createServiceClient();
  const result = await getSettingsCore({
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
      <PageHeader title="Settings Editor" />
      <SettingsClient initialSettings={result.settings} />
    </PageContainer>
  );
}
