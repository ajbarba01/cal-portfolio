/**
 * 404 for the (site) route tree — used whenever a page under (marketing),
 * (account) or (admin) calls `notFound()`, or a path fails to match inside this
 * segment. Rendered inside `(site)/layout.tsx`, so it inherits the site shell
 * (header + footer) instead of standing alone.
 *
 * A URL that matches no route at all (no segment in the tree to bubble up
 * through) still falls back to the root `src/app/not-found.tsx`, which Next
 * requires for that case regardless of route groups.
 */

import { PageContainer } from "@/components/layout/page-container";
import { TextLink } from "@/components/ui/text-link";

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="flex flex-1 items-center justify-center py-16"
    >
      <PageContainer
        width="narrow"
        className="flex flex-col items-center text-center"
      >
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
      </PageContainer>
    </main>
  );
}
