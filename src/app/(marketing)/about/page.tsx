/**
 * About page — static bio + service overview.
 * Server component.
 */

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      {/* TODO: real copy before launch */}

      <h1 className="text-foreground mb-6 text-3xl font-bold tracking-tight">
        About Cal
      </h1>

      <section aria-labelledby="bio-heading" className="mb-10">
        <h2
          id="bio-heading"
          className="text-foreground mb-3 text-xl font-semibold"
        >
          Hi, I&apos;m Cal.
        </h2>
        <div className="text-muted-foreground flex flex-col gap-4 leading-relaxed">
          <p>
            I&apos;ve been walking and caring for dogs in Boulder for several
            years. What started as helping neighbors turned into a small,
            intentional business built on trust and repeat clients.
          </p>
          <p>
            I keep my client roster small on purpose — so every dog I care for
            gets real attention, not a rushed visit squeezed between ten others.
            Your pet&apos;s routine, quirks, and needs matter to me.
          </p>
          <p>
            I&apos;m fully insured, pet first-aid certified, and always happy to
            meet before the first booking so your dog can get comfortable with
            me first.
          </p>
        </div>
      </section>

      <section aria-labelledby="approach-heading" className="mb-10">
        <h2
          id="approach-heading"
          className="text-foreground mb-3 text-xl font-semibold"
        >
          My approach
        </h2>
        <ul className="text-muted-foreground flex flex-col gap-3 leading-relaxed">
          <li>
            <strong className="text-foreground">Small &amp; personal</strong> —
            limited spots so I&apos;m never stretched thin.
          </li>
          <li>
            <strong className="text-foreground">
              Consistent communication
            </strong>{" "}
            — updates and photos during every visit.
          </li>
          <li>
            <strong className="text-foreground">Flexible scheduling</strong> —
            drop-in, full house sits, or regular weekly walks.
          </li>
          <li>
            <strong className="text-foreground">Sliding-scale pricing</strong> —
            I believe quality pet care should be accessible. Reach out and we
            can figure out what works.
          </li>
        </ul>
      </section>

      <section aria-labelledby="references-heading">
        <h2
          id="references-heading"
          className="text-foreground mb-3 text-xl font-semibold"
        >
          References
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          {/* TODO: add real references before launch */}
          References from long-term clients available on request. You can also
          read what past clients have said on the{" "}
          <a
            href="/reviews"
            className="text-foreground underline underline-offset-4 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Reviews
          </a>{" "}
          page.
        </p>
      </section>
    </div>
  );
}
