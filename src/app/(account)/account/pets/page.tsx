import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import { PetsClient } from "./_components/pets-client";
import type { Pet } from "@/features/accounts/account-actions";

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
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-foreground mb-2 text-2xl font-semibold">Your pets</h1>
      <p className="text-muted-foreground mb-8 text-sm">
        Add or edit your pets. Name, species, breed, a photo, and any care
        notes.
      </p>

      <nav aria-label="Account sections" className="mb-8 flex gap-4 text-sm">
        <a
          href="/account"
          className="text-muted-foreground hover:text-foreground"
        >
          Profile
        </a>
        <a
          href="/account/pets"
          className="text-foreground font-medium underline"
        >
          Pets
        </a>
        <a
          href="/account/forms"
          className="text-muted-foreground hover:text-foreground"
        >
          Forms
        </a>
        <a
          href="/account/bookings"
          className="text-muted-foreground hover:text-foreground"
        >
          Bookings
        </a>
      </nav>

      <PetsClient pets={views} />
    </main>
  );
}
