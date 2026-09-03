import Link from "next/link";
import { redirect } from "next/navigation";

import { ErrorState } from "@/components/feedback/error-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import type { InquiryRow } from "@/features/inquiries";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/server-cache";

import { AccountInquiriesClient } from "./_components/account-inquiries-client";

export default async function AccountInquiriesPage() {
  const { user } = await getCachedUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  // window = newest 500; client search/pager operate on the window.
  const { data, error } = await supabase
    .from("inquiries")
    .select(
      "id, client_id, name, email, phone, subject, message, status, replied_at, resolved_at, created_at",
    )
    .eq("client_id", user.id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("AccountInquiriesPage: failed to load inquiries", error);
    return (
      <PageContainer width="app">
        <PageHeader title="Your inquiries" />
        <ErrorState
          title="Couldn't load your inquiries"
          message="Please try again shortly."
        />
      </PageContainer>
    );
  }

  const inquiries: InquiryRow[] = (data ?? []).map((row) => ({
    ...row,
    // `inquiries.status` is a text column carrying
    // `check (status in ('new', 'resolved'))`, so the generated `string` is
    // wider than the column can hold. Only this field is asserted; the rest of
    // the row still has to satisfy `InquiryRow` on its own.
    status: row.status as InquiryRow["status"],
  }));

  return (
    <PageContainer width="app">
      <PageHeader
        title="Your inquiries"
        subtitle="Messages you've sent to Cal. Mark one resolved once you no longer need a reply."
        actions={
          <Link href="/contact" className={buttonVariants()}>
            New inquiry
          </Link>
        }
      />
      <AccountInquiriesClient initialInquiries={inquiries} />
    </PageContainer>
  );
}
