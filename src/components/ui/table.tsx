"use client";

/**
 * Table — semantic <table> that renders as stacked labeled cards below a
 * breakpoint, then as a real table at/above it. On the card layout each
 * <TableCell> shows its column name via `data-label`; pass it on every cell,
 * e.g. <TableCell data-label="Client">{name}</TableCell>.
 *
 * `stackUntil` controls where the switch happens (default "md"). Dense tables
 * with many columns should use "lg" so they stay as cards through the narrow
 * 768–1024 band instead of cramming a too-wide table. The wrapper is always
 * `overflow-x-auto`, so a table can never overflow the page — worst case it
 * scrolls within its own box.
 *
 * NOTE: classes are full static strings per breakpoint (not interpolated) so
 * Tailwind's compiler can see them.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

type StackBreakpoint = "md" | "lg";

const STACK_CLASSES: Record<
  StackBreakpoint,
  { header: string; body: string; row: string; cell: string }
> = {
  md: {
    header: "hidden md:table-header-group",
    body: "block md:table-row-group",
    row: "mb-3 block rounded-xl border p-3 md:mb-0 md:table-row md:rounded-none md:border-0 md:border-b md:bg-transparent md:p-0",
    cell: "flex justify-between gap-3 py-1 text-right md:table-cell md:px-3 md:py-2.5 md:text-left md:before:content-none",
  },
  lg: {
    header: "hidden lg:table-header-group",
    body: "block lg:table-row-group",
    row: "mb-3 block rounded-xl border p-3 lg:mb-0 lg:table-row lg:rounded-none lg:border-0 lg:border-b lg:bg-transparent lg:p-0",
    cell: "flex justify-between gap-3 py-1 text-right lg:table-cell lg:px-3 lg:py-2.5 lg:text-left lg:before:content-none",
  },
};

const StackContext = React.createContext<StackBreakpoint>("md");

function Table({
  className,
  stackUntil = "md",
  ...props
}: React.ComponentProps<"table"> & { stackUntil?: StackBreakpoint }) {
  return (
    <StackContext.Provider value={stackUntil}>
      <div data-slot="table-wrap" className="w-full overflow-x-auto">
        <table
          data-slot="table"
          className={cn("w-full text-sm", className)}
          {...props}
        />
      </div>
    </StackContext.Provider>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  const bp = React.useContext(StackContext);
  return (
    <thead
      data-slot="table-header"
      className={cn(STACK_CLASSES[bp].header, className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  const bp = React.useContext(StackContext);
  return (
    <tbody
      data-slot="table-body"
      className={cn(STACK_CLASSES[bp].body, className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  const bp = React.useContext(StackContext);
  return (
    <tr
      data-slot="table-row"
      className={cn("border-border bg-card", STACK_CLASSES[bp].row, className)}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-muted-foreground px-3 py-2 text-left font-medium",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  const bp = React.useContext(StackContext);
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "before:text-muted-foreground before:font-medium before:content-[attr(data-label)]",
        STACK_CLASSES[bp].cell,
        className,
      )}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
