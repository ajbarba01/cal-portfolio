import { buildPageMetadata } from "@/features/seo";

// The resources page is a client component (Multiswitch filter state), so it
// can't export `metadata` itself — Next strips metadata from client modules.
// This server layout owns the route's metadata; the page owns the breadcrumb.
export const metadata = buildPageMetadata({
  title: "Resources",
  description:
    "Pet-care guidance and Colorado-specific safety notes — heat, foxtails, algae blooms — from Cal Barba.",
  path: "/resources",
});

export default function ResourcesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
