import { cn } from "@/lib/utils";

/**
 * Attention badge for nav affordances. Renders only when actionable (count > 0)
 * — an always-present badge loses meaning (industry rule). Solid attention red,
 * AA-contrast text; announces its count for AT.
 */
export function NavBadge({
  count,
  label,
  className,
}: {
  count: number;
  label: string;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      data-slot="nav-badge"
      aria-label={`${count} ${label}`}
      className={cn(
        "bg-attention text-attention-foreground inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs leading-none font-semibold",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
