import { notFound } from "next/navigation";

import { ErrorState } from "@/components/feedback/error-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { getClientDetail } from "@/features/admin/clients-actions";

import { ClientDetailClient } from "./_components/client-detail-client";

export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const result = await getClientDetail(clientId);
  if (result.kind === "not_found") notFound();
  if (result.kind !== "success") {
    return (
      <PageContainer width="app">
        <PageHeader title="Client" />
        <ErrorState
          title="Couldn't load this client"
          message="Please try again shortly."
        />
      </PageContainer>
    );
  }
  return (
    <PageContainer width="app">
      <PageHeader title={result.client.full_name ?? "Client"} />
      <ClientDetailClient client={result.client} />
    </PageContainer>
  );
}
