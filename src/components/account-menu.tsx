"use client";

/**
 * AccountMenu — header control for signed-in users.
 *
 * The trigger is a profile disc (clay gradient + the user's initials) that links
 * to /account (unchanged behavior). A small clay caret orbits the disc: parked at
 * the LEFT (9 o'clock) at rest, it sweeps counterclockwise to the BOTTOM (6
 * o'clock) on hover/focus, where it points down into the panel like a connector.
 *
 * Hovering or keyboard-focusing the trigger reveals a dropdown styled like the
 * About page — a clay-soft "crest" header (large disc, name, email over the
 * panel-ombre wash) above the account nav (every accountNav section, icon-led)
 * plus Sign out. Reveal is CSS-only (group-hover / group-focus-within) so it
 * works for mouse and keyboard without extra state; sign-out logic lives in
 * SignOutButton.
 *
 * The panel hangs from the navbar's BOTTOM EDGE (not from the disc): it is
 * absolutely positioned against the header's inner container — whose box spans
 * the full header height — so `top-full` tracks the navbar bottom no matter the
 * header height. Because the disc sits mid-navbar, an invisible hover BRIDGE
 * (revealed with the group) spans the bottom-padding gap between disc and panel
 * so the cursor never crosses a dead zone. The bridge renders BEFORE the trigger
 * in the DOM, so the disc paints on top and stays clickable where they overlap.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isActiveNav,
  isActiveSection,
} from "@/components/layout/is-active-nav";
import { accountNav, NAV_ICONS } from "@/components/layout/nav-config";
import { SignOutButton } from "@/components/sign-out-button";
import { Surface } from "@/components/ui/surface";

/** Initials for the disc: first+last of the name, else the email's first char. */
function initialsOf(name: string | null, email: string | null): string {
  const trimmed = name?.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
    return (first + last).toUpperCase();
  }
  if (email) return email[0]!.toUpperCase();
  return "?";
}

export function AccountMenu({
  fullName,
  email,
}: {
  fullName: string | null;
  email: string | null;
}) {
  const pathname = usePathname();
  const active = isActiveSection(pathname, "/account");
  const initials = initialsOf(fullName, email);
  const displayName = fullName?.trim() || "Your account";

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
        className="invisible absolute top-1/2 right-5 bottom-0 w-60 opacity-0 transition-[opacity,visibility] delay-150 duration-200 [clip-path:polygon(100%_0,100%_100%,0_100%)] group-focus-within:visible group-focus-within:opacity-100 group-focus-within:delay-0 group-hover:visible group-hover:opacity-100 group-hover:delay-0 sm:right-8"
      />

      <Link
        href="/account"
        aria-current={active ? "page" : undefined}
        aria-haspopup="menu"
        aria-label={fullName ? `Account — ${fullName}` : "Account"}
        // Clicking the trigger (mouse) navigates but leaves focus on it, so
        // group-focus-within would pin the panel open after the cursor leaves.
        // Blur on click so only genuine keyboard focus keeps the menu revealed.
        onClick={(e) => e.currentTarget.blur()}
        className="relative block rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {/* data-spotlight-link: CursorRing writes --u (0→1 by cursor distance)
            onto this element; the caret orbit below reads it for a proximity
            sweep. Inherits to descendants. */}
        <span data-spotlight-link className="relative block size-11">
          {/* Profile disc — soft-clay fill + clay-strong initials (AA-safe pair).
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
            {initials}
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
          up with the disc. data-ring-include (on the visible box) keeps the cursor
          glow on the open panel; it's skipped while visibility:hidden. */}
      <div
        data-ring-include
        className="invisible absolute top-full right-5 z-30 opacity-0 transition-[opacity,visibility] delay-150 duration-200 group-focus-within:visible group-focus-within:opacity-100 group-focus-within:delay-0 group-hover:visible group-hover:opacity-100 group-hover:delay-0 sm:right-8"
      >
        <Surface
          role="menu"
          variant="floating"
          className="w-60 overflow-hidden rounded-b-2xl"
        >
          {/* Crest header — clay-soft band with the warm ombre wash, echoing the
              About page hero. */}
          <div className="border-border panel-ombre bg-background border-b px-4 pt-6 pb-5 text-center">
            {/* Crest avatar: SAME soft-clay fill as the trigger disc. The crest
                band is lighter (bg-background + ombre wash) so the avatar reads
                against it — mirroring the clay disc on the white navbar. */}
            <span
              aria-hidden
              className="bg-sidebar-active text-brand-strong font-heading mx-auto mb-2.5 flex size-14 items-center justify-center rounded-full text-xl shadow-sm"
            >
              {initials}
            </span>
            <p className="font-heading text-foreground text-base font-semibold">
              {displayName}
            </p>
            {email && (
              <p className="text-brand-strong mt-0.5 truncate text-xs">
                {email}
              </p>
            )}
          </div>

          {/* Account nav — icon-led, mirroring the account sidebar. panel-ombre
              re-glows the white body at its top, the About-page "per-band" wash. */}
          <div className="panel-ombre py-1.5">
            {accountNav.items.map(({ href, label }) => {
              const itemActive = isActiveNav(pathname, href);
              const Icon = NAV_ICONS[href];
              return (
                <Link
                  key={href}
                  href={href}
                  role="menuitem"
                  aria-current={itemActive ? "page" : undefined}
                  onClick={(e) => e.currentTarget.blur()}
                  className={cn(
                    "group/item flex items-center gap-3 px-4 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2",
                    itemActive
                      ? "bg-sidebar-active text-brand-strong font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {Icon && (
                    <Icon
                      className={cn(
                        "size-4 shrink-0 transition-colors",
                        itemActive
                          ? "text-brand-strong"
                          : "text-muted-foreground/70 group-hover/item:text-brand-strong",
                      )}
                      aria-hidden
                    />
                  )}
                  {label}
                </Link>
              );
            })}
            <SignOutButton
              role="menuitem"
              className="text-destructive-warm hover:bg-destructive-warm/10 border-border mt-1.5 flex w-full items-center gap-3 border-t px-4 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
            >
              <LogOut className="size-4 shrink-0" aria-hidden />
              Sign out
            </SignOutButton>
          </div>
        </Surface>
      </div>
    </div>
  );
}
