/**
 * Resources page — local dog resources, FAQ placeholders.
 * Static server component.
 */

const localResources = [
  {
    title: "[[Resource 1: name]]",
    description: "[[Resource 1: one-line description]]",
    href: "#",
  },
  {
    title: "[[Resource 2: name]]",
    description: "[[Resource 2: one-line description]]",
    href: "#",
  },
  {
    title: "Animal Emergency & Referral Center of Northern Colorado",
    description: "24/7 emergency veterinary care in Colorado.",
    href: "https://aercnc.com",
  },
  {
    title: "ASPCA Poison Control Hotline",
    description: "(888) 426-4435 — available 24/7 for pet poison emergencies.",
    href: "https://www.aspca.org/pet-care/animal-poison-control",
  },
];

const faqItems = [
  { question: "[[FAQ 1: question]]", answer: "[[FAQ 1: answer]]" },
  { question: "[[FAQ 2: question]]", answer: "[[FAQ 2: answer]]" },
  { question: "[[FAQ 3: question]]", answer: "[[FAQ 3: answer]]" },
  { question: "[[FAQ 4: question]]", answer: "[[FAQ 4: answer]]" },
  { question: "[[FAQ 5: question]]", answer: "[[FAQ 5: answer]]" },
];

export default function ResourcesPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-foreground mb-5 text-3xl font-bold tracking-tight">
        Resources
      </h1>
      {/* Local resources */}
      <section aria-labelledby="local-resources-heading" className="mb-12">
        <h2
          id="local-resources-heading"
          className="text-foreground mb-4 text-xl font-semibold"
        >
          Local dog resources
        </h2>
        <ul className="flex flex-col gap-4" role="list">
          {localResources.map(({ title, description, href }) => (
            <li
              key={href}
              className="border-border border-b pb-4 last:border-0"
            >
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground font-medium underline underline-offset-4 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {title}
              </a>
              <p className="text-muted-foreground mt-0.5 text-sm">
                {description}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-heading">
        <h2
          id="faq-heading"
          className="text-foreground mb-4 text-xl font-semibold"
        >
          Frequently asked questions
        </h2>
        <dl className="flex flex-col gap-6">
          {faqItems.map(({ question, answer }) => (
            <div key={question}>
              <dt className="text-foreground mb-1 font-medium">{question}</dt>
              <dd className="text-muted-foreground text-sm leading-relaxed">
                {answer}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
