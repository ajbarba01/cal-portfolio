import { createClient } from "@/lib/supabase/server";

import { PageContainer } from "@/components/layout/page-container";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import { ContactForm } from "./_components/contact-form";

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
    <PageContainer width="narrow" className="py-10 sm:py-14">
      <ContactForm
        defaultName={defaults.name}
        defaultEmail={defaults.email}
        defaultPhone={defaults.phone}
        heading={<MarketingCopy id="contact.header" />}
        intro={<MarketingCopy id="contact.intro" />}
        replyNote={<MarketingCopy id="contact.replyNote" />}
      />
    </PageContainer>
  );
}
