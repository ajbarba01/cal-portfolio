/**
 * Renders a long-form marketing copy body from the registry by ID as block
 * content: blank-line-separated paragraphs, with `## ` lines turned into
 * subsection subheads. Inline `[label](href)` markers are linkified per
 * paragraph via the same `segmentCopy` engine as `MarketingCopy` (see
 * `src/content/linkify.ts`).
 *
 * Use this for service detail bodies and any copy slot whose text may carry
 * multiple paragraphs or subsections; for single-line slots use `MarketingCopy`.
 * A body with one block and no `## ` renders as a single paragraph. Server
 * component.
 */
import { Fragment } from "react";
import { TextLink } from "@/components/ui/text-link";
import { copy, type CopyId } from "@/content/marketing";
import { segmentCopy } from "@/content/linkify";

const HEADING_PREFIX = "## ";

function Inline({ text }: { text: string }) {
  return (
    <>
      {segmentCopy(text).map((segment, i) =>
        segment.href ? (
          <TextLink key={i} href={segment.href}>
            {segment.text}
          </TextLink>
        ) : (
          <Fragment key={i}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}

export function MarketingProse({
  id,
  className,
}: {
  id: CopyId;
  className?: string;
}) {
  const blocks = copy[id]
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div
      className={["flex flex-col gap-4", className].filter(Boolean).join(" ")}
    >
      {blocks.map((block, i) =>
        block.startsWith(HEADING_PREFIX) ? (
          <h3
            key={i}
            className="font-heading text-foreground mt-2 text-lg font-medium first:mt-0"
          >
            <Inline text={block.slice(HEADING_PREFIX.length)} />
          </h3>
        ) : (
          <p key={i} className="text-muted-foreground leading-relaxed">
            <Inline text={block} />
          </p>
        ),
      )}
    </div>
  );
}
