import Link from "next/link";
import { Mail } from "lucide-react";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import { socials } from "@/content/socials";

/**
 * Inline Instagram icon (Lucide v1 does not ship brand icons).
 * strokeWidth 1.8 matches the lucide Mail icon weight used alongside it.
 */
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Inline TikTok SVG path (simple-icons, viewBox 0 0 24 24). */
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.88a8.18 8.18 0 0 0 4.78 1.52V7.0a4.85 4.85 0 0 1-1.01-.31z" />
    </svg>
  );
}

/** Footer nav links — chrome, not Cal's copy; mirrors header tabs minus Home. */
const footerNavLinks = [
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/resources", label: "Resources" },
  { href: "/contact", label: "Contact" },
] as const;

/** Shared sheet footer. Rendered by PageShell on every zone. */
export function SiteFooter() {
  return (
    <footer className="bg-card border-border border-t">
      {/* Inner container aligned to header: same max-width + horizontal padding. */}
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        {/* ── Desktop: single row ─────────────────────────────────────── */}
        <div className="hidden sm:flex sm:items-center sm:justify-between sm:gap-4 sm:py-6.5">
          {/* Left: copyright */}
          <p className="text-muted-foreground text-sm">
            ©&nbsp;{new Date().getFullYear()}&nbsp;Cal Barba —{" "}
            <MarketingCopy id="footer.tagline" /> · Colorado
          </p>

          {/* Center/Right: nav links */}
          <nav aria-label="Footer navigation">
            <ul className="flex gap-4.5 text-sm">
              {footerNavLinks.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Right: social icons */}

          <div className="flex gap-1.5" role="list" aria-label="Social links">
            {socials.instagram ? (
              <a
                href={socials.instagram}
                role="listitem"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="text-sand-700 hover:bg-muted hover:text-brand-strong flex size-9 items-center justify-center rounded-[10px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <InstagramIcon className="size-4.25" />
              </a>
            ) : null}

            {socials.tiktok ? (
              <a
                href={socials.tiktok}
                role="listitem"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok"
                className="text-sand-700 hover:bg-muted hover:text-brand-strong flex size-9 items-center justify-center rounded-[10px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <TikTokIcon className="size-4.25" />
              </a>
            ) : null}

            {/* Mail always renders — links to /contact, NEVER mailto: */}
            <Link
              href="/contact"
              role="listitem"
              aria-label="Contact form"
              className="text-sand-700 hover:bg-muted hover:text-brand-strong flex size-9 items-center justify-center rounded-[10px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Mail size={17} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* ── Mobile: stacked, centered ───────────────────────────────── */}
        <div className="flex flex-col items-center gap-3.5 py-5.5 text-center sm:hidden">
          {/* Socials row first on mobile (matches mockup order) */}
          <div className="flex gap-1.5" role="list" aria-label="Social links">
            {socials.instagram ? (
              <a
                href={socials.instagram}
                role="listitem"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="text-sand-700 hover:bg-muted hover:text-brand-strong flex size-9 items-center justify-center rounded-[10px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <InstagramIcon className="size-4.25" />
              </a>
            ) : null}

            {socials.tiktok ? (
              <a
                href={socials.tiktok}
                role="listitem"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok"
                className="text-sand-700 hover:bg-muted hover:text-brand-strong flex size-9 items-center justify-center rounded-[10px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <TikTokIcon className="size-4.25" />
              </a>
            ) : null}

            {/* Mail always renders */}
            <Link
              href="/contact"
              role="listitem"
              aria-label="Contact form"
              className="text-sand-700 hover:bg-muted hover:text-brand-strong flex size-9 items-center justify-center rounded-[10px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Mail size={17} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </div>

          {/* Nav row */}
          <nav aria-label="Footer navigation">
            <ul className="flex gap-3.5 text-sm">
              {footerNavLinks.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Copyright last on mobile */}
          <p className="text-muted-foreground text-sm">
            ©&nbsp;{new Date().getFullYear()}&nbsp;Cal Barba · Colorado
          </p>
        </div>
      </div>
    </footer>
  );
}
