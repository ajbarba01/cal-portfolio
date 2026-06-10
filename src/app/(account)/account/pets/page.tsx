import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import { PetsClient } from "./_components/pets-client";
import type { Pet } from "@/features/accounts";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

/** A pet plus a resolved (signed) photo URL for display. */
export interface PetView extends Pet {
  photoUrl: string | null;
}

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export default async function PetsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("pets")
    .select("id, name, species, breed, notes, photo_url")
    .eq("client_id", user.id)
    .order("created_at", { ascending: true });

  const pets = (rows as Pet[]) ?? [];

  // Resolve private photo paths to short-lived signed URLs via the service role.
  const svc = createServiceClient();
  const views: PetView[] = await Promise.all(
    pets.map(async (p) => {
      if (!p.photo_url) return { ...p, photoUrl: null };
      const { data } = await svc.storage
        .from("pet-photos")
        .createSignedUrl(p.photo_url, SIGNED_URL_TTL_SECONDS);
      return { ...p, photoUrl: data?.signedUrl ?? null };
    }),
  );

  return (
    <PageContainer width="app">
      <PageHeader
        title="Your pets"
        subtitle="Add or edit your pets. Name, species, breed, a photo, and any care notes."
      />

      <PetsClient pets={views} />
    </PageContainer>
  );
}
