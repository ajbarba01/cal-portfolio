/**
 * Session-aware shell for all public marketing routes.
 * Provides a persistent header + nav + footer.
 */

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/gallery", label: "Gallery" },
  { href: "/reviews", label: "Reviews" },
  { href: "/resources", label: "Resources" },
  { href: "/book", label: "Book" },
];

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <header className="border-border bg-background border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="text-foreground text-lg font-semibold tracking-tight hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Cal Barba
          </Link>

          <nav aria-label="Main navigation">
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              {navLinks.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-muted-foreground hover:text-foreground focus-visible:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="text-sm">
            {user ? (
              <Link
                href="/account"
                className="text-muted-foreground hover:text-foreground focus-visible:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Account
              </Link>
            ) : (
              <Link
                href="/login"
                className="text-muted-foreground hover:text-foreground focus-visible:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-border bg-background border-t">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">
              © {new Date().getFullYear()} Cal Barba — Dog Walking &amp; House
              Sitting · Boulder, CO
            </p>
            <nav aria-label="Footer navigation">
              <ul className="flex gap-4 text-sm">
                <li>
                  <Link
                    href="/about"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    About
                  </Link>
                </li>
                <li>
                  <Link
                    href="/services"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Services
                  </Link>
                </li>
                <li>
                  <Link
                    href="/book"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Book
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </footer>
    </>
  );
}
