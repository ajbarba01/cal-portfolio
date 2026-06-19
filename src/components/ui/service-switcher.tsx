import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Link-based segmented service switcher for the booking page header. Visually
 * matches the Multiswitch track (muted track, hairline border, control radius)
 * but each segment is a real <Link> to /book/[slug] — route nav, not stateful
 * toggle — so it works without JS and is keyboard/SEO-friendly. The active
 * service is a filled brand segment carrying aria-current.
 *
 * Mobile: the track uses `flex-wrap` so segments wrap at narrow viewports. We
 * drop `controlBox.md`'s fixed-height class and instead use `rounded-control`
 * with vertical padding so the track grows with wrapped rows without clipping.
 */
export function ServiceSwitcher({
  services,
  activeSlug,
}: {
  services: { slug: string; name: string }[];
  activeSlug: string;
}) {
  return (
    <nav
      aria-label="Choose a service"
      className={cn(
        // Match Multiswitch track: muted background, hairline border,
        // control radius. Use py-1 instead of the fixed-height controlBox.md
        // so the track grows naturally when segments wrap on narrow viewports.
        "bg-muted border-border rounded-control inline-flex flex-wrap items-stretch gap-0.5 border p-1",
      )}
    >
      {services.map((s) => {
        const isActive = s.slug === activeSlug;
        return (
          <Link
            key={s.slug}
            href={`/book/${s.slug}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              // Match Multiswitch segment geometry + focus ring. No shadow —
              // active state is conveyed by the brand fill, not elevation.
              "focus-visible:ring-ring inline-flex items-center rounded-md px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none",
              isActive
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.name}
          </Link>
        );
      })}
    </nav>
  );
}
