# SP3b Plan B — IA + UI primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **UI work — invoke `frontend-design` before touching any markup (FRONTEND.md pipeline). Verify every change desktop AND mobile + breakpoint transition (mobile parity).**

**Goal:** Build the foundation UI primitives + system-IA fixes — unified confirm-dialog, generic dialog/popup, type-based toast, onboarding nav skeleton, admin attention-badge, feedback conventions — and perform the single migration that defines each. Sitewide application is SP6.

**Architecture:** Each primitive is a drop-in that preserves current behavior at its migrated call site; the deliberate deltas are type-based toast duration, alertdialog semantics, and onboarding's escape from the account zone shell. Design tokens only — no hardcoded colors/timings beyond documented duration constants (constitution). base-ui primitives throughout (AlertDialog, Dialog, Toast).

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Tailwind + base-ui · Vitest + Testing Library.

**Source spec:** [docs/superpowers/specs/2026-06-10-sp3b-system-ia-primitives-design.md](../specs/2026-06-10-sp3b-system-ia-primitives-design.md). Findings owned (Plan B): A2, A12 (+ U3 active-state, U7 build, AD5 setup) (register §SP3 / §SP6). **Run Plan A first.**

---

## Standing rules for every task

- **Invoke `frontend-design`** before authoring/altering markup; commit to the existing design language (Trail palette, Fraunces/Public Sans, `rounded-xl` cards) — refinement, not a new aesthetic.
- **Mobile parity:** every visual change verified at desktop, mobile, and the breakpoint transition. base-ui primitives' mobile behaviors (bottom-sheet, safe-area, hover-pause) preserved.
- **A11y floor:** semantic roles, visible focus, contrast, keyboard nav (FRONTEND.md). Each primitive's a11y is asserted in its test or manual check.
- **Gates per task:** `npm run typecheck` + `npm run lint` + the task's named test must pass before commit. Tokens only.
- **Commits:** Conventional Commits, subject line only (AGENTS.md — no body/trailers/internal codenames). Husky reformats on commit; re-stage if modified.
- **Same-commit doc rule.** Work on `main`, no worktree unless asked.

---

## Task 1: Unify the confirm dialog (A2)

Two implementations exist: `components/feedback/confirm-dialog.tsx` (`useConfirm` promise hook, 5 sites) and `components/ui/confirm-dialog.tsx` (`ConfirmDialog` controlled, 1 site: `inquiry-list`, has `pending` + icon/brand visual). Unify on **one** `useConfirm` hook that keeps the promise API, adds an optional async/pending path + the icon/brand visual + hardened a11y. Migrate `inquiry-list`. Delete the `ui/` duplicate.

**Files:**

- Modify: `src/components/feedback/confirm-dialog.tsx`
- Modify: `src/features/inquiries/components/inquiry-list.tsx`
- Delete: `src/components/ui/confirm-dialog.tsx`
- Create: `src/components/feedback/confirm-dialog.test.tsx`

- [ ] **Step 1: Write the failing test for the unified hook**

```tsx
// src/components/feedback/confirm-dialog.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import { useConfirm } from "./confirm-dialog";

function Harness() {
  const { confirm, dialog } = useConfirm();
  return (
    <>
      <button onClick={() => confirm({ title: "Delete?", destructive: true })}>
        go
      </button>
      {dialog}
    </>
  );
}

describe("useConfirm", () => {
  it("renders an alertdialog with the title and resolves true on confirm", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("go"));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Delete?")).toBeInTheDocument();
  });

  it("awaits an async onConfirm and shows pending, staying open until it resolves", async () => {
    let resolveFn: (v: boolean) => void = () => {};
    const onConfirm = () => new Promise<boolean>((r) => (resolveFn = r));
    const { result } = renderHook(() => useConfirm());
    let outcome: Promise<boolean>;
    act(() => {
      outcome = result.current.confirm({ title: "Resolve?", onConfirm });
    });
    render(<>{result.current.dialog}</>);
    fireEvent.click(await screen.findByText("Confirm"));
    expect(screen.getByText("Working…")).toBeInTheDocument(); // pending
    act(() => resolveFn(true));
    await waitFor(() => expect(outcome).resolves.toBe(true));
  });
});
```

Run: `npm run test -- src/components/feedback/confirm-dialog.test.tsx` → Expected: FAIL (no async/pending support yet).

- [ ] **Step 2: Rewrite `useConfirm` — promise API + optional async/pending + visual + a11y**

```tsx
"use client";

import * as React from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ConfirmOptions = {
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /**
   * Optional async confirm. When provided, clicking Confirm shows a pending
   * state and the dialog stays open until it resolves — closing only on `true`
   * (replaces the old controlled `ConfirmDialog` pending pattern). When absent,
   * Confirm resolves the promise immediately (existing call sites unchanged).
   */
  onConfirm?: () => Promise<boolean>;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

export function useConfirm() {
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [busy, setBusy] = React.useState(false);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  const confirm = React.useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ ...opts, resolve })),
    [],
  );

  function settle(ok: boolean) {
    if (!pending) return;
    pending.resolve(ok);
    setPending(null);
    setBusy(false);
  }

  async function onConfirmClick() {
    if (!pending) return;
    if (pending.onConfirm) {
      setBusy(true);
      const ok = await pending.onConfirm();
      if (ok) settle(true);
      else setBusy(false); // stay open on failure
      return;
    }
    settle(true);
  }

  const dialog = (
    <AlertDialog.Root
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && !busy) settle(false);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="bg-foreground/20 fixed inset-0 z-50 backdrop-blur-[1px]" />
        <AlertDialog.Popup
          data-slot="confirm-dialog"
          initialFocus={cancelRef}
          className={cn(
            "bg-popover text-popover-foreground border-border fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-sm flex-col gap-3 rounded-t-xl border p-5 shadow-xl",
            "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl",
          )}
        >
          {pending ? (
            <>
              <div
                className={cn(
                  "mb-1 flex size-10 items-center justify-center rounded-full",
                  pending.destructive
                    ? "bg-destructive/10 text-destructive"
                    : "bg-brand/15 text-brand-strong",
                )}
              >
                <TriangleAlert className="size-5" aria-hidden="true" />
              </div>
              <AlertDialog.Title className="font-heading text-lg font-semibold">
                {pending.title}
              </AlertDialog.Title>
              {pending.description ? (
                <AlertDialog.Description className="text-muted-foreground text-sm">
                  {pending.description}
                </AlertDialog.Description>
              ) : null}
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  ref={cancelRef}
                  variant="outline"
                  size="lg"
                  disabled={busy}
                  onClick={() => settle(false)}
                >
                  {pending.cancelLabel ?? "Cancel"}
                </Button>
                <Button
                  variant={pending.destructive ? "destructive" : "default"}
                  size="lg"
                  disabled={busy}
                  onClick={onConfirmClick}
                >
                  {busy ? "Working…" : (pending.confirmLabel ?? "Confirm")}
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

Verify base-ui's focus-target prop name: confirm `initialFocus` is the correct `AlertDialog.Popup` prop in the installed base-ui version (check `node_modules/@base-ui/react` types or the base-ui docs); if it differs, use the documented equivalent so initial focus lands on Cancel (least-destructive — a11y rule). If `Button` does not already forward refs, add `React.forwardRef` to it (check `src/components/ui/button.tsx` first).

Run: `npm run test -- src/components/feedback/confirm-dialog.test.tsx` → Expected: PASS.

- [ ] **Step 3: Migrate `inquiry-list` to the hook**

In `src/features/inquiries/components/inquiry-list.tsx`: remove the `ConfirmDialog` import + the `confirmId`/`resolving` state + the `confirmResolve` function + the `<ConfirmDialog .../>` element. Add `const { confirm, dialog } = useConfirm();` (import from `@/components/feedback/confirm-dialog`). Rewrite `requestResolve`:

```tsx
async function requestResolve(inquiry: InquiryRow) {
  setOpenId(null);
  setEditing(false);
  await confirm({
    title: resolveTitle,
    description: resolveDescription,
    confirmLabel: "Yes, mark resolved",
    onConfirm: () => onResolve(inquiry.id),
  });
}
```

Render `{dialog}` where `<ConfirmDialog>` was. The async `onConfirm` preserves the exact prior behavior (pending while resolving, close only on success). `requestResolve` is already wired to `InquiryCard.onResolveClick` + `InquiryDetailDialog.onResolveClick` — unchanged.

- [ ] **Step 4: Delete the duplicate + verify no references**

```bash
git rm src/components/ui/confirm-dialog.tsx
```

Run: `npm run lint` and grep — `grep -rn "components/ui/confirm-dialog" src` → Expected: no output.

- [ ] **Step 5: Verify gates + manual**

Run: `npm run typecheck` → PASS
Run: `npm run lint` → PASS
Run: `npm run test -- src/components/feedback/confirm-dialog.test.tsx` → PASS
Manual (execution session): trigger a destructive confirm (e.g. admin booking cancel) + the inquiry resolve flow at desktop **and** mobile (bottom-sheet) — focus lands on Cancel, Esc/backdrop cancels, pending shows on resolve, identical outcomes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: unify confirm dialog on a single promise hook"
```

---

## Task 2: Generic dialog/popup primitive

Extract the styled modal shell into a reusable **non-alert** `Dialog` primitive over base-ui `Dialog`, sharing the panel/backdrop styling with the confirm dialog so future modals (SP5 inquiry popup / AD7) compose one shell instead of re-styling base-ui ad hoc. Ships the primitive + shares the shell with confirm-dialog; no new modal surfaces in 3b.

**Files:**

- Create: `src/components/feedback/dialog-shell.ts` (shared panel/backdrop class constants)
- Create: `src/components/ui/dialog.tsx` (composable Dialog primitive)
- Create: `src/components/ui/dialog.test.tsx`
- Modify: `src/components/feedback/confirm-dialog.tsx` (consume the shared shell classes)

- [ ] **Step 1: Extract shared shell classes**

```ts
// src/components/feedback/dialog-shell.ts
// Shared modal shell styling — consumed by the confirm dialog (alertdialog) and
// the generic Dialog primitive so every modal reads as one component family.
// Mobile: bottom-sheet; ≥sm: centered.
export const dialogBackdropClass =
  "bg-foreground/20 fixed inset-0 z-50 backdrop-blur-[1px]";

export const dialogPanelClass =
  "bg-popover text-popover-foreground border-border fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-md flex-col gap-3 rounded-t-xl border p-5 shadow-xl sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl";
```

Update `confirm-dialog.tsx` to import `dialogBackdropClass` for its `Backdrop` and to base its `Popup` className on the shared shell (it may keep `max-w-sm` via a `cn(dialogPanelClass, "max-w-sm")` override). No visual change intended — confirm the rendered classes match.

- [ ] **Step 2: Write the failing test for the Dialog primitive**

```tsx
// src/components/ui/dialog.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { Dialog } from "./dialog";

it("opens, shows title, and closes via the close affordance", () => {
  function Harness() {
    const [open, setOpen] = React.useState(true);
    return (
      <Dialog open={open} onOpenChange={setOpen} title="Details">
        <p>body</p>
      </Dialog>
    );
  }
  render(<Harness />);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText("Details")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Close"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
```

Run: `npm run test -- src/components/ui/dialog.test.tsx` → Expected: FAIL (module not found). (Add `import * as React from "react"` to the harness.)

- [ ] **Step 3: Implement the Dialog primitive**

```tsx
// src/components/ui/dialog.tsx
"use client";

import * as React from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  dialogBackdropClass,
  dialogPanelClass,
} from "@/components/feedback/dialog-shell";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={dialogBackdropClass} />
        <BaseDialog.Popup className={cn(dialogPanelClass, className)}>
          <div className="flex items-start justify-between gap-4">
            <BaseDialog.Title className="font-heading text-lg font-semibold">
              {title}
            </BaseDialog.Title>
            <BaseDialog.Close
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground -m-1 rounded-md p-1"
            >
              <X className="size-4" />
            </BaseDialog.Close>
          </div>
          {description ? (
            <BaseDialog.Description className="text-muted-foreground text-sm">
              {description}
            </BaseDialog.Description>
          ) : null}
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
```

Run: `npm run test -- src/components/ui/dialog.test.tsx` → Expected: PASS.

- [ ] **Step 4: Verify gates + commit**

Run: `npm run typecheck` + `npm run lint` + both new tests → PASS. Manual: confirm dialog still looks identical (shared shell) desktop + mobile.

```bash
git add -A
git commit -m "feat: add reusable dialog primitive with shared modal shell"
```

---

## Task 3: Type-based toast (U7)

Redesign the toast primitive so duration + announcement follow severity: success/info auto-dismiss (5 s, hover/focus-pause — base-ui native), errors sticky (`timeout: 0`) and assertive (`priority: "high"`), width clamps to content, multi-line wraps, brief entrance motion. The primitive only — sitewide application is SP6. base-ui `add({ timeout, priority })`: `timeout: 0` disables auto-dismiss; Provider default `timeout` is 5000; `priority` `"low"`→polite / `"high"`→assertive.

**Files:**

- Modify: `src/components/feedback/toast.tsx`
- Create: `src/components/feedback/toast.test.tsx`

- [ ] **Step 1: Write the failing test for the duration policy**

```tsx
// src/components/feedback/toast.test.tsx
import { toastDefaults } from "./toast";

describe("toastDefaults", () => {
  it("makes errors sticky and assertive", () => {
    expect(toastDefaults({ type: "error", title: "x" })).toMatchObject({
      timeout: 0,
      priority: "high",
    });
  });
  it("leaves success polite with the provider default duration", () => {
    expect(toastDefaults({ type: "success", title: "x" })).toMatchObject({
      priority: "low",
    });
  });
  it("respects an explicit timeout override", () => {
    expect(
      toastDefaults({ type: "error", title: "x", timeout: 1000 }).timeout,
    ).toBe(1000);
  });
});
```

Run: `npm run test -- src/components/feedback/toast.test.tsx` → Expected: FAIL (no `toastDefaults` export).

- [ ] **Step 2: Add the duration policy + wrap `useToast`**

In `toast.tsx`, replace `export const useToast = Toast.useToastManager;` with a policy helper + a wrapping hook that applies it so every existing `toast.add({ type })` call site gets correct duration/announcement with no call-site change:

```tsx
import * as React from "react";

type AddOptions = Parameters<
  ReturnType<typeof Toast.useToastManager>["add"]
>[0];

/**
 * Applies the type-based duration + ARIA-announcement policy (U7) unless the
 * caller overrides. Errors are sticky + assertive; everything else inherits the
 * provider's 5 s default and announces politely. Action-bearing toasts should
 * pass `timeout: 0` explicitly (an interactive toast must persist — a11y rule).
 */
export function toastDefaults(opts: AddOptions): AddOptions {
  const isError = opts.type === "error";
  return {
    priority: isError ? "high" : "low",
    ...(isError ? { timeout: 0 } : {}),
    ...opts, // explicit caller values win
  };
}

export function useToast() {
  const manager = Toast.useToastManager();
  return React.useMemo(
    () => ({
      ...manager,
      add: (opts: AddOptions) => manager.add(toastDefaults(opts)),
    }),
    [manager],
  );
}
```

(Confirm the base-ui `add` options type accepts `timeout` + `priority`; adjust the `AddOptions` derivation if the installed types name it differently. Confirm spreading the manager keeps its other methods callable — the repo only uses `.add` today.)

- [ ] **Step 3: Restyle the toast for content-clamp + motion**

In the `Toaster` `Toast.Root`, change the fixed-width viewport item to clamp to content with a max, wrap long text, and add a brief entrance transition (mirror the drawer's `data-[starting-style]`/`data-[ending-style]` pattern already used in `site-nav.tsx`). Replace the `Toast.Root` className with:

```tsx
className={cn(
  "bg-card text-card-foreground border-border relative flex items-start gap-3 overflow-hidden rounded-xl border p-3 pr-2 shadow-lg",
  "w-full max-w-sm transition-all duration-300 ease-out",
  "data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0",
  "data-[ending-style]:opacity-0 motion-reduce:transition-none",
)}
```

Keep the existing icon span (success → `Check`/`bg-status-available`, error → `AlertTriangle`/`bg-destructive`), the `Toast.Title`/`Toast.Description` (descriptions already wrap), and the close button. The viewport already bottom-anchors on mobile with safe-area inset and top-centers on `sm` — leave it.

- [ ] **Step 4: Verify gates + manual**

Run: `npm run typecheck` + `npm run lint` + `npm run test -- src/components/feedback/toast.test.tsx` → PASS.
Manual (execution session): fire a success toast (auto-dismisses ~5 s, pauses on hover) and an error toast (stays until dismissed) on a real flow (e.g. book a walk) at desktop **and** mobile; long descriptions wrap, no truncation; entrance animates; reduced-motion disables it.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: type-based toast duration and content-clamped sizing"
```

---

## Task 4: Onboarding IA + navigation-skeleton primitive (A12 / U3)

`/onboarding` lives in the `(account)` route group, so `(account)/layout.tsx` wraps it in the account sidebar shell (`AppShell nav={accountNav}`, `locked`) — treating a pre-account **gate** as an account sub-page. Per the spec's "standalone + nav skeleton" decision, move it out of the account zone so it renders under the global header only, and give it a reusable wayfinding affordance (clear way back to the site). Fix any residual active-state mis-highlight.

**Files:**

- Move: `src/app/(account)/onboarding/` → `src/app/(onboarding)/onboarding/` (page + `_components/`)
- Create: `src/app/(onboarding)/layout.tsx`
- Create: `src/components/layout/back-to-site.tsx` (nav-skeleton primitive)
- Modify: `src/app/(onboarding)/onboarding/page.tsx` (render the back affordance)
- Test: `src/components/layout/back-to-site.test.tsx`

- [ ] **Step 1: Reproduce the current symptom on seeded onboarding states**

Execution session, stack up. `npm run db:seed -- fresh` (or set a profile to `info_pending` / `meet_greet_pending`). Sign in as that user, visit `/onboarding` at desktop + mobile. Record the exact issue: the account sidebar/zone nav rendering around a gate the user can't use, and whether the AccountMenu/`accountNav` shows an active/locked state. This is the behavior the move corrects — note it in the commit-prep.

- [ ] **Step 2: Move onboarding out of the account group**

```bash
git mv src/app/(account)/onboarding src/app/(onboarding)/onboarding
```

(Route groups don't affect the URL — the page stays at `/onboarding`. The middleware gate in `src/lib/supabase/proxy.ts` keys on the URL, unaffected.) The page already does its own `getUser()` → `/login` redirect and onboarding-status branching, so it no longer needs the `(account)` layout's auth backstop.

- [ ] **Step 3: Add the minimal onboarding layout**

```tsx
// src/app/(onboarding)/layout.tsx
import { PageShell } from "@/components/layout/page-shell";

/**
 * Onboarding zone — a pre-account gate, intentionally OUTSIDE the account
 * sidebar shell. Renders only the global header (which is the way back to the
 * site) plus the page's own back affordance. No zoneNav: an onboarding user
 * has no account sections to navigate yet.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageShell>{children}</PageShell>;
}
```

(Confirm `PageShell`'s props — it is used as `PageShell zoneNav={...}` in `(account)/layout.tsx`; here we render it with no `zoneNav`. Verify `zoneNav` is optional; if not, make it optional.)

- [ ] **Step 4: Build the nav-skeleton primitive**

```tsx
// src/components/layout/back-to-site.tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Wayfinding affordance for dead-end pages (onboarding, and any page without a
 * zone nav). Industry guidance: a flat hierarchy needs an explicit way back /
 * top-level indicator, not a breadcrumb trail. Reusable across SP6 surfaces.
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
```

- [ ] **Step 5: Test the primitive**

```tsx
// src/components/layout/back-to-site.test.tsx
import { render, screen } from "@testing-library/react";
import { BackToSite } from "./back-to-site";

it("renders a labeled link to home by default", () => {
  render(<BackToSite />);
  const link = screen.getByRole("link", { name: /back to site/i });
  expect(link).toHaveAttribute("href", "/");
});
```

Run: `npm run test -- src/components/layout/back-to-site.test.tsx` → Expected: PASS.

- [ ] **Step 6: Render the affordance on onboarding**

In `(onboarding)/onboarding/page.tsx`, add `<BackToSite />` near the top of each returned `PageContainer` (above the `StepBar`/`PageHeader`) so every onboarding step has a visible exit. Keep the existing `StepBar` (the step indicator).

- [ ] **Step 7: Confirm the symptom is gone + gates**

Run: `npm run typecheck` → PASS
Run: `npm run lint` → PASS (boundaries: no `src/app` deep feature import introduced)
Run: `npm run test -- src/components/layout/back-to-site.test.tsx` → PASS
Manual (execution session): `/onboarding` now renders under the global header with a Back-to-site affordance, no account sidebar, no mis-highlighted Account; desktop + mobile. Walk `info_pending` → submit → `meet_greet_pending` to confirm both steps render correctly post-move.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: move onboarding out of the account zone with a back affordance"
```

---

## Task 5: Admin attention-badge primitive + counts seam (AD5 setup)

Ship the reusable nav-badge primitive + the typed `AttentionCounts` seam shape and its admin-nav injection point — **without** wiring live data. SP5 (admin overhaul) fills the seam with real counts + final placement.

**Files:**

- Create: `src/components/ui/nav-badge.tsx`
- Create: `src/components/ui/nav-badge.test.tsx`
- Create: `src/features/admin/attention-counts.ts` (the typed seam) + export from `src/features/admin/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ui/nav-badge.test.tsx
import { render, screen } from "@testing-library/react";
import { NavBadge } from "./nav-badge";

it("renders the count with an accessible label when positive", () => {
  render(<NavBadge count={3} label="items need attention" />);
  expect(screen.getByText("3")).toBeInTheDocument();
  expect(screen.getByLabelText("3 items need attention")).toBeInTheDocument();
});

it("renders nothing when the count is zero (no noise)", () => {
  const { container } = render(<NavBadge count={0} label="x" />);
  expect(container).toBeEmptyDOMElement();
});
```

Run: `npm run test -- src/components/ui/nav-badge.test.tsx` → Expected: FAIL.

- [ ] **Step 2: Implement the badge primitive**

```tsx
// src/components/ui/nav-badge.tsx
import { cn } from "@/lib/utils";

/**
 * Attention badge for nav affordances. Renders only when actionable (count > 0)
 * — an always-present badge loses meaning (industry rule). Red attention state,
 * contrast-checked; announces its count.
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
      aria-label={`${count} ${label}`}
      className={cn(
        "bg-destructive text-destructive-foreground inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs leading-none font-semibold",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
```

(Confirm `destructive`/`destructive-foreground` give AA contrast; if the design prefers a dedicated attention token, add one to `globals.css` rather than hardcoding — tokens are law.)

Run: `npm run test -- src/components/ui/nav-badge.test.tsx` → Expected: PASS.

- [ ] **Step 3: Define the counts seam (typed, unwired)**

```ts
// src/features/admin/attention-counts.ts
/**
 * What needs Cal's attention right now. The shape is the seam SP3b ships; SP5
 * wires real queries + the nav placement. Until then `emptyAttentionCounts`
 * keeps the admin nav rendering zero badges (no noise).
 */
export interface AttentionCounts {
  pendingApprovals: number;
  newInquiries: number;
  flaggedConflicts: number;
}

export const emptyAttentionCounts: AttentionCounts = {
  pendingApprovals: 0,
  newInquiries: 0,
  flaggedConflicts: 0,
};
```

Add `export type { AttentionCounts } from "./attention-counts";` and `export { emptyAttentionCounts } from "./attention-counts";` to `src/features/admin/index.ts`. (Confirm the exact field set against the real admin queries when SP5 wires it — these three map to AD5's "pending approvals / new inquiries / flagged conflicts".)

- [ ] **Step 4: Verify gates + commit**

Run: `npm run typecheck` + `npm run lint` (boundary gate — the type is exported through the feature index) + `npm run test -- src/components/ui/nav-badge.test.tsx` → PASS.

```bash
git add -A
git commit -m "feat: add nav attention-badge primitive and admin counts seam"
```

---

## Task 6: Feedback conventions + return-to-top primitive

Document the feedback rule SP6 enforces (in FRONTEND.md — the design-system doc, single source of truth — not a new doc), and ship the return-to-top affordance (U9) as a primitive applied sitewide in SP6.

**Files:**

- Modify: `docs/FRONTEND.md` (add a "Feedback conventions" section)
- Create: `src/components/ui/back-to-top.tsx`
- Create: `src/components/ui/back-to-top.test.tsx`

- [ ] **Step 1: Add the Feedback conventions section to FRONTEND.md**

Append a section stating the rule + the primitive map:

```markdown
## Feedback conventions

Every user action produces visible feedback — nothing silent (enforced sitewide in the cohesion sweep). Which primitive serves which case:

- **Transient async result** (saved, booked, failed) → toast (`useToast`). Type-based duration: success/info auto-dismiss ~5 s; errors are sticky + assertive. Action-bearing toasts pass `timeout: 0` and move focus to the action.
- **Field / form validation** → inline message next to the field; never a toast alone.
- **Navigation outcome** (auth redirect-back, post-booking) → route change to a state that visibly reflects the result.
- **Destructive intent** → `useConfirm` (alertdialog; focus the least-destructive action).
- **Dead-end page** (no zone nav) → a back affordance (`BackToSite`) so there is always a way back.
- **Long page** → return-to-top affordance (`BackToTop`).
```

- [ ] **Step 2: Write the failing test for `BackToTop`**

```tsx
// src/components/ui/back-to-top.test.tsx
import { render, screen, fireEvent, act } from "@testing-library/react";
import { BackToTop } from "./back-to-top";

it("is hidden until the page is scrolled past the threshold", () => {
  render(<BackToTop />);
  expect(screen.queryByRole("button", { name: /back to top/i })).toBeNull();
  act(() => {
    Object.defineProperty(window, "scrollY", { value: 800, writable: true });
    window.dispatchEvent(new Event("scroll"));
  });
  expect(
    screen.getByRole("button", { name: /back to top/i }),
  ).toBeInTheDocument();
});
```

Run: `npm run test -- src/components/ui/back-to-top.test.tsx` → Expected: FAIL.

- [ ] **Step 3: Implement `BackToTop`**

```tsx
// src/components/ui/back-to-top.tsx
"use client";

import * as React from "react";
import { ArrowUp } from "lucide-react";

/**
 * Return-to-top affordance for long pages. Hidden until scrolled past
 * `threshold`; bottom-right; respects reduced motion. Applied per-page in SP6.
 */
export function BackToTop({ threshold = 600 }: { threshold?: number }) {
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setShown(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  if (!shown) return null;
  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        })
      }
      className="bg-card text-foreground border-border hover:bg-muted fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex size-11 items-center justify-center rounded-full border shadow-lg"
    >
      <ArrowUp className="size-5" />
    </button>
  );
}
```

(The repo eslint bans set-state-in-effect; this effect sets state from a scroll **event handler** + an initial sync call, which is the sanctioned pattern — confirm lint passes; if the initial `onScroll()` trips the rule, gate it behind the event listener only.)

Run: `npm run test -- src/components/ui/back-to-top.test.tsx` → Expected: PASS.

- [ ] **Step 4: Verify gates + commit**

Run: `npm run typecheck` + `npm run lint` + both new tests → PASS.

```bash
git add -A
git commit -m "feat: add return-to-top primitive and feedback conventions"
```

---

## Task 7: Definition-of-done wrap (both plans)

Prune the findings, update the handoff, request review. Runs after Plan A **and** Plan B tasks are complete.

**Files:**

- Modify: `docs/superpowers/specs/2026-06-10-audit-findings.md`
- Modify: `docs/superpowers/HANDOFF.md`

- [ ] **Step 1: Full verification (execution session, stack up)**

Run: `npm run typecheck` → PASS
Run: `npm run lint` → PASS (boundary gate)
Run: `npm run test` → no new failures vs the SP3a baseline (the documented 7 pre-existing shared-DB isolation failures are not regressions)
Manual `verify`: confirm-dialog, toast, onboarding, attention-badge render correct at desktop + mobile + breakpoint transition; a11y (focus, roles, contrast) checked.

- [ ] **Step 2: Prune the findings register**

Remove A2, A12 from the §SP3 table; remove A13, A14, A16 from the SP3a-follow-ups table. Add a one-line note: U3 active-state + U7 build resolved by SP3b primitives (sitewide application remains SP6); AD5 primitive-ready (SP5 wires counts). Update the register's `_Last reviewed_` footer.

- [ ] **Step 3: Update HANDOFF.md**

Progress table: mark SP3b **DONE**, SP4 **next**. Append a Session log line: `2026-06-10 · SP3b · executed (subagent-driven): Plan A codebase deepening (A13/A14/A16) + Plan B IA/primitives (unified confirm dialog, dialog primitive, type-based toast, onboarding moved out of account zone + back-to-site skeleton, nav attention-badge + counts seam, feedback conventions + return-to-top); behavior-preserving where required, all gates green.`

- [ ] **Step 4: Request fresh-session code review**

Per repo policy (author never grades itself), arrange `/code-review` from a fresh session over the SP3b diff. Resolve any criticals in this plan's `## Handoff log` before declaring SP3b done.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: close out system IA and primitives foundations"
```

---

## Definition of done (Plan B)

- A2 + A12 pruned; U3 active-state + U7 build resolved (sitewide application noted SP6); AD5 primitive-ready (SP5 wires counts).
- Confirm-dialog unified on one hook; `ui/confirm-dialog.tsx` deleted; dialog primitive + shared shell shipped; toast type-based; onboarding standalone with a back affordance; attention-badge + counts seam shipped; feedback conventions + return-to-top primitive shipped.
- Each primitive has a unit/interaction test; each migrated site verified desktop **and** mobile + breakpoint transition; a11y checked.
- Tokens only — no hardcoded colors/timings beyond documented duration constants.
- HANDOFF Progress + Session log updated; findings pruned; fresh-session review clean.

---

## Handoff log

(Append blocking criticals here during execution; resolve before Plan B DoD.)

---

_Last reviewed: 2026-06-10_
