/**
 * About page — bio + approach + references, document-calm read column.
 * Server component.
 */
import Link from "next/link";
import Image from "next/image";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

const approach = [
  {
    id: "a1",
    title: "[[Item 1: approach principle]]",
    detail: "[[Item 1: detail]]",
  },
  {
    id: "a2",
    title: "[[Item 2: approach principle]]",
    detail: "[[Item 2: detail]]",
  },
  {
    id: "a3",
    title: "[[Item 3: approach principle]]",
    detail: "[[Item 3: detail]]",
  },
];

export default function AboutPage() {
  return (
    <PageContainer width="read" className="py-12 sm:py-16">
      <PageHeader title="About" subtitle="[[BODY: one-line about summary]]" />

      <figure className="border-border my-8 overflow-hidden rounded-lg border">
        <div className="relative aspect-[3/2] w-full">
          <Image
            src="/gallery/IMG_0048.JPG"
            alt="Cal with a dog in their care"
            fill
            sizes="(max-width: 680px) 100vw, 65ch"
            className="object-cover"
          />
        </div>
      </figure>

      <section aria-labelledby="bio-heading" className="mb-10">
        <h2
          id="bio-heading"
          className="font-heading mb-3 text-xl font-semibold"
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
          className="font-heading mb-3 text-xl font-semibold"
        >
          My approach
        </h2>
        <ul className="text-muted-foreground flex flex-col gap-3 leading-relaxed">
          {approach.map((a) => (
            <li key={a.id}>
              <strong className="text-foreground">{a.title}</strong> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="references-heading">
        <h2
          id="references-heading"
          className="font-heading mb-3 text-xl font-semibold"
        >
          References
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          [[BODY: pointer to references — see the]]{" "}
          <Link
            href="/reviews"
            className="text-brand-strong underline underline-offset-4 hover:opacity-70"
          >
            Reviews
          </Link>{" "}
          [[page]].
        </p>
      </section>
    </PageContainer>
  );
}
