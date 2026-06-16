import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ShowcaseClient } from "./showcase-client";

export const metadata: Metadata = {
  title: "Component Showcase",
  robots: { index: false, follow: false },
};

/**
 * Dev-only component catalog (`/showcase`). Renders the shared primitives with
 * the real components + live tokens so groupings can be verified visually and
 * design decisions (e.g. the input fill) made side by side. Returns 404 in
 * production so it never ships to the live site.
 */
export default function ShowcasePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ShowcaseClient />;
}
