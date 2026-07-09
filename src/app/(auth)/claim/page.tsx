import { redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

import { ClaimForm } from "./_components/claim-form";

export default async function ClaimPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No invite session → the link was invalid/expired or opened directly.
  if (!user) redirect("/login?error=claim_expired");

  // Already-claimed account opening an old link → send to normal app.
  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("unclaimed")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.unclaimed !== true) redirect("/account");

  return (
    <PageContainer width="read">
      <PageHeader
        title="Claim your account"
        subtitle="Cal set up your profile. Choose a password to take it over."
      />
      <ClaimForm />
    </PageContainer>
  );
}
