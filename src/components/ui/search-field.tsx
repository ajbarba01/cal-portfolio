"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Shared search field for list/search pages: a leading lucide search icon over
 * a flex-growing input with a descriptive placeholder. Single source of truth so
 * every page's search box reads identically.
 */
export function SearchField({
  value,
  onValueChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  /** Defaults to the placeholder when omitted. */
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-48 flex-1", className)}>
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="h-9 pl-9"
      />
    </div>
  );
}
