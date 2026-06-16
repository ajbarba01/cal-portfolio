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
  species: "dog" | "cat";
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
      .select("id, name, species")
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

  // Account-scoped rows key by form_key (pet_id null).
  const owner = responses.find((r) => r.form_key === "owner" && !r.pet_id);
  const homeAccess = responses.find(
    (r) => r.form_key === "home_access" && !r.pet_id,
  );
  const homeSitting = responses.find(
    (r) => r.form_key === "home_sitting" && !r.pet_id,
  );

  // Pet-scoped rows: keyed by `${form_key}:${pet_id}` for pet_care and pet_walk.
  const petResponses: Record<string, FormResponseRow> = {};
  for (const r of responses) {
    if (r.pet_id && (r.form_key === "pet_care" || r.form_key === "pet_walk")) {
      petResponses[`${r.form_key}:${r.pet_id}`] = r;
    }
  }

  return (
    <PageContainer width="app">
      <PageHeader
        title="Your profiles"
        subtitle="Keep these up to date and don't worry, these forms are confidential and secure."
      />
      <FormsClient
        owner={owner}
        homeAccess={homeAccess}
        homeSitting={homeSitting}
        pets={pets}
        petResponses={petResponses}
        acceptedAuthVersion={latestAuth?.version ?? null}
        acceptedAuthAt={latestAuth?.accepted_at ?? null}
      />
    </PageContainer>
  );
}
