import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { accountNav } from "@/components/layout/nav-config";

/**
 * Account zone shell. The real auth + onboarding gate lives in middleware
 * (`src/lib/supabase/proxy.ts`); this layout keeps a thin unauthenticated
 * backstop and renders the persistent account sidebar via AppShell.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();
  const identity = profile?.full_name ?? user.email ?? "Signed in";

  return (
    <AppShell nav={accountNav} identity={identity}>
      {children}
    </AppShell>
  );
}
