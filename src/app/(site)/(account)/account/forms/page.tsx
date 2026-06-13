import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/server-cache";
import { redirect } from "next/navigation";
import { formRegistry, type FormKey } from "@/features/accounts";
import { FormsClient } from "./_components/forms-client";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

export interface FormResponseRow {
  id: string;
  form_key: string;
  data: Record<string, unknown>;
  submitted_at: string;
}

export default async function FormsPage() {
  const { user } = await getCachedUser();

  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: responses } = await supabase
    .from("form_responses")
    .select("id, form_key, data, submitted_at")
    .eq("client_id", user.id);

  const responseMap = new Map<string, FormResponseRow>();
  for (const row of (responses as FormResponseRow[]) ?? []) {
    responseMap.set(row.form_key, row);
  }

  // Build form entries from the registry — generic so future forms appear automatically.
  const formKeys = Object.keys(formRegistry) as FormKey[];

  return (
    <PageContainer width="app">
      <PageHeader
        title="Your forms"
        subtitle="Complete required forms. They must be on file before booking."
      />

      <FormsClient
        formKeys={formKeys}
        initialResponses={Object.fromEntries(responseMap)}
      />
    </PageContainer>
  );
}
