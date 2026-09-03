import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/server-cache";
import { AppShell } from "@/components/layout/app-shell";
import { accountNav } from "@/components/layout/nav-config";
import { PageContainer } from "@/components/layout/page-container";
import { ErrorState } from "@/components/feedback/error-state";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Account zone shell. The real auth + onboarding gate lives in middleware
 * (`src/lib/supabase/proxy.ts`); this keeps a thin unauthenticated backstop and
 * renders the persistent account sidebar. Header/footer come from the (site) shell.
 *
 * It is also where a failed profile read lands: middleware lets such a request
 * through rather than redirecting on a guess, and this layout renders the error.
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
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, onboarding_status")
    .eq("id", user.id)
    .single();

  // A failed read says nothing about approval, so neither the open nav nor the
  // locked one would be honest — and the locked one would tell an approved
  // client to go finish onboarding they already finished. Surface the failure.
  if (error) {
    console.error("AccountLayout: profile read failed", error);
    return (
      <main className="flex-1">
        <PageContainer width="app">
          <ErrorState
            title="Couldn't load this"
            message="Please try again shortly."
          />
        </PageContainer>
      </main>
    );
  }

  const identity = profile?.full_name ?? user.email ?? "Signed in";
  const locked = profile?.onboarding_status !== "approved";

  return (
    <AppShell nav={accountNav} identity={identity} locked={locked}>
      {children}
    </AppShell>
  );
}
