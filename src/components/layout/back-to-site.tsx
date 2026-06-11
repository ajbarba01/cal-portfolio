import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Wayfinding affordance for dead-end pages (onboarding, and any page without a
 * zone nav). A flat hierarchy needs an explicit way back / top-level indicator,
 * not a breadcrumb trail. Reusable across SP6 surfaces.
 */
export function BackToSite({
  href = "/",
  label = "Back to site",
  className,
}: {
  href?: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm",
        className,
      )}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
