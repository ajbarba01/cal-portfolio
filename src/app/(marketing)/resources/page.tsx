/**
 * Resources page — local dog resources, FAQ placeholders.
 * Static server component.
 */

const localResources = [
  {
    title: "Boulder County Humane Society",
    description: "Adoptions, lost & found pets, and community programs.",
    href: "https://www.boulderhumane.org",
  },
  {
    title: "Boulder Dog Park — Howard Heuston",
    description: "Off-leash area at 35th & Arapahoe.",
    href: "https://bouldercolorado.gov/parks-recreation",
  },
  {
    title: "Animal Emergency & Referral Center of Northern Colorado",
    description: "24/7 emergency veterinary care in Fort Collins.",
    href: "https://aercnc.com",
  },
  {
    title: "ASPCA Poison Control Hotline",
    description: "(888) 426-4435 — available 24/7 for pet poison emergencies.",
    href: "https://www.aspca.org/pet-care/animal-poison-control",
  },
];

const faqItems = [
  {
    question: "How far in advance should I book?",
    answer:
      "For house sits, at least 1–2 weeks is ideal. Walk slots can often be filled with a few days notice. The sooner the better — spot availability is limited.",
  },
  {
    question: "Do you care for cats?",
    answer:
      "Yes — house sitting services include cat care. Drop-in visits for cats are available too. See the Services page for details.",
  },
  {
    question: "What happens during a house sit?",
    answer:
      "I stay at your home overnight, maintaining your pet's normal feeding and walk schedule, and send you daily updates with photos. The goal is minimal disruption for your pet.",
  },
  {
    question: "Is there a meet-and-greet before the first booking?",
    answer:
      "Yes, always. I do a no-charge introductory meet at your home before any booking so your dog can get comfortable with me first.",
  },
  {
    question: "What if my dog has special needs?",
    answer:
      "Reach out before booking so we can talk through your pet's needs. I'm experienced with medications, anxiety, and behavioral quirks.",
  },
];

export default function ResourcesPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-foreground mb-10 text-3xl font-bold tracking-tight">
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
