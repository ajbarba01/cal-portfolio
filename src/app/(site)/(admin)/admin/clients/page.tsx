import Link from "next/link";

import { ErrorState } from "@/components/feedback/error-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
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
      <PageHeader
        title="Clients"
        subtitle="Everyone with a client account."
        actions={
          <Link href="/admin/clients/new" className={buttonVariants()}>
            New client
          </Link>
        }
      />
      <ClientsIndexClient clients={result.clients} />
    </PageContainer>
  );
}
