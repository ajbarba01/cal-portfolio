import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileForm } from "./_components/profile-form";
import { PasswordForm } from "./_components/password-form";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

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

      <section className="mb-10">
        <h2 className="text-foreground mb-4 text-base font-medium">
          Contact info
        </h2>

        {/* Email is read-only — comes from auth.users, not the profiles table. */}
        <div className="mb-6 flex flex-col gap-1">
          <span className="text-muted-foreground text-sm font-medium">
            Email (read-only)
          </span>
          <span className="text-foreground text-sm">{user.email ?? "—"}</span>
        </div>

        <ProfileForm
          initialValues={{
            full_name: profile?.full_name ?? "",
            phone: profile?.phone ?? "",
            address: profile?.address ?? "",
            zip: profile?.zip ?? "",
          }}
        />
      </section>

      <section>
        <h2 className="text-foreground mb-4 text-base font-medium">
          Change password
        </h2>
        <PasswordForm />
      </section>
    </PageContainer>
  );
}
