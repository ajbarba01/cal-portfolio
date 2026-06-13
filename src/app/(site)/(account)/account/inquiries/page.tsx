import { redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import type { InquiryRow } from "@/features/inquiries";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/server-cache";

import { AccountInquiriesClient } from "./_components/account-inquiries-client";

export default async function AccountInquiriesPage() {
  const { user } = await getCachedUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("inquiries")
    .select(
      "id, client_id, name, email, phone, subject, message, status, replied_at, resolved_at, created_at",
    )
    .eq("client_id", user.id)
    .order("created_at", { ascending: false });

  const inquiries = (data ?? []) as InquiryRow[];

  return (
    <PageContainer width="app">
      <PageHeader
        title="Your inquiries"
        subtitle="Messages you've sent to Cal. Mark one resolved once you no longer need a reply."
      />
      <AccountInquiriesClient initialInquiries={inquiries} />
    </PageContainer>
  );
}
