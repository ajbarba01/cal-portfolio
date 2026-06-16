import { PageContainer } from "@/components/layout/page-container";
import { Reveal } from "@/components/effects/reveal";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import {
  FaqAccordion,
  type FaqItem,
} from "@/components/marketing/faq-accordion";
import { ContactForm } from "./_components/contact-form";
import {
  buildPageMetadata,
  buildBreadcrumbJsonLd,
  JsonLd,
} from "@/features/seo";

export const metadata = buildPageMetadata({
  title: "Contact",
  description:
    "Get in touch with Cal Barba about dog walking or house sitting on Colorado's Front Range.",
  path: "/contact",
});

// Reassurance question deflected here, beside the form, before clients ask.
const FAQ_ITEMS: ReadonlyArray<FaqItem> = [
  { id: "updates", questionId: "contact.faq.1.q", answerId: "contact.faq.1.a" },
];

// Static: the page reads no per-request data. Signed-in prefill (name/email/
// phone) resolves browser-side inside ContactForm, so this route prerenders.
export default function ContactPage() {
  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Contact", path: "/contact" },
        ])}
      />
      {/* Form — base band */}
      <section className="bg-background panel-ombre">
        <PageContainer width="narrow" className="py-10 sm:py-14">
          <Reveal>
            <ContactForm
              heading={<MarketingCopy id="contact.header" />}
              intro={<MarketingCopy id="contact.intro" />}
              replyNote={<MarketingCopy id="contact.replyNote" />}
            />
          </Reveal>
        </PageContainer>
      </section>

      {/* FAQ — full-width alt band; centered title over a read-width accordion. */}
      <section
        aria-labelledby="contact-faq-heading"
        className="bg-section-alt panel-ombre"
      >
        <PageContainer width="read" className="py-12 sm:py-16">
          <Reveal
            as="h2"
            id="contact-faq-heading"
            className="font-heading mx-auto max-w-[20ch] text-center text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Frequently Asked Questions
          </Reveal>
          <Reveal className="mt-6">
            <FaqAccordion items={FAQ_ITEMS} />
          </Reveal>
        </PageContainer>
      </section>
    </>
  );
}
