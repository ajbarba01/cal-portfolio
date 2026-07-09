import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

import { NewClientForm } from "./_components/new-client-form";

export default function NewClientPage() {
  return (
    <PageContainer width="app">
      <PageHeader
        title="New client"
        subtitle="Create a record for an offline client. They claim the account later."
      />
      <NewClientForm />
    </PageContainer>
  );
}
