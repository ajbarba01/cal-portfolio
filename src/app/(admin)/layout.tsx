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

  // Don't await attention counts here — this layout must not block on badge data
  // so the admin loading.tsx fallback can paint immediately. Instead pass the
  // un-resolved promise; HeaderAuth and AppShell's BadgesLoader each await it
  // inside their own Suspense boundaries.
  const attentionPromise = getAttentionCounts().then((attention) => {
    const badges: NavBadges = {
      "/admin/bookings": {
        count: attention.pendingApprovals,
        label: "awaiting approval",
      },
      "/admin/inquiries": { count: attention.newInquiries, label: "new" },
    };
    return badges;
  });

  return (
    <PageShell zoneNav={adminNav} navBadgesPromise={attentionPromise}>
      <AppShell
        nav={adminNav}
        identity={identity}
        navBadgesPromise={attentionPromise}
      >
        {children}
      </AppShell>
    </PageShell>
  );
}
