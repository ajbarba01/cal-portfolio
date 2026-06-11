"use client";

import { cn } from "@/lib/utils";

/**
 * Shared numbered pager (‹ Prev · 1 2 3 · Next ›) for any list page that can
 * grow past one page. Renders nothing when there is only a single page. The
 * caller owns the current page state and slicing (see {@link paginate}).
 */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  className,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-wrap items-center justify-center gap-1.5",
        className,
      )}
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="border-border bg-card hover:bg-accent disabled:hover:bg-card focus-visible:ring-ring h-9 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
      >
        ‹ Prev
      </button>
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          aria-current={n === page ? "page" : undefined}
          onClick={() => onPageChange(n)}
          className={cn(
            "border-border focus-visible:ring-ring h-9 min-w-9 rounded-md border px-2 text-sm focus-visible:ring-2 focus-visible:outline-none",
            n === page
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card hover:bg-accent",
          )}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        className="border-border bg-card hover:bg-accent disabled:hover:bg-card focus-visible:ring-ring h-9 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
      >
        Next ›
      </button>
    </nav>
  );
}
