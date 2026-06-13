import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/server-cache";
import { AppShell } from "@/components/layout/app-shell";
import { AdminContentSkeleton } from "@/components/layout/zone-skeletons";
import { adminNav, type NavBadges } from "@/components/layout/nav-config";
import { getAttentionCounts } from "@/features/admin";

/** Guard for all (admin) routes: unauthenticated or non-admin role → redirect. */
export default async function AdminLayout({
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
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    redirect("/");
  }

  const identity = `${profile?.full_name ?? user.email ?? "Admin"} · admin`;

  // Don't await — pass the promise so AppShell's badge loader resolves it inside
  // its own Suspense boundary and the admin loading.tsx can paint immediately.
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
    <AppShell
      nav={adminNav}
      identity={identity}
      navBadgesPromise={attentionPromise}
      contentSkeleton={<AdminContentSkeleton />}
    >
      {children}
    </AppShell>
  );
}
