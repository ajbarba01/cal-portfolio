import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";

import { ContactForm } from "./_components/contact-form";
import { copy } from "@/content/marketing";

export const metadata = { title: "Contact" };

export default async function ContactPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let defaults = { name: "", email: "", phone: "" };
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();
    defaults = {
      name: profile?.full_name ?? "",
      email: profile?.email ?? user.email ?? "",
      phone: profile?.phone ?? "",
    };
  }

  return (
    <PageContainer width="read" className="py-12 sm:py-16">
      <PageHeader
        title={copy["contact.header"]}
        subtitle={copy["contact.subtitle"]}
      />
      <ContactForm
        defaultName={defaults.name}
        defaultEmail={defaults.email}
        defaultPhone={defaults.phone}
      />
    </PageContainer>
  );
}
