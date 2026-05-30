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
          What I do
        </h2>
        <div className="text-muted-foreground flex flex-col gap-4 leading-relaxed">
          <p>[[BODY: bio paragraph 1 — background/experience]]</p>
          <p>[[BODY: bio paragraph 2 — services offered]]</p>
          <p>[[BODY: bio paragraph 3 — additional context]]</p>
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
            <strong className="text-foreground">
              [[Item 1: approach principle]]
            </strong>{" "}
            — [[Item 1: detail]]
          </li>
          <li>
            <strong className="text-foreground">
              [[Item 2: approach principle]]
            </strong>{" "}
            — [[Item 2: detail]]
          </li>
          <li>
            <strong className="text-foreground">
              [[Item 3: approach principle]]
            </strong>{" "}
            — [[Item 3: detail]]
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
          [[BODY: pointer to references — see the&nbsp;
          <a
            href="/reviews"
            className="text-foreground underline underline-offset-4 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Reviews
          </a>{" "}
          page.]]
        </p>
      </section>
    </div>
  );
}
