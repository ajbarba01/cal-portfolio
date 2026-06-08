import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";

import { ContactForm } from "./_components/contact-form";

export const metadata = { title: "Contact" };

export default async function ContactPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let defaults = { name: "", email: "" };
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    defaults = {
      name: profile?.full_name ?? "",
      email: profile?.email ?? user.email ?? "",
    };
  }

  return (
    <PageContainer width="read" className="py-12 sm:py-16">
      <PageHeader
        title="[[HEADER: Contact]]"
        subtitle="[[BODY: what the contact form is for]]"
      />
      <ContactForm defaultName={defaults.name} defaultEmail={defaults.email} />
    </PageContainer>
  );
}
