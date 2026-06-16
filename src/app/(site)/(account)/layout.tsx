import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/server-cache";
import { AppShell } from "@/components/layout/app-shell";
import { accountNav } from "@/components/layout/nav-config";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Account zone shell. The real auth + onboarding gate lives in middleware
 * (`src/lib/supabase/proxy.ts`); this keeps a thin unauthenticated backstop and
 * renders the persistent account sidebar. Header/footer come from the (site) shell.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getCachedUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, onboarding_status")
    .eq("id", user.id)
    .single();
  const identity = profile?.full_name ?? user.email ?? "Signed in";
  const locked = profile?.onboarding_status !== "approved";

  return (
    <AppShell nav={accountNav} identity={identity} locked={locked}>
      {children}
    </AppShell>
  );
}
