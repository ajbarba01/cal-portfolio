# Pricing Language (Plan 4b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give confusing pricing terms plain-language definitions via an info-tooltip in the booking quote receipt and the marketing breakdown, from one static copy registry.

**Architecture:** A new `Tooltip` primitive (Base UI) provides the hover/tap/keyboard affordance. A pure `term-descriptions` registry maps a stable, structure-derived key for each pricing modifier to a definition string (Cal-approved copy). The pure quote evaluator and the pure marketing `pricingBreakdown` both attach an optional `description` to their line/row outputs via that registry; the two receipts render an ⓘ tooltip when a description is present. Copy that renames existing admin-config labels (e.g. "Premium night") is drafted for Cal, not shipped.

**Tech Stack:** Next.js (App Router) + TypeScript strict · `@base-ui/react` (Tooltip) · Tailwind + semantic tokens · Vitest + @testing-library/react.

## Global Constraints

- TypeScript `strict`, no `any`.
- Design tokens are law — components reference semantic tokens, never hardcoded colors. **No drop shadows** (house rule) — the tooltip popup uses a border, not a shadow.
- Accessibility floor: keyboard-focusable trigger, `Esc` to dismiss, tap-to-toggle on touch, correct ARIA (Base UI handles this — do not regress it).
- Tooltip is built on `@base-ui/react/tooltip` (this repo layers shadcn-style wrappers over Base UI — NOT Radix), mirroring the existing wrapper pattern in `src/components/ui/dialog.tsx`.
- Core logic pure and unit-tested: the term registry + `describeModifier` have no IO.
- Cross-feature imports go through feature barrels (ADR-0001): pricing is imported via `@/features/pricing`.
- Edit/Write tools ONLY for source edits (registry copy may contain punctuation/em-dashes — avoid PowerShell mojibake).
- Commit messages: Conventional Commits, subject line only — no body, no `Co-Authored-By`/trailer, no "Generated with" footer. No project-internal identifiers in the subject.
- **Label renames of existing admin-config `mod.label` strings are OUT OF SCOPE for code** — they are drafted for Cal via copy-sync (Task 6). Only the two STATIC display-layer labels in `display.ts` may change in code (Task 5).
- Descriptions ship as DRAFT copy pending Cal's copy-sync sign-off; they are additive (new tooltips), not edits to existing labels.

---

### Task 1: Tooltip primitive + InfoTooltip

**Files:**

- Create: `src/components/ui/tooltip.tsx`
- Test: `src/components/ui/tooltip.test.tsx`
- Modify: `src/app/showcase/showcase-client.tsx` (register a Tooltip example)
- Modify: `docs/COMPONENT_SYSTEM.md` (add the Tooltip entry — same-commit doc rule)

**Interfaces:**

- Produces: `Tooltip` (thin wrapper: props `content: React.ReactNode`, `children` as the trigger) and `InfoTooltip` (an ⓘ icon-button trigger with `label: string` for the accessible name + `content`). Both render nothing extra when `content` is empty.

- [ ] **Step 1: Invoke the frontend-design skill** (repo rule: before building any UI). Note the token classes for a bordered, shadow-free popup consistent with `dialog.tsx`/`toast.tsx`.

- [ ] **Step 2: Write the failing test**

```tsx
// src/components/ui/tooltip.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InfoTooltip } from "./tooltip";

describe("InfoTooltip", () => {
  it("exposes the label as the trigger's accessible name", () => {
    render(
      <InfoTooltip
        label="What is a premium night?"
        content="A holiday surcharge."
      />,
    );
    expect(
      screen.getByRole("button", { name: "What is a premium night?" }),
    ).toBeInTheDocument();
  });

  it("reveals the content on focus", async () => {
    const user = userEvent.setup();
    render(
      <InfoTooltip label="Premium night" content="A holiday surcharge." />,
    );
    await user.tab();
    expect(await screen.findByText("A holiday surcharge.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/ui/tooltip.test.tsx`
Expected: FAIL — cannot find module `./tooltip`.

- [ ] **Step 4: Implement the primitive**

Model the wrapper on `src/components/ui/dialog.tsx` (same Base UI part-composition idiom). Read the installed API first: `node_modules/@base-ui/react/esm/tooltip/index.d.ts` and the parts (`root`, `trigger`, `portal`, `positioner`, `popup`, `provider`). Reconcile exact prop names with that d.ts — the shape below is the intended structure; adjust part props to the installed version if they differ.

```tsx
// src/components/ui/tooltip.tsx
"use client";

import * as React from "react";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { cn } from "@/lib/utils";

/**
 * Tooltip — hover (pointer), tap-to-toggle (touch), and focus (keyboard) reveal
 * of short helper text. Bordered, shadow-free popup per the house no-shadow rule;
 * tokens only. Thin wrapper over @base-ui/react so callers don't compose parts.
 */
export function Tooltip({
  content,
  children,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!content) return <>{children}</>;
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children as React.ReactElement} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner sideOffset={6}>
          <BaseTooltip.Popup
            className={cn(
              "border-border bg-popover text-popover-foreground max-w-xs rounded-md border px-3 py-2 text-xs leading-relaxed",
            )}
          >
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}

/**
 * InfoTooltip — an ⓘ icon button that reveals `content`. `label` is the trigger's
 * accessible name (the tooltip content is visual; screen-reader users get `label`).
 */
export function InfoTooltip({
  label,
  content,
}: {
  label: string;
  content: React.ReactNode;
}) {
  if (!content) return null;
  return (
    <Tooltip content={content}>
      <button
        type="button"
        aria-label={label}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-4 items-center justify-center rounded-full align-middle focus-visible:ring-2 focus-visible:outline-none"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5">
          <circle
            cx="8"
            cy="8"
            r="7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M8 7v4M8 5h.01"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </Tooltip>
  );
}
```

If the installed Base UI Tooltip requires a `Tooltip.Provider` ancestor, add one at the app root (`src/app/layout.tsx` or the existing provider stack) and note it in the report. Confirm the popup token classes (`bg-popover`, `border-border`) exist in `globals.css`; if not, use the nearest existing surface tokens (match `dialog.tsx`).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/ui/tooltip.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Register in /showcase + document**

Add a Tooltip section to `showcase-client.tsx` (import `InfoTooltip`, render one beside a sample label). Add a Tooltip row to `docs/COMPONENT_SYSTEM.md` in the primitives registry (when to use it: definitions/helper text; not for essential content).

- [ ] **Step 7: Typecheck + commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add src/components/ui/tooltip.tsx src/components/ui/tooltip.test.tsx src/app/showcase/showcase-client.tsx docs/COMPONENT_SYSTEM.md
git commit -m "feat(ui): tooltip primitive with info-tooltip"
```

---

### Task 2: Pricing term-descriptions registry

**Files:**

- Create: `src/features/pricing/term-descriptions.ts`
- Test: `src/features/pricing/term-descriptions.test.ts`
- Modify: `src/features/pricing/index.ts` (barrel — export the public helper)

**Interfaces:**

- Consumes: `Modifier` from `./modifier-types`.
- Produces: `describeModifier(mod: Modifier): string | undefined` — the definition string for a modifier, or undefined if none. Internally: `termKeyForModifier(mod): string | undefined` (pure, structure-derived key) + `TERM_DESCRIPTIONS: Record<string, string>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/pricing/term-descriptions.test.ts
import { describe, it, expect } from "vitest";
import { describeModifier } from "./term-descriptions";
import type { Modifier } from "./modifier-types";

describe("describeModifier", () => {
  it("defines the premium (holiday) surcharge by its condition, not its admin label", () => {
    const mod: Modifier = {
      kind: "pct_surcharge",
      id: "whatever-admin-typed",
      label: "Premium night",
      pct: 25,
      scope: "perPremiumNight",
      condition: "premiumDays",
    };
    expect(describeModifier(mod)).toMatch(/holiday/i);
  });

  it("defines the needy-care ladder toggle", () => {
    const mod: Modifier = {
      kind: "flat_per_night_toggle",
      id: "needy",
      label: "Needy pet care",
      cents: 1500,
      source: { kind: "ladder", input: "needyTier", maxTier: 4 },
    };
    expect(describeModifier(mod)).toMatch(/attention/i);
  });

  it("defines per-cat flat pricing as including the first", () => {
    const mod: Modifier = { kind: "flat_per_unit", unit: "cat", cents: 800 };
    expect(describeModifier(mod)).toMatch(/including the first/i);
  });

  it("returns undefined for a modifier with no defined term", () => {
    const mod: Modifier = { kind: "base_per_night", cents: 5000 };
    expect(describeModifier(mod)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/pricing/term-descriptions.test.ts`
Expected: FAIL — cannot find module `./term-descriptions`.

- [ ] **Step 3: Implement the registry**

```ts
// src/features/pricing/term-descriptions.ts
import type { Modifier } from "./modifier-types";

/**
 * Plain-language definitions for pricing terms customers find confusing.
 *
 * Keys are STRUCTURE-DERIVED (a modifier's condition / ladder input / unit),
 * never the admin-typed `label` or `id` — so the copy can't drift when Cal
 * renames a modifier. These strings are Cal-approved copy (copy-sync); drafts
 * here ship as tooltips and are refined via the copy-sync protocol.
 */
export const TERM_DESCRIPTIONS: Record<string, string> = {
  premiumDays:
    "Holiday & peak-date rate — a surcharge that applies on major holidays and other high-demand dates.",
  needyTier:
    "Extra-attention care — for pets needing more frequent check-ins or hands-on care during the stay.",
  nightsOver4: "Long stay — applies once a booking runs longer than 4 nights.",
  nightsOver6:
    "Extended stay — applies once a booking runs longer than 6 nights.",
  "unit:cat": "Per cat, including the first.",
  "unit:dog": "Per dog, including the first.",
};

/** Stable, structure-derived key for a modifier, or undefined if it has no term. */
export function termKeyForModifier(mod: Modifier): string | undefined {
  switch (mod.kind) {
    case "flat_per_unit":
      return mod.unit === "cat" || mod.unit === "dog"
        ? `unit:${mod.unit}`
        : undefined;
    case "pct_surcharge":
      return mod.condition === "premiumDays" ? "premiumDays" : undefined;
    case "flat_per_night_toggle":
      return mod.source.kind === "ladder" && mod.source.input === "needyTier"
        ? "needyTier"
        : mod.source.kind === "condition" &&
            (mod.source.condition === "nightsOver4" ||
              mod.source.condition === "nightsOver6")
          ? mod.source.condition
          : undefined;
    default:
      return undefined;
  }
}

/** The definition string for a modifier, or undefined. */
export function describeModifier(mod: Modifier): string | undefined {
  const key = termKeyForModifier(mod);
  return key ? TERM_DESCRIPTIONS[key] : undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/pricing/term-descriptions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Export from the barrel + commit**

Add to `src/features/pricing/index.ts`: `export { describeModifier } from "./term-descriptions";`

Run: `npm run typecheck`
Expected: clean.

```bash
git add src/features/pricing/term-descriptions.ts src/features/pricing/term-descriptions.test.ts src/features/pricing/index.ts
git commit -m "feat(pricing): term-descriptions registry"
```

---

### Task 3: Attach descriptions to quote lines

**Files:**

- Modify: `src/features/pricing/types.ts:148-151` (QuoteLine)
- Modify: `src/features/pricing/modifiers/evaluate.ts` (set `description` on modifier-derived lines)
- Test: `src/features/pricing/modifiers/evaluate.test.ts` (extend)

**Interfaces:**

- Consumes: `describeModifier` from Task 2.
- Produces: `QuoteLine.description?: string` populated for lines built from a modifier that has a defined term.

- [ ] **Step 1: Write the failing test** (append to `evaluate.test.ts`)

```ts
it("attaches a description to the premium-surcharge line", () => {
  const config: ServicePricingConfig = {
    modifiers: [
      { kind: "base_per_night", cents: 5000 },
      {
        kind: "pct_surcharge",
        id: "prem",
        label: "Premium night",
        pct: 25,
        scope: "perPremiumNight",
        condition: "premiumDays",
      },
    ],
    constraints: { intervalMin: 1440, allowedSpecies: ["dog"] },
  };
  const quote = evaluateQuote({ config, nights: 2, premiumNights: 1 });
  const premiumLine = quote.lines.find((l) => l.label === "Premium night");
  expect(premiumLine?.description).toMatch(/holiday/i);
});
```

(Match `evaluateQuote` to the actual exported evaluator name/signature used elsewhere in `evaluate.test.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/pricing/modifiers/evaluate.test.ts`
Expected: FAIL — `description` is undefined (property not set yet).

- [ ] **Step 3: Add the field + populate it**

In `types.ts`, extend `QuoteLine`:

```ts
export interface QuoteLine {
  label: string;
  amountCents: number;
  /** Optional plain-language definition, rendered as an info-tooltip. */
  description?: string;
}
```

In `evaluate.ts`, import `describeModifier` (`import { describeModifier } from "../term-descriptions";`) and set `description: describeModifier(mod)` on each `lines.push({...})` that is built from a `mod` with a term — at minimum the `pct_surcharge`, `flat_per_night_toggle` (both branches), and `flat_per_unit` line pushes. Example:

```ts
lines.push({
  label: mod.label,
  amountCents: amt,
  description: describeModifier(mod),
});
```

Leave computed lines with no backing modifier (base, "Minimum charge", custom adjustments) without a description. `description: undefined` is fine (optional).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/pricing/modifiers/evaluate.test.ts`
Expected: PASS (all existing + new).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add src/features/pricing/types.ts src/features/pricing/modifiers/evaluate.ts src/features/pricing/modifiers/evaluate.test.ts
git commit -m "feat(pricing): describe quote lines"
```

---

### Task 4: Render the tooltip in the booking quote receipt

**Files:**

- Modify: `src/features/booking/_components/quote-panel.tsx:48-53` (line render)
- Test: `src/features/booking/_components/quote-panel.test.tsx` (create if absent)

**Interfaces:**

- Consumes: `InfoTooltip` (Task 1), `QuoteLine.description` (Task 3).

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/booking/_components/quote-panel.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuotePanel } from "./quote-panel";

// Build the minimal BookingQuotePreview shape QuotePanel expects; match the real
// prop type in quote-panel.tsx (read it) — include one line WITH a description.
const preview = {
  breakdown: {
    lines: [
      {
        label: "Premium night",
        amountCents: 1250,
        description: "Holiday & peak-date rate — ...",
      },
      { label: "House sitting base (2 nights)", amountCents: 10000 },
    ],
  },
  totalCents: 11250,
} as const;

describe("QuotePanel", () => {
  it("renders an info-tooltip trigger for a line that has a description", () => {
    render(<QuotePanel preview={preview as never} />);
    expect(
      screen.getByRole("button", { name: /premium night/i }),
    ).toBeInTheDocument();
  });
});
```

(Read `quote-panel.tsx` for the exact `preview` prop shape + required props; adjust the fixture and the `InfoTooltip` label convention to match what you render.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/_components/quote-panel.test.tsx`
Expected: FAIL — no tooltip button rendered.

- [ ] **Step 3: Render the tooltip**

In `quote-panel.tsx`, where each line label renders (around line 50, `<span className="text-foreground/70">{line.label}</span>`), append an `InfoTooltip` when `line.description` is set:

```tsx
<span className="text-foreground/70 inline-flex items-center gap-1">
  {line.label}
  {line.description && (
    <InfoTooltip
      label={`What is “${line.label}”?`}
      content={line.description}
    />
  )}
</span>
```

Import `InfoTooltip` from `@/components/ui/tooltip`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/booking/_components/quote-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add src/features/booking/_components/quote-panel.tsx src/features/booking/_components/quote-panel.test.tsx
git commit -m "feat(booking): define quote terms with tooltips"
```

---

### Task 5: Descriptions + tooltip in the marketing breakdown (+ shippable static label)

**Files:**

- Modify: `src/features/pricing/display.ts` (`PricingBreakdownRow` + `pricingBreakdown`)
- Modify: `src/app/(site)/(marketing)/services/page.tsx` (render the ⓘ)
- Test: `src/features/pricing/display.test.ts` (extend)

**Interfaces:**

- Consumes: `describeModifier` (Task 2), `InfoTooltip` (Task 1).
- Produces: `PricingBreakdownRow.description?: string`.

- [ ] **Step 1: Write the failing test** (append to `display.test.ts`)

```ts
it("labels non-dog/cat unit rows as small animal and describes cat rows", () => {
  const config: ServicePricingConfig = {
    modifiers: [
      { kind: "base_per_night", cents: 5000 },
      { kind: "flat_per_unit", unit: "cat", cents: 800 },
      { kind: "flat_per_unit", unit: "other", cents: 500 },
    ],
    constraints: { intervalMin: 1440, allowedSpecies: ["dog", "cat"] },
  };
  const rows = pricingBreakdown(config);
  const cat = rows.find((r) => r.label === "Each cat");
  expect(cat?.description).toMatch(/including the first/i);
  expect(rows.some((r) => r.label === "Each additional small animal")).toBe(
    true,
  );
  expect(rows.some((r) => r.label === "Each additional animal")).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/pricing/display.test.ts`
Expected: FAIL — `description` unset and the label is still "Each additional animal".

- [ ] **Step 3: Add description + the static label change**

In `display.ts`: add `description?: string` to `PricingBreakdownRow`. In `pricingBreakdown`, for each `mod`-derived row call `describeModifier(mod)` and set `description`. Change the two STATIC `"Each additional animal"` labels (the `flat_per_unit` and `tiered_per_unit` `else` branches) to `"Each additional small animal"`. Keep `"Each cat"`/`"Each dog"` labels; they gain descriptions via `describeModifier`. Example for the flat_per_unit branch:

```ts
const unitLabel =
  mod.unit === "dog"
    ? "Each dog"
    : mod.unit === "cat"
      ? "Each cat"
      : "Each additional small animal";
rows.push({
  label: unitLabel,
  value: `+${formatCents(mod.cents)}`,
  description: describeModifier(mod),
});
```

Import `describeModifier` from `./term-descriptions`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/pricing/display.test.ts`
Expected: PASS.

- [ ] **Step 5: Render the ⓘ in the services page**

In `services/page.tsx`, where breakdown rows render, add `{row.description && <InfoTooltip label={...} content={row.description} />}` beside the row label (import from `@/components/ui/tooltip`). Follow the existing row markup; tokens only, no shadow.

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add src/features/pricing/display.ts src/features/pricing/display.test.ts "src/app/(site)/(marketing)/services/page.tsx"
git commit -m "feat(pricing): define breakdown terms with tooltips"
```

---

### Task 6: Draft the Cal copy-sync deliverable (blocked-on-Cal label renames)

**Files:**

- Create: `docs/content/pricing-language-drafts.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Write the draft doc**

Create `docs/content/pricing-language-drafts.md` listing, for Cal's copy-sync approval:

1. The tooltip description copy shipped in `term-descriptions.ts` (verbatim), marked "shipped as draft — confirm or revise".
2. The **label renames that need Cal to edit admin config** (NOT shipped): "Premium night" → "Holiday & peak-date rate"; "Needy pet care" → "Extra-attention care". Note these live in each service's pricing config (admin editor), so Cal applies them there; the descriptions already key off structure, so they survive the rename.
3. FAQ candidate note: definitions of long stay / extended stay / premium / needy for the FAQ pass (cross-link the tester-feedback plan).

Follow `docs/CONTENT.md` copy-sync conventions for the format.

- [ ] **Step 2: Commit**

```bash
git add docs/content/pricing-language-drafts.md
git commit -m "docs: draft pricing language for copy-sync"
```

---

### Task 7: Verification + docs sweep

- [ ] **Step 1: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean (pre-existing unrelated warnings OK; no NEW errors, no boundary violations).

- [ ] **Step 2: Full unit suite**

Run: `npm run test`
Expected: the tranche's new tests pass. The repo's Supabase integration suites (`*.integration.test.ts`, `booking-service.test.ts`) may fail on missing local fixtures — confirm any failures are pre-existing (same failures on `git stash`) and unrelated to these files; report the distinction, do not fix unrelated integration failures.

- [ ] **Step 3: Manual smoke (if a dev server is available)**

Load `/showcase` (tooltip visible + keyboard-openable), a `/services` card with a cat/premium modifier (ⓘ present), and a booking quote with a premium/needy line (ⓘ present). Confirm no drop shadow on the popup. Record what you observed.

- [ ] **Step 4: Commit any doc updates**

If `docs/COMPONENT_SYSTEM.md` wasn't fully updated in Task 1, finish it here.

```bash
git add -A
git commit -m "docs: finalize pricing-language tranche notes"
```

---

## Self-Review notes

- **Spec coverage:** F1 → Task 1 (tooltip primitive). F2 → Tasks 2,3,4,5 (registry + QuoteLine/PricingBreakdownRow descriptions + both receipts). F3 → Task 6 (Cal drafts) + the shippable static label in Task 5.
- **Descriptions model:** static registry keyed by structure (condition/ladder/unit), never admin-typed label/id — chosen with the maintainer (YAGNI vs an admin editor).
- **Type consistency:** `describeModifier`, `termKeyForModifier`, `TERM_DESCRIPTIONS`, `QuoteLine.description`, `PricingBreakdownRow.description`, `InfoTooltip`/`Tooltip` used identically across tasks.
- **Out of scope:** admin-editable descriptions; renaming admin-config `mod.label` strings in code (Cal-owned copy-sync).

---

_Last reviewed: 2026-07-12_
