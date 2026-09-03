import { redirect } from "next/navigation";

import { EXPENSE_AUTH_KIND, listClientForms } from "@/features/accounts";
import type { PetRow } from "@/features/pets";
import { ErrorState } from "@/components/feedback/error-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/server-cache";

import { FormsClient } from "./_components/forms-client";

/**
 * The pet fields this page hands the forms client, projected out of the pets
 * read so the species union stays the table's own — the hand-rolled copy this
 * replaced claimed `"dog" | "cat"` while the column holds all seven species.
 */
export type PetRef = Pick<PetRow, "id" | "name" | "species">;

export default async function FormsPage() {
  const { user } = await getCachedUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  // Profile responses, pets, and the latest expense authorization are
  // independent — fetch in parallel.
  const [formsRes, petsRes, authRes] = await Promise.all([
    listClientForms(supabase, user.id),
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

  const readError = formsRes.error ?? petsRes.error ?? authRes.error;
  if (readError) {
    console.error("FormsPage: failed to load account forms", readError);
    return (
      <PageContainer width="app">
        <PageHeader title="Your profiles" />
        <ErrorState
          title="Couldn't load your profiles"
          message="Please try again shortly."
        />
      </PageContainer>
    );
  }

  const pets = petsRes.data ?? [];
  const latestAuth = authRes.data?.[0];

  return (
    <PageContainer width="app">
      <PageHeader
        title="Your profiles"
        subtitle="Keep these up to date. They're confidential and secure."
      />
      <FormsClient
        responses={formsRes.data}
        pets={pets}
        acceptedAuthVersion={latestAuth?.version ?? null}
        acceptedAuthAt={latestAuth?.accepted_at ?? null}
      />
    </PageContainer>
  );
}
