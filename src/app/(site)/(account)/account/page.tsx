import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/server-cache";
import { redirect } from "next/navigation";
import { ProfileForm } from "./_components/profile-form";
import { PasswordForm } from "./_components/password-form";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShimmerCard } from "@/components/ui/shimmer-card";

export default async function AccountPage() {
  const { user } = await getCachedUser();

  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, address, zip")
    .eq("id", user.id)
    .single();

  return (
    <PageContainer width="app">
      <PageHeader
        title="Your profile"
        subtitle="Update your contact info. Email is managed through your login."
      />

      <div className="flex flex-col gap-5">
        <ShimmerCard className="flex flex-col gap-4 p-5">
          <CardHeader>
            <CardTitle className="text-base">Contact info</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Email is read-only — comes from auth.users, not the profiles table. */}
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-sm font-medium">
                Email <span className="font-normal">(read-only)</span>
              </span>
              <div className="border-border bg-muted text-muted-foreground rounded-md border px-3 py-2 text-sm">
                {user.email ?? "—"}
              </div>
            </div>

            <ProfileForm
              initialValues={{
                full_name: profile?.full_name ?? "",
                phone: profile?.phone ?? "",
                address: profile?.address ?? "",
                zip: profile?.zip ?? "",
              }}
            />
          </CardContent>
        </ShimmerCard>

        <ShimmerCard className="flex flex-col gap-4 p-5">
          <CardHeader>
            <CardTitle className="text-base">Change password</CardTitle>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </ShimmerCard>
      </div>
    </PageContainer>
  );
}
