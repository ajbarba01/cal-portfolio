import Link from "next/link";

/** Shared sheet footer. Rendered by PageShell on every zone. */
export function SiteFooter() {
  return (
    <footer className="border-border border-t">
      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            ©&nbsp;{new Date().getFullYear()}&nbsp;Cal Barba — [[Pet care
            tagline]] · Colorado
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
  );
}
