/**
 * Renders a marketing copy string from the registry by ID, turning any inline
 * `[label](href)` markers into `next/link`s (see `src/content/linkify.ts`).
 * Bodies with no markers render as plain text with no wrapper element. Use this
 * anywhere a copy slot is rendered as text (a child, or a `ReactNode` prop like
 * `PageHeader`'s `subtitle`); do not use it for plain string attributes (`alt`,
 * `aria-label`) or for copy nested inside an `<a>`/`<button>` (a link can't nest
 * in those). Server component.
 */
import { Fragment } from "react";
import { TextLink } from "@/components/ui/text-link";
import { copy, type CopyId } from "@/content/marketing";
import { segmentCopy } from "@/content/linkify";

export function MarketingCopy({ id }: { id: CopyId }) {
  const segments = segmentCopy(copy[id]);
  return (
    <>
      {segments.map((segment, i) =>
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
