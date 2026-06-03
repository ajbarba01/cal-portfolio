import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";

/**
 * Thin server-side backstop for the (account) routes. The real auth + onboarding
 * gate lives in middleware (`src/lib/supabase/proxy.ts`), which reliably reads
 * the pathname and redirects un-onboarded users to /onboarding. This layout only
 * guards against the edge case of an unauthenticated request slipping past the
 * middleware matcher.
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

  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
