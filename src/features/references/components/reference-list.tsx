"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Mail, MessageSquare, Phone } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextLink } from "@/components/ui/text-link";
import { Reveal } from "@/components/effects/reveal";
import { references, type Reference } from "@/content/references";
import { cn } from "@/lib/utils";
import { referenceFirstName } from "../first-name";

/**
 * The reference chips on /about. Every chip is a control: a client who agreed
 * to publish their details opens a dialog holding them, and everyone else
 * routes through the contact form, where Cal passes the request on. That split
 * is the registry's `contact` field — the page has no second source of consent
 * to drift from.
 *
 * The dialog is an affordance, not a privacy measure. This is a client island,
 * so anything in the registry ships in the browser bundle and is scrapable
 * whether or not a visitor opens the dialog. `contact !== null` is the one
 * gate that matters: a detail Cal has not been told to publish stays out of
 * src/content/references.ts entirely.
 *
 * Renders nothing at all while the registry is empty, so /about carries the
 * band's "coming soon" intro alone until Cal supplies entries.
 *
 * `blurDataURLs` is keyed by photo basename and resolved by the page: the blur
 * map is a few dozen KB of base64 and belongs in the server bundle, not shipped
 * to the browser for a set of 28px chips.
 */
export function ReferenceList({
  blurDataURLs = {},
}: {
  blurDataURLs?: Record<string, string | undefined>;
}) {
  const [revealed, setRevealed] = React.useState<Reference | null>(null);

  if (references.length === 0) return null;

  return (
    <>
      <ul role="list" className="mt-6 flex flex-wrap gap-2.5">
        {references.map((reference) => (
          <Reveal as="li" key={reference.name}>
            {reference.contact ? (
              <Button
                variant="outline"
                size="lg"
                aria-haspopup="dialog"
                className={chipClass(reference)}
                onClick={() => setRevealed(reference)}
              >
                <ChipFace
                  reference={reference}
                  blurDataURL={
                    reference.photo ? blurDataURLs[reference.photo] : undefined
                  }
                />
                {reference.contact.phone ? (
                  <Phone
                    className="text-muted-foreground size-3.5"
                    aria-hidden
                  />
                ) : (
                  <Mail
                    className="text-muted-foreground size-3.5"
                    aria-hidden
                  />
                )}
              </Button>
            ) : (
              <Link
                href={`/contact?ref=${encodeURIComponent(referenceFirstName(reference.name))}`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  chipClass(reference),
                )}
              >
                <ChipFace
                  reference={reference}
                  blurDataURL={
                    reference.photo ? blurDataURLs[reference.photo] : undefined
                  }
                />
                <MessageSquare
                  className="text-muted-foreground size-3.5"
                  aria-hidden
                />
              </Link>
            )}
          </Reveal>
        ))}
      </ul>

      <Dialog
        open={revealed !== null}
        onOpenChange={(open) => {
          if (!open) setRevealed(null);
        }}
        title={revealed?.name}
      >
        <div className="mt-4 flex flex-col items-start gap-2 text-sm">
          {revealed?.contact?.phone ? (
            <TextLink
              href={`tel:${revealed.contact.phone.replace(/[^\d+]/g, "")}`}
              className="inline-flex items-center gap-2"
            >
              <Phone className="size-4" aria-hidden />
              {revealed.contact.phone}
            </TextLink>
          ) : null}
          {revealed?.contact?.email ? (
            <TextLink
              href={`mailto:${revealed.contact.email}`}
              className="inline-flex items-center gap-2"
            >
              <Mail className="size-4" aria-hidden />
              {revealed.contact.email}
            </TextLink>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}

/** Pill geometry: the photo sits flush inside the chip's leading edge. */
function chipClass(reference: Reference): string {
  return cn("gap-2 rounded-full pr-3.5", reference.photo ? "pl-1" : "pl-3.5");
}

/**
 * Pet face plus the leading name. The photo is decorative — the name beside it
 * is the control's accessible label, so a second reading of it would only be
 * noise.
 */
function ChipFace({
  reference,
  blurDataURL,
}: {
  reference: Reference;
  blurDataURL: string | undefined;
}) {
  return (
    <>
      {reference.photo ? (
        <span className="bg-sidebar-active relative size-7 shrink-0 overflow-hidden rounded-full">
          <Image
            src={`/references/${reference.photo}`}
            alt=""
            fill
            sizes="28px"
            placeholder={blurDataURL ? "blur" : "empty"}
            blurDataURL={blurDataURL}
            className="object-cover"
          />
        </span>
      ) : null}
      {referenceFirstName(reference.name)}
    </>
  );
}
