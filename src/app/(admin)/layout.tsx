import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { adminNav } from "@/components/layout/nav-config";

/** Guard for all (admin) routes: unauthenticated or non-admin role → redirect. */
export default async function AdminLayout({
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
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    redirect("/");
  }

  const identity = `${profile?.full_name ?? user.email ?? "Admin"} · admin`;

  return (
    <AppShell nav={adminNav} identity={identity}>
      {children}
    </AppShell>
  );
}
