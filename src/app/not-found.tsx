/**
 * Global 404 — rendered for any unmatched route path.
 * Server component.
 */

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-muted-foreground font-mono text-sm tracking-widest">
        404
      </p>

      <h1 className="text-foreground mt-3 text-3xl font-bold tracking-tight">
        Page not found
      </h1>

      <p className="text-muted-foreground mt-3 leading-relaxed">
        The page you&rsquo;re looking for doesn&rsquo;t exist or has moved.
      </p>

      <Link
        href="/"
        className="text-foreground mt-8 underline underline-offset-4 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Back to home
      </Link>
    </main>
  );
}
