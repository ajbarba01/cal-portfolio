import { getCachedUser } from "@/lib/supabase/server-cache";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import { PetsClient } from "./_components/pets-client";
import { listClientPets, type ClientPetView } from "@/features/pets";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/feedback/error-state";

/** A pet plus a resolved (signed) photo URL for display. */
export type PetView = ClientPetView;

export default async function PetsPage() {
  const { user } = await getCachedUser();

  if (!user) redirect("/login");

  const { data: pets, error } = await listClientPets(
    createServiceClient(),
    user.id,
  );

  if (error) {
    console.error("PetsPage: failed to load pets", error);
    return (
      <PageContainer width="app">
        <PageHeader title="Your pets" />
        <ErrorState
          title="Couldn't load your pets"
          message="Please try again shortly."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="app">
      <PageHeader
        title="Your pets"
        subtitle="Add or edit your pets. Name, species, breed, a photo, and any care notes."
      />

      <PetsClient pets={pets} />
    </PageContainer>
  );
}
