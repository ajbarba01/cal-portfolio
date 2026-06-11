import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { AppShell } from "@/components/layout/app-shell";
import { adminNav, type NavBadges } from "@/components/layout/nav-config";
import { getAttentionCounts } from "@/features/admin";

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

  const attention = await getAttentionCounts();
  const navBadges: NavBadges = {
    "/admin/bookings": {
      count: attention.pendingApprovals,
      label: "awaiting approval",
    },
    "/admin/inquiries": { count: attention.newInquiries, label: "new" },
  };

  return (
    <PageShell zoneNav={adminNav} navBadges={navBadges}>
      <AppShell nav={adminNav} identity={identity} navBadges={navBadges}>
        {children}
      </AppShell>
    </PageShell>
  );
}
