import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DogsClient } from "./_components/dogs-client";

export interface DogRow {
  id: string;
  name: string;
  breed: string | null;
  notes: string | null;
}

export default async function DogsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: dogs } = await supabase
    .from("dogs")
    .select("id, name, breed, notes")
    .eq("client_id", user.id)
    .order("created_at", { ascending: true });

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-foreground mb-2 text-2xl font-semibold">Your dogs</h1>
      <p className="text-muted-foreground mb-8 text-sm">
        Add or edit your dogs. Name, breed, and any care notes.
      </p>

      <nav aria-label="Account sections" className="mb-8 flex gap-4 text-sm">
        <a
          href="/account"
          className="text-muted-foreground hover:text-foreground"
        >
          Profile
        </a>
        <a
          href="/account/dogs"
          className="text-foreground font-medium underline"
        >
          Dogs
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

      <DogsClient initialDogs={(dogs as DogRow[]) ?? []} />
    </main>
  );
}
