/**
 * Table — semantic <table> that renders as stacked labeled cards below `md`.
 * On mobile each <TableCell> shows its column name via `data-label`; pass it on
 * every cell, e.g. <TableCell data-label="Client">{name}</TableCell>.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-wrap" className="w-full">
      <table
        data-slot="table"
        className={cn("w-full text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("hidden md:table-header-group", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("block md:table-row-group", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-border bg-card mb-3 block rounded-xl border p-3",
        "md:mb-0 md:table-row md:rounded-none md:border-0 md:border-b md:bg-transparent md:p-0",
        className,
      )}
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
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "flex justify-between gap-3 py-1 text-right",
        "before:text-muted-foreground before:font-medium before:content-[attr(data-label)]",
        "md:table-cell md:px-3 md:py-2.5 md:text-left md:before:content-none",
        className,
      )}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
