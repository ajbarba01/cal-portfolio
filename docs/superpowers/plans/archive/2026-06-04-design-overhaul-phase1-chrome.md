# Design Overhaul — Phase 1: Shared Chrome + Core Components — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared shells (PageContainer/PageHeader, marketing two-tier header, account/admin sidebar) + the core component kit (card, badge, table, tabs, form field, select, feedback system) on the Phase-0 Trail tokens, mobile-first, so Phases 2–4 only compose.

**Architecture:** Presentational/composition phase on `@base-ui/react` v1.5 + the Phase-0 semantic tokens. Components follow the in-repo wrapper pattern (`data-slot` attr + `cn()` + `cva` for variants; see `src/components/ui/button.tsx`). One genuinely pure unit — nav active-state matching — is extracted and TDD'd; everything else is presentational, so verification is **typecheck + lint + build + visual/a11y walk** (mirrors the Phase-0 plan's rationale: the project's testable core in `features/*` is untouched). Mobile-first is authored, not bolted on: base styles target the phone, `sm:`/`md:` add desktop; nav→drawers, tables→stacked cards, dialogs→bottom-sheets, toasts→bottom-anchored.

**Tech Stack:** Next.js 16 App Router (RSC), Tailwind v4 (`@theme inline` in `globals.css`), `@base-ui/react` ^1.5, `next/font`, `lucide-react`, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-06-04-design-overhaul-phase1-chrome-design.md`

**Conventions:** Commit messages are **subject-line only**, Conventional Commits, **no body/trailer/Co-Authored-By** (repo CLAUDE.md). `husky` runs `lint-staged` (eslint+prettier) + `tsc --noEmit` on commit — let them run. Stage files **by name**, never `git add -A`. **Do NOT push** (Alex batches the push). All client components need `"use client"`. Reference **semantic tokens only** (e.g. `bg-card`, `text-muted-foreground`, `text-brand-strong`, `ring-ring`) — never hardcoded colors; whitespace from `space.*` token classes or the documented scale — no arbitrary `px-[...]`.

**Base-UI v1.5 part reference (verified from installed `index.parts.d.ts`):**

- `toast`: `Provider`, `Viewport`, `Root`, `Title`, `Description`, `Close`, `Action`, `Portal`, `Positioner`, `useToastManager`.
- `field`: `Root`, `Label`, `Control`, `Error`, `Description`, `Validity`.
- `select`: `Root`, `Trigger`, `Value`, `Icon`, `Portal`, `Positioner`, `Popup`, `List`, `Item`, `ItemText`, `ItemIndicator`, `Group`, `GroupLabel`.
- `tabs`: `Root`, `List`, `Tab`, `Indicator`, `Panel`.
- `dialog` / `alert-dialog`: `Root`, `Trigger`, `Portal`, `Backdrop`, `Popup`, `Title`, `Description`, `Close` (+ `alert-dialog` `createHandle`/`Handle` for imperative control).
- `drawer`: `Root`, `Trigger`, `Portal`, `Backdrop`, `Popup`, `Content`, `Title`, `Close`, `Viewport`.

> **For compound wrappers (Tasks 4–6, 9–11, 13–15):** before implementing, open the relevant component's `.d.ts` under `node_modules/@base-ui/react/esm/<comp>/<part>/` to confirm exact prop names (`open`/`onOpenChange`, `value`/`onValueChange`, `render`, etc.). The part **names** above are verified; **prop shapes** must be read from the types so the code typechecks.

---

## File map

**New — layout shells:** `src/components/layout/page-container.tsx`, `page-header.tsx`, `app-shell.tsx`, `app-sidebar.tsx`, `nav-config.ts` (zone nav types + lists), `is-active-nav.ts` (+ test).
**New — ui kit:** `src/components/ui/card.tsx`, `badge.tsx`, `skeleton.tsx`, `table.tsx`, `tabs.tsx`, `form-field.tsx`, `select.tsx`.
**New — feedback:** `src/components/feedback/error-state.tsx`, `empty-state.tsx`, `confirm-dialog.tsx`, `toast.tsx` (provider + `useToast` + `Toaster`).
**New — auth:** `src/components/sign-out-button.tsx` (shared sign-out action).
**Modified:** `src/components/site-header.tsx`, `src/components/account-menu.tsx`, `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, `src/components/ui/label.tsx`, `src/components/ui/calendar.tsx`, `src/app/layout.tsx`, `src/app/(marketing)/layout.tsx`, `src/app/(account)/layout.tsx`, `src/app/(admin)/layout.tsx`, `src/app/(account)/account/*` pages, `src/app/(admin)/admin/*` pages (incl. `admin/page.tsx` → redirect), `docs/FRONTEND.md`.

---

## Task 1: Shell primitives — `PageContainer` + `PageHeader`

**Files:**

- Create: `src/components/layout/page-container.tsx`, `src/components/layout/page-header.tsx`

- [ ] **Step 1: Create `PageContainer`.** Single source of width + horizontal padding. Reads `space.pageX` from `design-tokens.ts`; `width` picks the max.

```tsx
import { cn } from "@/lib/utils";
import { space } from "@/lib/design-tokens";

type PageContainerProps = React.ComponentProps<"div"> & {
  /** "read" = ~65ch reading column (marketing); "app" = wider (account/admin tables). */
  width?: "read" | "app";
};

const widths = {
  read: "max-w-[65ch]",
  app: "max-w-5xl",
} as const;

export function PageContainer({
  width = "read",
  className,
  ...props
}: PageContainerProps) {
  return (
    <div
      data-slot="page-container"
      className={cn("mx-auto w-full", widths[width], space.pageX, className)}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Create `PageHeader`.** Title (real `<h1>`, Fraunces via base rule) + optional subtitle + optional actions (stacks under title on mobile, inline at `sm:`). Vertical rhythm from `space`.

```tsx
import { cn } from "@/lib/utils";
import { space } from "@/lib/design-tokens";

type PageHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        "mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className={cn("flex flex-col", space.field)}>
        <h1 className="text-3xl leading-tight font-semibold tracking-tight">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}
```

- [ ] **Step 3: Verify.** Run: `npm run typecheck`. Expected: PASS (no errors). If `space.pageX`/`space.field` import errors, confirm `src/lib/design-tokens.ts` exports `space` (Phase 0 Task 5).

- [ ] **Step 4: Commit.**

```bash
git add src/components/layout/page-container.tsx src/components/layout/page-header.tsx
git commit -m "feat(layout): add PageContainer + PageHeader shell primitives"
```

---

## Task 2: Static UI primitives — `Card`, `Badge`, `Skeleton`

**Files:**

- Create: `src/components/ui/card.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/skeleton.tsx`

- [ ] **Step 1: `card.tsx`.** Surface + optional header/title/content subparts. Tokens only.

```tsx
import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground border-border flex flex-col gap-4 rounded-xl border p-5",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn("text-lg leading-tight font-semibold", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("text-sm", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardTitle, CardContent };
```

- [ ] **Step 2: `badge.tsx`.** `cva` variants on semantic + `status-*` roles.

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground",
        brand: "bg-brand text-brand-foreground",
        available: "bg-status-available text-status-available-foreground",
        booked: "bg-status-booked text-status-booked-foreground",
        unavailable: "bg-status-unavailable text-status-unavailable-foreground",
        destructive: "bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
```

- [ ] **Step 3: `skeleton.tsx`.** Token pulse placeholder.

```tsx
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-muted animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
```

- [ ] **Step 4: Verify.** Run: `npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/components/ui/card.tsx src/components/ui/badge.tsx src/components/ui/skeleton.tsx
git commit -m "feat(ui): add card, badge, skeleton primitives"
```

---

## Task 3: `Table` with mobile stacked-card pattern

**Files:**

- Create: `src/components/ui/table.tsx`

**Pattern:** real semantic `<table>` at `md:`; below `md` the same markup renders as stacked labeled cards. Achieved with responsive display utilities on the table parts + a `data-label` attr on each `<td>` surfaced via CSS `::before` on mobile. Keep it markup-driven so callers write normal table rows.

- [ ] **Step 1: Create `table.tsx`.**

```tsx
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
  // Hidden on mobile (stacked cards don't repeat a header); shown at md.
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
  // Mobile: each row is a bordered card. md: normal row with bottom border.
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
  // Mobile: flex row with the data-label as the left key (via ::before). md: plain cell.
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
```

- [ ] **Step 2: Document the `data-label` convention** with a JSDoc block at the top of the file:

```tsx
/**
 * Table — semantic <table> that renders as stacked labeled cards below `md`.
 * On mobile each <TableCell> shows its column name via `data-label`; pass it on
 * every cell, e.g. <TableCell data-label="Client">{name}</TableCell>.
 */
```

- [ ] **Step 3: Verify.** Run: `npm run typecheck`. Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add src/components/ui/table.tsx
git commit -m "feat(ui): add Table with mobile stacked-card pattern"
```

---

## Task 4: `Tabs` (base-ui)

**Files:**

- Create: `src/components/ui/tabs.tsx`

- [ ] **Step 1: Confirm props.** Open `node_modules/@base-ui/react/esm/tabs/root/TabsRoot.d.ts` and `tab/TabsTab.d.ts` — confirm `Root` takes `value`/`defaultValue`/`onValueChange` and `Tab` takes `value`.

- [ ] **Step 2: Create `tabs.tsx`.** Token-styled wrapper; active tab uses `text-foreground` + the `Indicator` underline in `--brand-strong`.

```tsx
"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("border-border relative flex gap-4 border-b", className)}
      {...props}
    />
  );
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        "text-muted-foreground data-[selected]:text-foreground data-[selected]:border-brand-strong focus-visible:ring-ring/50 -mb-px cursor-pointer border-b-2 border-transparent px-1 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3",
        className,
      )}
      {...props}
    />
  );
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={cn("outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTab, TabsPanel };
```

> If `TabsPrimitive.Root.Props` namespacing differs, fall back to `React.ComponentProps<typeof TabsPrimitive.Root>` (the type-read in Step 1 confirms which).

- [ ] **Step 3: Verify.** Run: `npm run typecheck`. Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add src/components/ui/tabs.tsx
git commit -m "feat(ui): add token-styled Tabs on base-ui"
```

---

## Task 5: `FormField` (base-ui field — the inline-error primitive)

**Files:**

- Create: `src/components/ui/form-field.tsx`

- [ ] **Step 1: Confirm props.** Open `node_modules/@base-ui/react/esm/field/root/FieldRoot.d.ts`, `error/FieldError.d.ts`, `control/FieldControl.d.ts` — confirm `Root` takes `name`/`invalid`, `Error` renders when invalid (and supports a `match` prop), `Control` forwards to the input.

- [ ] **Step 2: Create `form-field.tsx`.** Label + control + optional hint + inline error. Wires `aria-invalid`/`aria-describedby` via base-ui automatically. Composes the existing styled `Input`.

```tsx
"use client";

import { Field } from "@base-ui/react/field";
import { cn } from "@/lib/utils";
import { space } from "@/lib/design-tokens";
import { Input } from "@/components/ui/input";

type FormFieldProps = {
  label: React.ReactNode;
  name: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children?: React.ReactNode; // custom control; defaults to a styled Input
} & Omit<React.ComponentProps<typeof Input>, "name">;

export function FormField({
  label,
  name,
  hint,
  error,
  className,
  children,
  ...inputProps
}: FormFieldProps) {
  return (
    <Field.Root
      name={name}
      className={cn("flex flex-col", space.field, className)}
    >
      <Field.Label className="text-sm font-medium">{label}</Field.Label>
      {children ?? <Field.Control render={<Input {...inputProps} />} />}
      {hint ? (
        <Field.Description className="text-muted-foreground text-xs">
          {hint}
        </Field.Description>
      ) : null}
      {error ? (
        <Field.Error className="text-destructive text-xs" forceShow>
          {error}
        </Field.Error>
      ) : null}
    </Field.Root>
  );
}
```

> The `forceShow`/render-prop names come from the Step-1 type-read; adjust to the actual prop (e.g. base-ui `Field.Error` shows on validity state — if a controlled `error` string is passed, render a plain `<p className="text-destructive text-xs">` instead of `Field.Error`). Keep `aria` wiring intact.

- [ ] **Step 3: Verify.** Run: `npm run typecheck`. Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add src/components/ui/form-field.tsx
git commit -m "feat(ui): add FormField with inline error on base-ui field"
```

---

## Task 6: `Select` (base-ui — first humanized control)

**Files:**

- Create: `src/components/ui/select.tsx`

- [ ] **Step 1: Confirm props.** Open `node_modules/@base-ui/react/esm/select/root/SelectRoot.d.ts`, `trigger/...`, `item/...`, `positioner/...` — confirm `Root` takes `value`/`defaultValue`/`onValueChange`/`items`, `Item` takes `value`, and the portal/positioner/popup nesting.

- [ ] **Step 2: Create `select.tsx`.** Trigger styled like `Input`; popup as a `--popover` surface; items with check indicator.

```tsx
"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;

function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full items-center justify-between gap-2 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="text-muted-foreground">
        <ChevronsUpDown className="size-4" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

const SelectValue = SelectPrimitive.Value;

function SelectContent({
  className,
  children,
  ...props
}: SelectPrimitive.Popup.Props) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner sideOffset={4} className="z-50">
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "bg-popover text-popover-foreground border-border min-w-[8rem] rounded-lg border p-1 shadow-lg",
            className,
          )}
          {...props}
        >
          {children}
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm outline-none",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator>
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
```

> Prop namespaces (`SelectPrimitive.Trigger.Props` etc.) and `sideOffset` location are confirmed in Step 1; if a namespaced `.Props` type is absent use `React.ComponentProps<typeof X>`.

- [ ] **Step 3: Verify.** Run: `npm run typecheck`. Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add src/components/ui/select.tsx
git commit -m "feat(ui): add token-styled Select on base-ui"
```

---

## Task 7: Align existing primitives to Trail tokens (`button` brand variant, `input`, `label`, `calendar`)

**Files:**

- Modify: `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, `src/components/ui/label.tsx`, `src/components/ui/calendar.tsx`

- [ ] **Step 1: Add a `brand` button variant.** In `button.tsx` `buttonVariants` `variant` map, add after the `default` line:

```tsx
        brand: "bg-brand text-brand-foreground hover:bg-brand/90",
```

- [ ] **Step 2: Confirm token alignment.** Read `input.tsx`, `label.tsx`, `calendar.tsx` and verify they reference **only** semantic roles (`border-input`, `bg-card`, `text-muted-foreground`, `ring-ring`, `bg-primary`, `text-primary-foreground`, etc.) — they already do (Phase 0 left them semantic). Make **no change** unless a hardcoded color or a now-dead token (`--neutral-*`, `--green-soft` used directly) appears; if one does, swap to the correct semantic role. The Phase-0 `--ring` is `--clay-strong`, so focus rings already render clay — no edit needed.

- [ ] **Step 3: Verify build + visual.** Run: `npm run build`. Expected: PASS. Then `npm run dev`, open `http://localhost:3000`: default buttons are neutral near-black; add a temporary `<Button variant="brand">Test</Button>` to the home page, confirm it renders clay with light text, then remove it. Calendar (e.g. on `/book/[serviceSlug]` if reachable, or via the scheduler) renders with warm tokens + clay focus rings.

- [ ] **Step 4: Commit.**

```bash
git add src/components/ui/button.tsx src/components/ui/input.tsx src/components/ui/label.tsx src/components/ui/calendar.tsx
git commit -m "feat(ui): add brand button variant; confirm input/label/calendar token alignment"
```

---

## Task 8: `ErrorState` + `EmptyState` (shared friendly-state panel)

**Files:**

- Create: `src/components/feedback/error-state.tsx`, `src/components/feedback/empty-state.tsx`

- [ ] **Step 1: `error-state.tsx`.** Icon + friendly title + message + optional Retry. Copy stays `[[ ]]`-stubbable by the caller.

```tsx
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ErrorStateProps = {
  title: React.ReactNode;
  message?: React.ReactNode;
  onRetry?: () => void;
  retryHref?: string;
  className?: string;
};

export function ErrorState({
  title,
  message,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      data-slot="error-state"
      role="alert"
      className={cn(
        "mx-auto flex max-w-sm flex-col items-center gap-2 py-16 text-center",
        className,
      )}
    >
      <span className="bg-destructive/10 text-destructive flex size-11 items-center justify-center rounded-full">
        <AlertTriangle className="size-5" />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      {message ? (
        <p className="text-muted-foreground text-sm">{message}</p>
      ) : null}
      {onRetry ? (
        <Button variant="outline" size="lg" className="mt-2" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
```

> If used in a Server Component (no `onClick`), callers pass no `onRetry`; a client retry wrapper can be added later. Keep this component server-safe (no `"use client"`); only add it if an `onRetry` consumer needs interactivity (then split a client variant).

- [ ] **Step 2: `empty-state.tsx`.** Same shape, neutral icon, optional CTA slot.

```tsx
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: React.ReactNode;
  message?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  message,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "mx-auto flex max-w-sm flex-col items-center gap-2 py-16 text-center",
        className,
      )}
    >
      <span className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
        {icon ?? <Inbox className="size-5" />}
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      {message ? (
        <p className="text-muted-foreground text-sm">{message}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
```

- [ ] **Step 3: Verify.** Run: `npm run typecheck`. Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add src/components/feedback/error-state.tsx src/components/feedback/empty-state.tsx
git commit -m "feat(feedback): add ErrorState + EmptyState panels"
```

---

## Task 9: `ConfirmDialog` (base-ui alert-dialog, promise-based)

**Files:**

- Create: `src/components/feedback/confirm-dialog.tsx`

- [ ] **Step 1: Confirm props.** Open `node_modules/@base-ui/react/esm/alert-dialog/root/AlertDialogRoot.d.ts` and `dialog/popup/DialogPopup.d.ts` — confirm `Root` takes `open`/`onOpenChange` and the Portal/Backdrop/Popup nesting.

- [ ] **Step 2: Create `confirm-dialog.tsx`.** A controlled component + a `useConfirm()` hook returning `confirm(opts): Promise<boolean>`. Mobile = bottom-sheet (`items-end`), desktop = centered (`sm:items-center`).

```tsx
"use client";

import * as React from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ConfirmOptions = {
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

export function useConfirm() {
  const [pending, setPending] = React.useState<Pending | null>(null);

  const confirm = React.useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ ...opts, resolve })),
    [],
  );

  function settle(ok: boolean) {
    pending?.resolve(ok);
    setPending(null);
  }

  const dialog = (
    <AlertDialog.Root
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="bg-foreground/20 fixed inset-0 z-50 backdrop-blur-[1px]" />
        <AlertDialog.Popup
          className={cn(
            "bg-popover text-popover-foreground border-border fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-sm flex-col gap-3 rounded-t-xl border p-5 shadow-xl",
            "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl",
          )}
        >
          {pending ? (
            <>
              <AlertDialog.Title className="text-lg font-semibold">
                {pending.title}
              </AlertDialog.Title>
              {pending.description ? (
                <AlertDialog.Description className="text-muted-foreground text-sm">
                  {pending.description}
                </AlertDialog.Description>
              ) : null}
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => settle(false)}
                >
                  {pending.cancelLabel ?? "Cancel"}
                </Button>
                <Button
                  variant={pending.destructive ? "destructive" : "default"}
                  size="lg"
                  onClick={() => settle(true)}
                >
                  {pending.confirmLabel ?? "Confirm"}
                </Button>
              </div>
            </>
          ) : null}
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );

  return { confirm, dialog };
}
```

> Usage: a client component calls `const { confirm, dialog } = useConfirm()`, renders `{dialog}`, and `if (await confirm({title, destructive:true})) { … }`. Adjust prop names per the Step-1 type-read.

- [ ] **Step 3: Verify.** Run: `npm run typecheck`. Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add src/components/feedback/confirm-dialog.tsx
git commit -m "feat(feedback): add promise-based ConfirmDialog on base-ui alert-dialog"
```

---

## Task 10: Toast system (`ToastProvider` + `useToast` + `Toaster`, v2 look) + mount at root

**Files:**

- Create: `src/components/feedback/toast.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Confirm props.** Open `node_modules/@base-ui/react/esm/toast/root/ToastRoot.d.ts`, `provider/ToastProvider.d.ts`, `viewport/ToastViewport.d.ts`, and `useToastManager.d.ts` — confirm: `Root` takes a `toast` prop; `useToastManager()` returns `{ toasts, add, ... }` and `add({ title, description, type, timeout })`; how `type` is read on a toast (`toast.type`).

- [ ] **Step 2: Create `toast.tsx`.** `Toaster` renders Provider+Viewport and maps `useToastManager().toasts` to v2 cards (white `--card`, tinted icon chip by `type`, × close, success auto-dismiss via `timeout`). Bottom-anchored on mobile, top-right at `sm:`, safe-area aware. Export `useToast` (thin re-export of `useToastManager`).

```tsx
"use client";

import { Toast } from "@base-ui/react/toast";
import { Check, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider>
      {children}
      <Toaster />
    </Toast.Provider>
  );
}

export const useToast = Toast.useToastManager;

function Toaster() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport
        className={cn(
          "fixed z-[100] flex flex-col gap-2 outline-none",
          "inset-x-0 bottom-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
          "sm:inset-x-auto sm:top-0 sm:right-0 sm:bottom-auto sm:w-96",
        )}
      >
        {toasts.map((toast) => {
          const isError = toast.type === "error";
          return (
            <Toast.Root
              key={toast.id}
              toast={toast}
              className="bg-card text-card-foreground border-border relative flex items-start gap-3 overflow-hidden rounded-xl border p-3 pr-2 shadow-lg"
            >
              <span
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                  isError
                    ? "bg-destructive/10 text-destructive"
                    : "bg-status-available text-status-available-foreground",
                )}
              >
                {isError ? (
                  <AlertTriangle className="size-4" />
                ) : (
                  <Check className="size-4" />
                )}
              </span>
              <div className="flex flex-1 flex-col">
                <Toast.Title className="text-sm font-semibold" />
                <Toast.Description className="text-muted-foreground text-xs" />
              </div>
              <Toast.Close
                aria-label="Dismiss"
                className="text-muted-foreground hover:text-foreground rounded-md p-1"
              >
                <X className="size-4" />
              </Toast.Close>
            </Toast.Root>
          );
        })}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
```

> Confirm in Step 1 whether `Toast.Title`/`Description` read `toast.title`/`toast.description` automatically (self-closing as above) or need children; adjust. `aria-live` is provided by `Toast.Viewport`/`Root` internally — verify and do not duplicate.

- [ ] **Step 3: Mount at root.** In `src/app/layout.tsx`, import `ToastProvider` and wrap the `{children}` inside `<body>`:

```tsx
import { ToastProvider } from "@/components/feedback/toast";
// …inside <body>…
<ToastProvider>{children}</ToastProvider>;
```

- [ ] **Step 4: Verify build + visual.** Run: `npm run build`. Expected: PASS. Then `npm run dev`; temporarily add a button on the home page calling `const t = useToast(); t.add({ title: "Saved", description: "Test", type: "success" })` and another with `type: "error"`; confirm a success toast (sage chip, auto-dismiss) and a sticky error toast (clay chip) render bottom on a ~390px viewport and top-right at desktop. Remove the temp button.

- [ ] **Step 5: Commit.**

```bash
git add src/components/feedback/toast.tsx src/app/layout.tsx
git commit -m "feat(feedback): add v2 toast system + mount provider at root"
```

---

## Task 11: Shared sign-out action

**Files:**

- Create: `src/components/sign-out-button.tsx`
- Modify: `src/components/account-menu.tsx`

- [ ] **Step 1: Extract `SignOutButton`.** Lift the sign-out handler out of `account-menu.tsx` into a reusable client component that accepts a `className` + optional `children` so both the marketing menu and the sidebar footer use one handler.

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function SignOutButton({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isSigningOut}
      className={cn(
        "text-left transition-colors disabled:opacity-50",
        className,
      )}
    >
      {isSigningOut ? "Signing out…" : (children ?? "Sign out")}
    </button>
  );
}
```

- [ ] **Step 2: Refactor `account-menu.tsx`** to use `SignOutButton` for its Sign-out menu item (keep the menu's existing classes by passing them via `className`), removing the inline `handleSignOut`/`useState`/`createClient` now living in `SignOutButton`.

- [ ] **Step 3: Verify.** Run: `npm run build`. Expected: PASS. `npm run dev`: the marketing AccountMenu Sign-out still works (signs out → home).

- [ ] **Step 4: Commit.**

```bash
git add src/components/sign-out-button.tsx src/components/account-menu.tsx
git commit -m "refactor(auth): extract shared SignOutButton from AccountMenu"
```

---

## Task 12: Nav active-state helper (pure, TDD) + nav config

**Files:**

- Create: `src/components/layout/is-active-nav.ts`, `src/components/layout/is-active-nav.test.ts`, `src/components/layout/nav-config.ts`

- [ ] **Step 1: Write the failing test.** `isActiveNav(pathname, href)`: exact match for index routes (`/account`, `/admin/...`), and a section is active when `pathname === href`; the home/back link (`/`) is active only on exact `/`. Choose **exact-match** semantics (sections don't nest in this app), so `/account/pets` does NOT activate `/account`.

```ts
import { describe, it, expect } from "vitest";
import { isActiveNav } from "./is-active-nav";

describe("isActiveNav", () => {
  it("matches the exact route", () => {
    expect(isActiveNav("/account/pets", "/account/pets")).toBe(true);
  });
  it("does not activate a parent for a child route", () => {
    expect(isActiveNav("/account/pets", "/account")).toBe(false);
  });
  it("ignores trailing slashes", () => {
    expect(isActiveNav("/admin/settings/", "/admin/settings")).toBe(true);
  });
  it("returns false for an unrelated route", () => {
    expect(isActiveNav("/admin/bookings", "/admin/services")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails.** Run: `npm test -- is-active-nav`. Expected: FAIL ("isActiveNav is not a function" / module not found).

- [ ] **Step 3: Implement.**

```ts
/** Active-nav matcher: exact route match, trailing-slash-insensitive. */
export function isActiveNav(pathname: string, href: string): boolean {
  const norm = (p: string) =>
    p !== "/" && p.endsWith("/") ? p.slice(0, -1) : p;
  return norm(pathname) === norm(href);
}
```

- [ ] **Step 4: Run it, verify it passes.** Run: `npm test -- is-active-nav`. Expected: PASS (4 tests).

- [ ] **Step 5: Create `nav-config.ts`.** Zone nav types + the account/admin section lists (single source; layouts pass these to `AppShell`).

```ts
export type NavItem = { href: string; label: string };
export type ZoneNav = { zoneLabel: string; items: NavItem[] };

export const accountNav: ZoneNav = {
  zoneLabel: "Account",
  items: [
    { href: "/account", label: "Profile" },
    { href: "/account/pets", label: "Pets" },
    { href: "/account/forms", label: "Forms" },
    { href: "/account/bookings", label: "Bookings" },
  ],
};

export const adminNav: ZoneNav = {
  zoneLabel: "Admin",
  items: [
    { href: "/admin/availability", label: "Availability" },
    { href: "/admin/bookings", label: "Bookings" },
    { href: "/admin/services", label: "Services" },
    { href: "/admin/settings", label: "Settings" },
    { href: "/admin/reviews", label: "Reviews" },
    { href: "/admin/clients", label: "Clients" },
  ],
};
```

- [ ] **Step 6: Commit.**

```bash
git add src/components/layout/is-active-nav.ts src/components/layout/is-active-nav.test.ts src/components/layout/nav-config.ts
git commit -m "feat(layout): add isActiveNav helper (tested) + zone nav config"
```

---

## Task 13: Marketing `SiteHeader` — two-tier centered + active tabs + mobile drawer

**Files:**

- Modify: `src/components/site-header.tsx`
- Create: `src/components/site-nav.tsx` (client: active-state tab row + mobile drawer)

- [ ] **Step 1: Confirm drawer props.** Open `node_modules/@base-ui/react/esm/drawer/root/DrawerRoot.d.ts` + `popup/...` — confirm `Root` `open`/`onOpenChange` and Portal/Backdrop/Popup nesting (Drawer mirrors Dialog).

- [ ] **Step 2: Create `site-nav.tsx`** (client). The 7-tab row with `isActiveNav` clay underline (desktop) and the hamburger→drawer (mobile). Receives `navLinks` + the right-side `authSlot` as props from the server header.

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Drawer } from "@base-ui/react/drawer";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActiveNav } from "@/components/layout/is-active-nav";
import type { NavItem } from "@/components/layout/nav-config";

export function SiteNav({ links }: { links: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      {/* Desktop centered tab row */}
      <nav aria-label="Main navigation" className="hidden md:block">
        <ul className="flex items-center justify-center gap-7 text-sm">
          {links.map(({ href, label }) => {
            const active = isActiveNav(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative py-1 transition-colors",
                    active
                      ? "text-brand-strong after:bg-brand-strong font-semibold after:absolute after:inset-x-0 after:-bottom-2 after:h-0.5 after:rounded"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Mobile hamburger → drawer */}
      <div className="md:hidden">
        <Drawer.Root open={open} onOpenChange={setOpen}>
          <Drawer.Trigger
            aria-label="Open menu"
            className="text-foreground inline-flex size-11 items-center justify-center rounded-lg"
          >
            <Menu className="size-5" />
          </Drawer.Trigger>
          <Drawer.Portal>
            <Drawer.Backdrop className="bg-foreground/20 fixed inset-0 z-50" />
            <Drawer.Popup className="bg-background fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col">
              <div className="flex items-center justify-between p-4">
                <span className="font-heading text-lg font-semibold">Menu</span>
                <Drawer.Close
                  aria-label="Close menu"
                  className="inline-flex size-11 items-center justify-center"
                >
                  <X className="size-5" />
                </Drawer.Close>
              </div>
              <ul className="flex flex-col">
                {links.map(({ href, label }) => {
                  const active = isActiveNav(pathname, href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "border-border flex min-h-11 items-center border-b px-4 text-base",
                          active
                            ? "text-brand-strong border-l-brand-strong border-l-2 font-semibold"
                            : "text-foreground",
                        )}
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Drawer.Popup>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Rewrite `site-header.tsx`** as a two-tier centered server header. Keep the server session/role derivation; render the `SiteNav` client child + the auth cluster. Top tier: hamburger (mobile, inside `SiteNav`) is on the right; on desktop the right slot holds Sign in / AccountMenu (+ Admin link). Structure:

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AccountMenu } from "./account-menu";
import { SiteNav } from "./site-nav";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/gallery", label: "Gallery" },
  { href: "/reviews", label: "Reviews" },
  { href: "/resources", label: "Resources" },
  { href: "/book", label: "Book" },
];

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    isAdmin = profile?.role === "admin";
  }

  const authCluster = (
    <div className="flex items-center gap-4 text-sm">
      {isAdmin && (
        <Link
          href="/admin"
          className="text-muted-foreground hover:text-foreground font-medium"
        >
          Admin
        </Link>
      )}
      {user ? (
        <AccountMenu />
      ) : (
        <Link
          href="/login"
          className="text-muted-foreground hover:text-foreground"
        >
          Sign in
        </Link>
      )}
    </div>
  );

  return (
    <header className="border-border bg-background border-b">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        {/* Top tier: centered wordmark, auth cluster right; on mobile the SiteNav hamburger sits right */}
        <div className="grid grid-cols-3 items-center py-4">
          <div className="hidden md:block" />
          <Link
            href="/"
            className="font-heading col-start-1 justify-self-start text-xl font-semibold tracking-tight md:col-start-2 md:justify-self-center"
          >
            Cal Barba
          </Link>
          <div className="col-start-3 justify-self-end">
            <div className="hidden md:block">{authCluster}</div>
            <div className="md:hidden">
              <SiteNav links={navLinks} />
            </div>
          </div>
        </div>
        {/* Bottom tier: centered tab row (desktop only; mobile uses the drawer above) */}
        <div className="hidden pb-3 md:block">
          <SiteNav links={navLinks} />
        </div>
      </div>
    </header>
  );
}
```

> Note: `SiteNav` renders desktop tabs (`hidden md:block`) and the mobile drawer (`md:hidden`) internally, so placing it in both slots is intentional — each slot shows only its half at the right breakpoint. Confirm there's no duplicate-id issue; if the drawer mounts twice, lift the drawer to render once (top tier only) and have the bottom tier render just the tab `<ul>`. Adjust during implementation if the double-mount warns.

- [ ] **Step 4: Verify build + visual.** Run: `npm run build`. Expected: PASS. `npm run dev`, `http://localhost:3000`: desktop shows centered wordmark over a centered tab row, active tab has a clay underline, Sign in/Account on the right. At ~390px: wordmark left, hamburger right, drawer opens with large tap rows + active clay left-border, closes on navigation. Keyboard: Tab to hamburger, Enter opens, Esc closes, focus trapped.

- [ ] **Step 5: Commit.**

```bash
git add src/components/site-header.tsx src/components/site-nav.tsx
git commit -m "feat(nav): two-tier centered marketing header with active tabs + mobile drawer"
```

---

## Task 14: `AppShell` + `AppSidebar` (account/admin sidebar + slim top bar + mobile drawer)

**Files:**

- Create: `src/components/layout/app-shell.tsx`, `src/components/layout/app-sidebar.tsx`

- [ ] **Step 1: Create `app-sidebar.tsx`** (client). The sidebar contents (back-to-site, zone section nav with active-state, footer identity + `SignOutButton`). Shared by the desktop column and the mobile drawer.

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActiveNav } from "./is-active-nav";
import type { ZoneNav } from "./nav-config";
import { SignOutButton } from "@/components/sign-out-button";

export function AppSidebar({
  nav,
  identity,
}: {
  nav: ZoneNav;
  identity: string;
}) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <Link
        href="/"
        className="text-brand-strong flex min-h-11 items-center gap-1 px-4 text-sm font-semibold"
      >
        <ChevronLeft className="size-4" /> Back to site
      </Link>
      <p className="text-muted-foreground px-4 pt-3 pb-1 text-xs font-medium tracking-wide uppercase">
        {nav.zoneLabel}
      </p>
      <nav
        aria-label={`${nav.zoneLabel} sections`}
        className="flex flex-col px-2"
      >
        {nav.items.map(({ href, label }) => {
          const active = isActiveNav(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center rounded-lg px-3 text-sm md:min-h-9",
                active
                  ? "bg-accent text-brand-strong font-semibold"
                  : "text-foreground hover:bg-muted",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-border mt-auto flex flex-col gap-1 border-t p-4">
        <span className="text-muted-foreground text-xs">{identity}</span>
        <SignOutButton className="text-muted-foreground hover:text-foreground text-sm" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `app-shell.tsx`** (client). Slim top bar (wordmark + mobile hamburger) + persistent sidebar (desktop) + drawer (mobile) + `<main>`.

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Drawer } from "@base-ui/react/drawer";
import { Menu, X } from "lucide-react";
import { AppSidebar } from "./app-sidebar";
import type { ZoneNav } from "./nav-config";

export function AppShell({
  nav,
  identity,
  children,
}: {
  nav: ZoneNav;
  identity: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Slim top bar */}
      <header className="border-border bg-background flex items-center gap-2 border-b px-4 py-3 md:px-6">
        <div className="md:hidden">
          <Drawer.Root open={open} onOpenChange={setOpen}>
            <Drawer.Trigger
              aria-label="Open menu"
              className="inline-flex size-11 items-center justify-center rounded-lg"
            >
              <Menu className="size-5" />
            </Drawer.Trigger>
            <Drawer.Portal>
              <Drawer.Backdrop className="bg-foreground/20 fixed inset-0 z-50" />
              <Drawer.Popup className="bg-sidebar fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col">
                <div className="flex justify-end p-2">
                  <Drawer.Close
                    aria-label="Close menu"
                    className="inline-flex size-11 items-center justify-center"
                  >
                    <X className="size-5" />
                  </Drawer.Close>
                </div>
                <AppSidebar nav={nav} identity={identity} />
              </Drawer.Popup>
            </Drawer.Portal>
          </Drawer.Root>
        </div>
        <Link
          href="/"
          className="font-heading text-lg font-semibold tracking-tight"
        >
          Cal Barba
        </Link>
      </header>

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="border-border bg-sidebar hidden w-60 shrink-0 border-r md:block">
          <div className="sticky top-0 h-[100dvh] py-3">
            <AppSidebar nav={nav} identity={identity} />
          </div>
        </aside>
        <main className="min-w-0 flex-1 py-8">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify.** Run: `npm run typecheck`. Expected: PASS. (Visual verification happens once a layout wires it — Tasks 15–16.)

- [ ] **Step 4: Commit.**

```bash
git add src/components/layout/app-shell.tsx src/components/layout/app-sidebar.tsx
git commit -m "feat(layout): add AppShell + AppSidebar (sidebar + mobile drawer)"
```

---

## Task 15: Wire `(account)` + `(admin)` layouts to `AppShell`; redirect `/admin`

**Files:**

- Modify: `src/app/(account)/layout.tsx`, `src/app/(admin)/layout.tsx`, `src/app/(admin)/admin/page.tsx`

- [ ] **Step 1: `(account)/layout.tsx`.** Replace `<SiteHeader/> + children` with `AppShell` using `accountNav`. Derive identity (name/email) from the profile already fetched (add a `full_name,email` select). Keep the existing auth backstop.

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { accountNav } from "@/components/layout/nav-config";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();
  const identity = profile?.full_name ?? user.email ?? "Signed in";

  return (
    <AppShell nav={accountNav} identity={identity}>
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 2: `(admin)/layout.tsx`.** Same pattern with `adminNav`; identity shows `… · admin`. Keep the admin role guard.

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { adminNav } from "@/components/layout/nav-config";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/");

  const identity = `${profile?.full_name ?? user.email ?? "Admin"} · admin`;

  return (
    <AppShell nav={adminNav} identity={identity}>
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 3: Redirect `/admin`.** Replace the dead-end link list in `src/app/(admin)/admin/page.tsx` with a redirect to the first section:

```tsx
import { redirect } from "next/navigation";

export default function AdminIndexPage() {
  redirect("/admin/availability");
}
```

- [ ] **Step 4: Verify build + visual.** Run: `npm run build`. Expected: PASS. `npm run dev`: sign in as a client → `/account` shows the sidebar (Profile active), Back-to-site, footer identity + Sign out. As admin → `/admin` redirects to Availability; sidebar shows the 6 admin sections with active-state. At ~390px both collapse to the hamburger drawer. Sign out works from the sidebar footer.

- [ ] **Step 5: Commit.**

```bash
git add "src/app/(account)/layout.tsx" "src/app/(admin)/layout.tsx" "src/app/(admin)/admin/page.tsx"
git commit -m "feat(nav): wire account + admin layouts to AppShell; redirect admin index"
```

---

## Task 16: Account pages — drop copy-pasted nav, wrap shells, `<a>`→`<Link>`

**Files:**

- Modify: `src/app/(account)/account/page.tsx`, `src/app/(account)/account/pets/page.tsx`, `src/app/(account)/account/forms/page.tsx`, `src/app/(account)/account/bookings/page.tsx`

- [ ] **Step 1: For each account page:** remove the in-body `<nav aria-label="Account sections">…</nav>` block (now in the sidebar); replace the outer `<main className="mx-auto max-w-lg px-4 py-10">` (and the page's hand-rolled `<h1>`/subtitle) with `PageContainer width="app"` + `PageHeader`. Example for `account/page.tsx`:

```tsx
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
// …
return (
  <PageContainer width="app">
    <PageHeader
      title="Your profile"
      subtitle="Update your contact info. Email is managed through your login."
    />
    {/* …existing sections, unchanged… */}
  </PageContainer>
);
```

- [ ] **Step 2: Convert any remaining internal `<a href>` → `<Link>`** in these pages (import `Link from "next/link"`). After this task, `grep -rn '<a href="/' src/app/(account)` returns nothing.

- [ ] **Step 3: Verify build + visual.** Run: `npm run build`. Expected: PASS. `npm run dev`: each account page renders inside the shell with a single `PageHeader` h1, no duplicated in-body nav, links navigate without full reload (no flash). Mobile: content readable, no horizontal scroll.

- [ ] **Step 4: Commit.**

```bash
git add "src/app/(account)/account/page.tsx" "src/app/(account)/account/pets/page.tsx" "src/app/(account)/account/forms/page.tsx" "src/app/(account)/account/bookings/page.tsx"
git commit -m "feat(account): adopt PageContainer/PageHeader; remove duplicated nav; Link-only"
```

---

## Task 17: Swap raw error/empty screens → `ErrorState`/`EmptyState`; wrap admin pages; link sweep

**Files:**

- Modify: admin pages with raw error screens — `src/app/(admin)/admin/bookings/page.tsx`, `services/page.tsx`, `settings/page.tsx`, `reviews/page.tsx`, `availability/page.tsx` — plus any account page with a raw `Failed to load`/`Access denied` (grep to find).

- [ ] **Step 1: Find every raw screen.** Run: `grep -rn "Access denied\|Failed to load" src/app`. For each match in a **page/server component**, replace the raw `<p className="text-destructive p-8">…</p>` with `ErrorState` (friendly `[[ ]]`-stubbed copy). Example (`admin/bookings/page.tsx`):

```tsx
import { ErrorState } from "@/components/feedback/error-state";
// …
if (result.kind === "forbidden") {
  return (
    <ErrorState
      title="[[HEADER: access denied]]"
      message="You don't have permission to view this."
    />
  );
}
if (result.kind === "error") {
  return (
    <ErrorState
      title="[[HEADER: couldn't load]]"
      message="We couldn't load this right now. Please try again."
    />
  );
}
```

- [ ] **Step 2: Wrap each admin page body** in `PageContainer width="app"` + `PageHeader` (replacing the ad-hoc `<main className="mx-auto max-w-3xl p-8">` + hand-rolled `<h1>`). Keep the page's client subcomponents unchanged. Example (`admin/bookings/page.tsx` success branch):

```tsx
return (
  <PageContainer width="app">
    <PageHeader title={`Pending approvals (${result.bookings.length})`} />
    <BookingsClient initialBookings={result.bookings} />
  </PageContainer>
);
```

- [ ] **Step 3: Link sweep.** Run: `grep -rn '<a href="/' src/app src/components`. Convert remaining **internal** `<a href>` to `<Link>` (skip external `http(s)://`, `mailto:`, `tel:`). The marketing footer already uses `<Link>`; confirm resources/any other internal `<a>` are converted.

- [ ] **Step 4: Verify build + visual.** Run: `npm run lint` then `npm run build`. Expected: both PASS. `npm run dev`: trigger an admin page as a non-admin (or simulate the `forbidden`/`error` branch) → friendly `ErrorState` (not raw text); admin pages render inside the shell with one `PageHeader`. `grep` from Steps 1+3 return no raw internal `<a href>` / raw error strings on touched pages.

- [ ] **Step 5: Commit.**

```bash
git add "src/app/(admin)" "src/app/(account)" src/components
git commit -m "feat(feedback): replace raw error screens with ErrorState; wrap admin pages; Link sweep"
```

---

## Task 18: Documentation — FRONTEND.md (same-commit doc rule)

**Files:**

- Modify: `docs/FRONTEND.md`

- [ ] **Step 1: Add a "Shared chrome + component kit (Phase 1, 2026-06-04)" subsection** under `## C. Design system`, documenting: the shell primitives (`PageContainer width="read"|"app"`, `PageHeader`); the three-shell nav model (marketing two-tier centered top-tabs + drawer; account/admin `AppShell` sidebar + drawer with active-state via `isActiveNav`, back-to-site, footer sign-out); the feedback taxonomy table (inline field error / `ErrorState` / inline "Saved ✓" / success+failure toast / `ConfirmDialog` / `EmptyState`) + toast v2 behavior; the component kit list (card, badge, table[mobile stacked-card], tabs, form-field, select, skeleton) on `@base-ui/react`; and the **mobile-first/adaptive principles** (authored mobile-first; nav→drawers, tables→stacked cards, dialogs→bottom-sheets, toasts→bottom-anchored; ≥44px targets; `dvh` + safe-area). Keep it rules-not-signatures (no path lists / prop dumps — grep is faster, per CLAUDE.md doc discipline).

- [ ] **Step 2: Bump the `_Last reviewed_` footer** in `docs/FRONTEND.md` to `2026-06-04`.

- [ ] **Step 3: Commit.**

```bash
git add docs/FRONTEND.md
git commit -m "docs: document Phase 1 shell primitives, nav model, feedback + component kit"
```

---

## Task 19: Acceptance verification (build, mobile, a11y)

**Files:** none (verification only).

- [ ] **Step 1: Full gate.** Run each, confirm clean:

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

Expected: all pass; strict, no `any`; `is-active-nav` tests green.

- [ ] **Step 2: Structural-system check.** Run: `grep -rn "max-w-lg\|max-w-2xl\|max-w-3xl" src/app/(account) src/app/(admin)`. Expected: no page sets its own width (all via `PageContainer`). Spot-check that each touched page renders one `PageHeader` `<h1>`.

- [ ] **Step 3: Mobile-first proof (~390px viewport, `npm run dev`).** Confirm: marketing nav is a drawer (not a wrapped row); account + admin sidebars are off-canvas drawers; a `Table`-based admin list renders as stacked labeled cards (no horizontal scroll); a `ConfirmDialog` renders as a bottom-sheet; a toast anchors bottom. Re-check each at desktop width.

- [ ] **Step 4: Accessibility walk (light + dark).** Keyboard-only: Tab through the marketing header + open/close the drawer (Esc closes, focus trapped); Tab the account/admin sidebar (visible `--ring` focus, `aria-current` on the active item); open a `ConfirmDialog` (focus trapped, Esc cancels → promise resolves false); a `FormField` error is announced via `aria-describedby`. Toggle `class="dark"` on `<html>`: chrome + toasts + states remain legible (warm-dark).

- [ ] **Step 5: Final status.** Run: `git status`. Expected: clean (everything committed across Tasks 1–18). If a stray tuning tweak remains, commit it subject-line-only. **Do not push** (Alex batches the push).

---

## Self-review (completed)

- **Spec coverage:** Shell primitives §1 → T1; nav §2 → T12 (helper) + T13 (marketing) + T14–15 (sidebar shells + redirect) + T16–17 (Link sweep, dead-end removed); feedback §3 → T8 (error/empty) + T9 (confirm) + T10 (toast) + T17 (raw-screen swap); component kit §4 → T2/T3/T4/T5/T6 + T7 (align button/input/label/calendar); mobile-first §5 → baked into T13/T14 (drawers), T3 (stacked table), T9 (bottom-sheet), T10 (bottom toast), verified in T19; docs → T18; acceptance → T19.
- **No placeholders:** every component task ships concrete code; compound-wrapper tasks add a verified-part list + a "read the `.d.ts` for exact props" step (the one genuinely uncertain surface), not a vague "implement it." `[[ ]]` strings are intentional copy stubs (DESIGN.md rule), not plan gaps.
- **Type consistency:** `isActiveNav(pathname, href)`, `ZoneNav`/`NavItem`, `accountNav`/`adminNav`, `AppShell({nav, identity, children})`, `AppSidebar({nav, identity})`, `SiteNav({links})`, `useConfirm()→{confirm,dialog}`, `useToast = Toast.useToastManager`, `ToastProvider`, `SignOutButton({className,children})`, `PageContainer({width})`, `PageHeader({title,subtitle,actions})` — names identical across the tasks that define and consume them.
- **TDD:** the one pure unit (`isActiveNav`) is test-first (T12); the rest is presentational → build + visual + a11y verification (Phase-0 precedent).
- **Scheduler:** untouched; calendar primitive only token-aligned (T7).
