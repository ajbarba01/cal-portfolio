import { ErrorState } from "@/components/feedback/error-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { listClients } from "@/features/admin";

import { ClientsIndexClient } from "./_components/clients-index-client";

export default async function AdminClientsPage() {
  const result = await listClients();
  if (result.kind !== "success") {
    return (
      <PageContainer width="app">
        <PageHeader title="Clients" />
        <ErrorState
          title="Couldn't load clients"
          message="Please try again shortly."
        />
      </PageContainer>
    );
  }
  return (
    <PageContainer width="app">
      <PageHeader title="Clients" subtitle="Everyone with a client account." />
      <ClientsIndexClient clients={result.clients} />
    </PageContainer>
  );
}
