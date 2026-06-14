import { cn } from "@/lib/utils";

/**
 * Spinner — a loading circle showing only a single grey arc (the rest of the
 * ring is transparent) that rotates. CSS-only rotation; honors reduced motion
 * (the arc freezes but still reads as a busy indicator). Grey = muted-foreground
 * token; size and thickness scale via props.
 */
export function Spinner({
  className,
  size = 32,
  thickness = 3,
  label = "Loading",
}: {
  className?: string;
  size?: number;
  thickness?: number;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "text-muted-foreground inline-block animate-spin rounded-full border-transparent border-t-current motion-reduce:animate-none",
        className,
      )}
      style={{ width: size, height: size, borderWidth: thickness }}
    />
  );
}

/**
 * PageLoader — centered spinner for route-level `loading.tsx` fallbacks. Fills
 * the content slot it's dropped into and vertically centers the circle.
 */
export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div
      className="flex min-h-dvh flex-1 items-center justify-center"
      aria-busy="true"
    >
      <Spinner size={40} label={label} />
    </div>
  );
}
