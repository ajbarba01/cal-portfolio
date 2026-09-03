import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/components/ui/control-variants";

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
        "text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-sm text-sm",
        focusRing,
        className,
      )}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
