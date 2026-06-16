import Link from "next/link";
import { Mail, Calendar } from "lucide-react";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import { socials } from "@/content/socials";
import { FooterReveal } from "./footer-reveal";

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

const socialIconClass =
  "text-muted-foreground hover:bg-muted hover:text-brand-strong flex size-9 items-center justify-center rounded-[10px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2";

/** Social icon row. Icons with no URL render nothing (no dead links). */
function SocialLinks() {
  return (
    <div className="flex gap-1.5" role="list" aria-label="Social links">
      {socials.instagram ? (
        <a
          href={socials.instagram}
          role="listitem"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram"
          className={socialIconClass}
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
          className={socialIconClass}
        >
          <TikTokIcon className="size-4.25" />
        </a>
      ) : null}
      <Link
        href="/services"
        role="listitem"
        aria-label="Booking page"
        className={socialIconClass}
      >
        <Calendar size={17} strokeWidth={1.8} aria-hidden="true" />
      </Link>{" "}
      {/* Mail always renders — links to /contact, NEVER mailto: */}
      <Link
        href="/contact"
        role="listitem"
        aria-label="Contact form"
        className={socialIconClass}
      >
        <Mail size={17} strokeWidth={1.8} aria-hidden="true" />
      </Link>
    </div>
  );
}

/**
 * Personal designer credit. Split row: brand tagline left, maker credit right
 * (stacks centered on mobile). The mailto here is the designer's own channel and
 * is intentional — distinct from Cal's contact, which always routes to /contact.
 */
function DesignerCredit() {
  return (
    <div className="border-border/60 flex flex-col items-center gap-1.5 border-t py-3 text-center sm:flex-row sm:justify-between sm:gap-3 sm:text-left">
      <span className="text-muted-foreground/60 text-xs">Made with care</span>
      <span className="text-muted-foreground/80 text-xs">
        Site by{" "}
        <a
          href="mailto:zander@barba.org"
          className="hover:text-brand-strong font-medium underline-offset-[3px] transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Zander Barba
        </a>
      </span>
    </div>
  );
}

/** Shared sheet footer. Rendered once by PageShell in the persistent (site) shell. */
export function SiteFooter() {
  return (
    <FooterReveal className="bg-card border-border border-t">
      {/* Inner container aligned to header: same max-width + horizontal padding. */}
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        {/* ── Desktop: single row ─────────────────────────────────────── */}
        <div className="hidden sm:flex sm:items-center sm:justify-between sm:gap-4 sm:py-6.5">
          {/* Left: copyright */}
          <p className="text-muted-foreground text-sm">
            ©&nbsp;{new Date().getFullYear()}&nbsp;Cal Barba —{" "}
            <MarketingCopy id="footer.tagline" />
          </p>

          {/* Right: social icons */}
          <SocialLinks />
        </div>

        {/* ── Mobile: stacked, centered ───────────────────────────────── */}
        <div className="flex flex-col items-center gap-3.5 py-5.5 text-center sm:hidden">
          {/* Socials row first on mobile (matches mockup order) */}
          <SocialLinks />

          {/* Copyright last on mobile */}
          <p className="text-muted-foreground text-sm">
            ©&nbsp;{new Date().getFullYear()}&nbsp;Cal Barba · Colorado
          </p>
        </div>

        {/* ── Shared designer credit (below both layouts) ─────────────── */}
        <DesignerCredit />
      </div>
    </FooterReveal>
  );
}
