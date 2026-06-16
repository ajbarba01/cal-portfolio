import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/server-cache";
import { redirect } from "next/navigation";
import { EXPENSE_AUTH_KIND } from "@/features/accounts";
import { FormsClient } from "./_components/forms-client";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

export interface FormResponseRow {
  id: string;
  form_key: string;
  pet_id: string | null;
  data: Record<string, unknown>;
  submitted_at: string;
}

export interface PetRef {
  id: string;
  name: string;
}

export default async function FormsPage() {
  const { user } = await getCachedUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  // Load profile responses, pets, and the latest expense authorization together.
  const [responsesRes, petsRes, authRes] = await Promise.all([
    supabase
      .from("form_responses")
      .select("id, form_key, pet_id, data, submitted_at")
      .eq("client_id", user.id),
    supabase
      .from("pets")
      .select("id, name")
      .eq("client_id", user.id)
      .order("created_at"),
    supabase
      .from("authorizations")
      .select("version, accepted_at")
      .eq("client_id", user.id)
      .eq("kind", EXPENSE_AUTH_KIND)
      .order("accepted_at", { ascending: false })
      .limit(1),
  ]);

  const responses = (responsesRes.data as FormResponseRow[]) ?? [];
  const pets = (petsRes.data as PetRef[]) ?? [];
  const latestAuth = (
    authRes.data as { version: string; accepted_at: string }[]
  )?.[0];

  // Account-scoped rows key by form_key (pet_id null); pet rows key by pet_id.
  const owner = responses.find((r) => r.form_key === "owner" && !r.pet_id);
  const home = responses.find((r) => r.form_key === "home" && !r.pet_id);
  const petResponses: Record<string, FormResponseRow> = {};
  for (const r of responses) {
    if (r.form_key === "pet" && r.pet_id) petResponses[r.pet_id] = r;
  }

  return (
    <PageContainer width="app">
      <PageHeader
        title="Your profiles"
        subtitle="Keep these up to date and don't worry, these forms are confidential and secure."
      />
      <FormsClient
        owner={owner}
        home={home}
        pets={pets}
        petResponses={petResponses}
        acceptedAuthVersion={latestAuth?.version ?? null}
        acceptedAuthAt={latestAuth?.accepted_at ?? null}
      />
    </PageContainer>
  );
}
