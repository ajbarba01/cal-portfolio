/**
 * Root 404 — the fallback Next renders for a URL that matches no route at all
 * (nothing in the tree to bubble a not-found boundary through), so it can't
 * inherit the site shell. Segment-level 404s (a page calling `notFound()`, or a
 * path that fails to match within (site)) use `(site)/not-found.tsx` instead,
 * which does render inside the shell.
 * Server component.
 */

import { TextLink } from "@/components/ui/text-link";

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

      <TextLink href="/" className="mt-8">
        Back to home
      </TextLink>
    </main>
  );
}
