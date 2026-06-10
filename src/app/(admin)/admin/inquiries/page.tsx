import { ErrorState } from "@/components/feedback/error-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { listInquiries } from "@/features/inquiries";

import { InquiriesClient } from "./_components/inquiries-client";

export default async function AdminInquiriesPage() {
  const result = await listInquiries();
  if (result.kind !== "success") {
    return (
      <PageContainer width="app">
        <PageHeader title="Inquiries" />
        <ErrorState
          title="Couldn't load inquiries"
          message="Please try again shortly."
        />
      </PageContainer>
    );
  }
  return (
    <PageContainer width="app">
      <PageHeader title="Inquiries" subtitle="Contact-form messages." />
      <InquiriesClient initialInquiries={result.inquiries} />
    </PageContainer>
  );
}
