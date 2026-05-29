import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Guard for all (account) routes:
 *   1. Unauthenticated → /login
 *   2. onboarding_complete=false AND not already on /onboarding → /onboarding
 *
 * Path detection: middleware (proxy.ts) forwards the current pathname as the
 * `x-pathname` request header, which Server Components read via next/headers.
 * This avoids client-side redirects and keeps the guard entirely server-side.
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
    .select("onboarding_complete")
    .eq("id", user.id)
    .single();

  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "";

  if (!profile?.onboarding_complete && pathname !== "/onboarding") {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
