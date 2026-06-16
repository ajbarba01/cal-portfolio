import { permanentRedirect } from "next/navigation";
import { buildPageMetadata } from "@/features/seo";

export const metadata = buildPageMetadata({
  title: "Book",
  description:
    "Check availability and book dog walking or house sitting with Cal Barba across the Front Range.",
  path: "/book",
});

export default async function BookPage() {
  permanentRedirect("/services");
}
