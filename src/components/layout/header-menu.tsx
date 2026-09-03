"use client";

/**
 * HeaderMenu — the header's profile-disc control and the panel that hangs from
 * the navbar. Both header states compose it: AccountMenu (initials + account
 * sections) and SignInLink (person glyph + sign-in / create-account).
 *
 * The trigger is a profile disc that also links somewhere (/account, /login) —
 * clicking it navigates. A small clay caret orbits the disc: parked at the LEFT
 * (9 o'clock) at rest, it sweeps counterclockwise to the BOTTOM (6 o'clock) on
 * hover/focus, where it points down into the panel like a connector.
 *
 * Reveal is CSS-only (group-hover / group-focus-within) so it works for mouse
 * and keyboard without extra state. The panel is a plain `<nav>` of links, not a
 * menu widget: there is no roving-focus / arrow-key model here, so Tab is the
 * only correct traversal and menu roles would promise a keyboard contract the
 * panel does not implement.
 *
 * The panel hangs from the navbar's BOTTOM EDGE (not from the disc): it is
 * absolutely positioned against the header's inner container — whose box spans
 * the full header height — so `top-full` tracks the navbar bottom no matter the
 * header height. Because the disc sits mid-navbar, an invisible hover BRIDGE
 * (revealed with the group) spans the bottom-padding gap between disc and panel
 * so the cursor never crosses a dead zone. The bridge renders BEFORE the trigger
 * in the DOM, so the disc paints on top and stays clickable where they overlap.
 */

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { focusRing } from "@/components/ui/control-variants";
import { Surface } from "@/components/ui/surface";

/**
 * Blur the trigger after a POINTER click only. Clicking navigates but leaves
 * focus behind, so `group-focus-within` would pin the panel open after the
 * cursor leaves. A keyboard activation reports `detail === 0`; blurring there
 * would throw the user back to the top of the document, so it keeps its focus.
 */
function blurOnPointerActivation(event: React.MouseEvent<HTMLElement>): void {
  if (event.detail !== 0) event.currentTarget.blur();
}

const REVEAL =
  "invisible opacity-0 transition-[opacity,visibility] delay-150 duration-200 group-hover:visible group-hover:opacity-100 group-hover:delay-0 group-focus-within:visible group-focus-within:opacity-100 group-focus-within:delay-0";

/** One row in the panel — a link with an optional leading icon. */
export function HeaderMenuLink({
  href,
  icon: Icon,
  /** Highlight this row as the panel's primary destination. */
  emphasized = false,
  /** The row is the page currently shown. */
  current = false,
  children,
}: {
  href: string;
  icon?: LucideIcon;
  emphasized?: boolean;
  current?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      onClick={blurOnPointerActivation}
      className={cn(
        "group/item flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
        focusRing,
        "focus-visible:-outline-offset-2",
        emphasized
          ? "bg-sidebar-active text-brand-strong font-semibold"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {Icon ? (
        <Icon
          aria-hidden
          className={cn(
            "size-4 shrink-0 transition-colors",
            emphasized
              ? "text-brand-strong"
              : "text-muted-foreground/70 group-hover/item:text-brand-strong",
          )}
        />
      ) : null}
      {children}
    </Link>
  );
}

export function HeaderMenu({
  href,
  triggerLabel,
  navLabel,
  current = false,
  disc,
  crestAvatar,
  crestTitle,
  crestSubtitle,
  children,
}: {
  /** Where the trigger disc navigates. */
  href: string;
  /** Accessible name for the trigger disc. */
  triggerLabel: string;
  /** Accessible name for the panel's navigation landmark. */
  navLabel: string;
  /** The trigger destination is the page currently shown. */
  current?: boolean;
  /** Initials or glyph inside the trigger disc. */
  disc: React.ReactNode;
  /** Initials or glyph inside the larger crest avatar. */
  crestAvatar: React.ReactNode;
  crestTitle: string;
  crestSubtitle?: React.ReactNode;
  /** Panel rows — {@link HeaderMenuLink}s and/or a sign-out control. */
  children: React.ReactNode;
}) {
  return (
    <div className="group">
      {/* Hover bridge — the classic "safe triangle": its three points are the
          profile disc (apex) and the dropdown's two top corners (base). The box
          is anchored to the header container so its top-right corner lands on the
          disc (top-1/2 ≈ disc center, right-5/right-8 = disc right edge) and its
          bottom edge meets the panel's top edge (bottom-0 = navbar bottom, w-60 =
          panel width); clip-path then carves the rectangle down to the triangle
          disc → panel-top-right → panel-top-left. Any diagonal toward the panel
          stays inside it. Placed BEFORE the trigger so the disc paints on top and
          stays clickable; the shared close delay keeps it alive during the grace
          period. */}
      <span
        aria-hidden
        className={cn(
          REVEAL,
          "absolute top-1/2 right-5 bottom-0 w-60 [clip-path:polygon(100%_0,100%_100%,0_100%)] sm:right-8",
        )}
      />

      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        aria-label={triggerLabel}
        onClick={blurOnPointerActivation}
        className={cn("relative block rounded-full", focusRing)}
      >
        {/* data-spotlight-link: CursorRing writes --u (0→1 by cursor distance)
            onto this element; the caret orbit below reads it for a proximity
            sweep. Inherits to descendants. */}
        <span data-spotlight-link className="relative block size-11">
          {/* Profile disc — soft-clay fill + clay-strong content (AA-safe pair).
              No resting ring/shadow (kept crisp); a soft clay ring blooms only on
              hover/focus. The ring is INSET so it draws inside the disc rim — an
              outset ring would clip on the right, since the disc is the rightmost
              element in the header. */}
          <span
            aria-hidden
            className={cn(
              "flex size-11 items-center justify-center rounded-full",
              "bg-sidebar-active text-brand-strong font-heading text-[0.95rem]",
              "transition-transform duration-300 ease-out",
              "group-focus-within:scale-105 group-hover:scale-105",
              "group-hover:ring-brand/15 group-hover:ring-2 group-hover:ring-inset",
              "group-focus-within:ring-brand/15 group-focus-within:ring-2 group-focus-within:ring-inset",
            )}
          >
            {disc}
          </span>

          {/* Caret orbit: rotating this box around the disc center sweeps the
              caret around it. Proximity-driven — rotation = 90deg·(1 − --u), so the
              caret sits at LEFT when the cursor is far (u=0) and swings toward the
              BOTTOM as it nears (u→1). When the menu is OPEN (hover/focus) it pins
              straight down (rotate 0). --u comes from CursorRing (see above). */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 transform-[rotate(calc(90deg*(1_-_var(--u,0))))]",
              "transition-transform duration-200 ease-out",
              "group-focus-within:transform-[rotate(0deg)] group-hover:transform-[rotate(0deg)]",
              "motion-reduce:transition-none",
            )}
          >
            <span className="border-t-brand-strong absolute -bottom-2.25 left-1/2 -ml-1.25 h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent" />
          </span>
        </span>
      </Link>

      {/* Panel hangs from the navbar bottom: absolutely positioned against the
          header container, top-full = navbar bottom regardless of header height;
          right-5/right-8 match the container's px so the panel's right edge lines
          up with the disc. */}
      <div className={cn(REVEAL, "absolute top-full right-5 z-30 sm:right-8")}>
        <Surface
          variant="floating"
          className="rounded-b-card w-60 overflow-hidden"
        >
          {/* Crest header — clay-soft band with the warm ombre wash, echoing the
              About page hero. The crest band is lighter (bg-background + ombre
              wash) so the avatar reads against it — mirroring the clay disc on
              the white navbar. */}
          <div className="border-border panel-ombre bg-background border-b px-4 pt-6 pb-5 text-center">
            <span
              aria-hidden
              className="bg-sidebar-active text-brand-strong font-heading shadow-elev-1 mx-auto mb-2.5 flex size-14 items-center justify-center rounded-full text-xl"
            >
              {crestAvatar}
            </span>
            <p className="font-heading text-foreground text-base font-semibold">
              {crestTitle}
            </p>
            {crestSubtitle ? (
              // truncate: a long email is ellipsized so the crest band keeps
              // its one-line height and the 240px panel never grows.
              <p className="text-brand-strong mt-0.5 truncate text-xs">
                {crestSubtitle}
              </p>
            ) : null}
          </div>

          {/* panel-ombre re-glows the white body at its top, the About-page
              "per-band" wash. */}
          <nav aria-label={navLabel} className="panel-ombre py-1.5">
            {children}
          </nav>
        </Surface>
      </div>
    </div>
  );
}
