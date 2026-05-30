import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formRegistry, type FormKey } from "@/features/forms/registry";
import { FormsClient } from "./_components/forms-client";

export interface FormResponseRow {
  id: string;
  form_key: string;
  data: Record<string, unknown>;
  submitted_at: string;
}

export default async function FormsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

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
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-foreground mb-2 text-2xl font-semibold">
        Your forms
      </h1>
      <p className="text-muted-foreground mb-8 text-sm">
        Complete required forms. They must be on file before booking.
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
          className="text-muted-foreground hover:text-foreground"
        >
          Dogs
        </a>
        <a
          href="/account/forms"
          className="text-foreground font-medium underline"
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

      <FormsClient
        formKeys={formKeys}
        initialResponses={Object.fromEntries(responseMap)}
      />
    </main>
  );
}
