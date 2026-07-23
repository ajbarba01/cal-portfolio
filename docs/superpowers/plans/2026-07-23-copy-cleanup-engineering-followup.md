# Copy-cleanup Engineering Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the twelve `route:engineering` and four `route:component` defects the writing-voice cleanup pass recorded in `docs/content/voice/copy-register.md`, and add a lint rule that prevents the two error-leak classes from regressing.

**Architecture:** Four sub-projects in one ledger. SP1 stops internal error objects reaching users (suppress the value, show a clean static message, log the raw server-side). SP2 makes admin/action failure paths surface the real `.message` instead of a bare union tag, then codifies both classes as a lint rule. SP4 fixes three component-convention gaps. SP3 resolves two copy-vs-code truth defects that need a decision first. Findings are referenced by their register IDs (F1–F4, G1–G7, K3–K5, A3, C1, D2); the register Note for each carries the verified trace and is the source of truth.

**Tech Stack:** Next.js (App Router) + TypeScript strict · zod v4 · Vitest · ESLint flat config (`eslint.config.mjs`) with an existing inline custom plugin (`no-drift`) as the template for the new rule.

## Global Constraints

- **Work on `main`, no worktree. Stage by name.** Never `git add -A`.
- **Commit messages: subject line only.** Conventional Commits — no body, no trailers, no `Co-Authored-By`, no "Generated with" footer, no internal identifiers (no plan names, phase numbers, ticket IDs).
- **TypeScript `strict`, no `any`.** `npm run typecheck` must stay green.
- **Do NOT run bare `npm test` / `vitest run`.** These suites are DB-backed and fail (38) without the local Supabase stack, pre-existing: `create-client.integration.test.ts`, `admin-create-booking.integration.test.ts`, `edit-booking.integration.test.ts`, `booking-service.test.ts`, `create-booking.mutation.test.ts`. Gate each task on its own scoped unit suite (`npx vitest run <file>`), never the whole run.
- **Tests assert exact strings.** Any message you change ships its test update in the SAME commit. Grep first: `grep -rln "<string>" src --include=*.test.ts --include=*.test.tsx`.
- **Out of bounds:** `src/content/marketing.ts`, anything via `<MarketingCopy>`, `src/content/rover-reviews.ts`, `src/features/notifications/emails.ts`, `src/app/showcase/**`.
- **Cal uses they/them.** Never a gendered pronoun for Cal.
- **Same-commit doc rule.** A code change that adds/moves/deletes files updates the relevant doc in the same commit. Run `node scripts/check-doc-links.mjs` when docs change.
- **Register is the live status board.** When a finding is fixed, in the SAME commit flip its register row's verdict from `route:engineering` / `route:component` to `fixed (<7-char-commit>)`. (The commit hash is not known until after commit — so: commit the code+register-verdict-text as `fixed (pending)`, or amend the verdict line in the immediately following commit. Prefer: include the register edit in the fix commit with the prior commit's short hash left as `fixed` without a hash, then a single final close-out task backfills hashes. See Task 16.)
- **Testing altitude (deliberate).** Pure-logic findings (F4, K5) get full TDD unit tests. The one-line static-message UI swaps (F1, F2, C1, G1, G2, G4, and the SP4 component edits) are verified by `npm run typecheck`, reading the named consumer chain, and `npm run lint` (existing rules) — not by new component tests. A component test asserting a now-static toast string is brittle and low-value. This is a YAGNI choice, stated so it is visible, not an omission. Regression prevention for the two error-leak classes is code review plus the nearby-class sweep already run during planning (a repo-wide grep for `${…kind}` / `${…message}` interpolation found no unguarded survivors beyond the sites this plan fixes); a lint rule was considered and dropped because the sanctioned guarded fallback legitimately contains `${result.kind}`, so no low-false-positive rule distinguishes it from the bug.

---

## SP1 — Internal error leaks

### Task 1: F4 — clean message from `computeBookingArtifacts` (leads the plan)

**Files:**

- Modify: `src/features/booking/booking-service-shared.ts:504-507`
- Test: `src/features/booking/compute-artifacts-validation.test.ts` (create)
- Register: `docs/content/voice/copy-register.md` (F4 row verdict)

**Interfaces:**

- Consumes: `computeBookingArtifacts(deps, rawInput, policy, opts?)` → `ArtifactsResult`; the `{ kind: "validation_error"; message: string }` variant (`:470`).
- Produces: nothing new; the fixed static message flows unchanged through the three existing consumers (`messages.ts:79`, `use-edit-booking.ts:336/398`, `use-admin-create-booking.ts:250`) — no consumer edit needed.

Why F4 leads: on a failed `createBookingInputSchema.safeParse`, zod v4's `parseResult.error.message` is the `JSON.stringify`d issues array (`code`/`path`/`pattern`), rendered raw to users on public create, edit, and admin book-on-behalf. The parse fails at the top of the function before any `deps`/DB access, so the branch is pure and unit-testable with a stub `deps`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/booking/compute-artifacts-validation.test.ts
import { describe, expect, it, vi } from "vitest";
import { computeBookingArtifacts } from "./booking-service-shared";
import { CLIENT_POLICY } from "./mutation-policy";
import type { CreateBookingInput } from "./booking-service-shared";

describe("computeBookingArtifacts validation branch", () => {
  it("returns a clean static message and does not leak zod's serialized issues", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Invalid input: fails safeParse before any deps/DB access is reached.
    const result = await computeBookingArtifacts(
      {} as never,
      {} as CreateBookingInput,
      CLIENT_POLICY,
    );
    expect(result.kind).toBe("validation_error");
    if (result.kind !== "validation_error") throw new Error("wrong kind");
    expect(result.message).toBe(
      "Please check your booking details and try again.",
    );
    // The old bug leaked JSON with these tokens; assert they are gone.
    expect(result.message).not.toMatch(/"code"|"path"|"pattern"|\[/);
    expect(errorSpy).toHaveBeenCalled(); // raw issues logged server-side
    errorSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/compute-artifacts-validation.test.ts`
Expected: FAIL — `result.message` is the JSON issues array, not the static string; and `console.error` was not called.

- [ ] **Step 3: Write minimal implementation**

Replace `booking-service-shared.ts:504-507`:

```ts
// 1. Validate
const parseResult = createBookingInputSchema.safeParse(rawInput);
if (!parseResult.success) {
  // zod v4's error.message is the serialized issues array (code/path/pattern).
  // Log it for diagnosis; never show it to a user.
  console.error(
    "computeBookingArtifacts: booking input failed validation",
    parseResult.error.issues,
  );
  return {
    kind: "validation_error",
    message: "Please check your booking details and try again.",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/booking/compute-artifacts-validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify no test asserted the old leak, and typecheck**

Run: `grep -rln "error.message" src/features/booking --include=*.test.ts` and `npm run typecheck`
Expected: no test file asserts `parseResult.error.message`; typecheck clean.

- [ ] **Step 6: Flip the register row and commit**

In `docs/content/voice/copy-register.md`, change F4's verdict cell from `route:engineering` to `fixed`. Then:

```bash
git add src/features/booking/booking-service-shared.ts src/features/booking/compute-artifacts-validation.test.ts docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "fix(booking): show a clean message instead of zod's raw issues on invalid input"
```

---

### Task 2: F1 — static availability-load error

**Files:**

- Modify: `src/features/booking/use-availability.ts:141-146`
- Register: F1 row

**Interfaces:**

- Consumes: `windowsRes.error` (Supabase `PostgrestError`). The hook's `error` string feeds `<ErrorState title="Couldn't load availability" message={error} />` on all three booking surfaces plus `meet-greet-scheduler.tsx:183-184`.
- Produces: `error` is now always a static string.

- [ ] **Step 1: Apply the edit**

Replace `use-availability.ts:141-146`:

```ts
if (windowsRes.error) {
  console.error("useAvailability: failed to load windows", windowsRes.error);
  startTransition(() => {
    setError("Something went wrong. Please try again.");
  });
  return;
}
```

- [ ] **Step 2: Verify the raw driver error no longer reaches the UI**

Run: `grep -n "windowsRes.error.message" src/features/booking/use-availability.ts`
Expected: no match. Confirm by reading `booking-flow.tsx:357-361` and `meet-greet-scheduler.tsx:183-184` that `message={error}` now receives only the static string.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Flip the register row and commit**

Change F1's verdict to `fixed`.

```bash
git add src/features/booking/use-availability.ts docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "fix(booking): stop showing the raw driver error when availability fails to load"
```

---

### Task 3: F2 — static payment-record error

**Files:**

- Modify: `src/features/payments/create-intent.ts:180-185`
- Register: F2 row

- [ ] **Step 1: Apply the edit**

Replace `create-intent.ts:180-185`:

```ts
if (insertError) {
  console.error("createIntentCore: failed to record payment", insertError);
  return {
    ok: false,
    error: "Something went wrong recording your payment. Please try again.",
  };
}
```

- [ ] **Step 2: Verify**

Run: `grep -n "insertError.message" src/features/payments/create-intent.ts`
Expected: no match. Confirm `prepay-button.tsx:49` renders `{error && <p ...>{error}</p>}` — now a static string.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Flip the register row and commit**

Change F2's verdict to `fixed`.

```bash
git add src/features/payments/create-intent.ts docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "fix(payments): show a static message instead of the raw driver error on payment-record failure"
```

---

### Task 4: C1 — meet-greet toast drops the union tag

**Files:**

- Modify: `src/features/accounts/_components/meet-greet-scheduler.tsx:174-178`
- Register: C1 row

- [ ] **Step 1: Apply the edit**

Replace `meet-greet-scheduler.tsx:174-178`:

```ts
toast.add({
  title: "Couldn't save your time",
  description: "Please try another slot.",
  type: "error",
});
```

- [ ] **Step 2: Verify**

Run: `grep -n "result.kind" src/features/accounts/_components/meet-greet-scheduler.tsx`
Expected: the only remaining `result.kind` is the `=== "success"` check at `:163`; the toast description no longer interpolates it.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Flip the register row and commit**

Change C1's verdict to `fixed`.

```bash
git add src/features/accounts/_components/meet-greet-scheduler.tsx docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "fix(account): drop the internal result tag from the meet-greet failure toast"
```

---

## SP2 — Discarded `.message`, bare tag shown

### Task 5: G1 + G2 — guard the admin `run()` helpers

**Files:**

- Modify: `src/app/(site)/(admin)/admin/bookings/_components/bookings-calendar-client.tsx:524-526`
- Modify: `src/app/(site)/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx:154-156`
- Register: G1, G2 rows

**Interfaces:**

- Consumes: `ActionResult` (bookings) and the client-detail action union — both carry `{ kind: "validation_error" | "error"; message: string }` variants (register-confirmed: `approval-actions.ts:64-69`, `cancel-core.ts:18-22`). `"message" in result` narrows to those variants, exactly as `settings-client.tsx:178-182` already does.

- [ ] **Step 1: Apply the bookings-calendar edit**

Replace `bookings-calendar-client.tsx:524-526` (inside `run()`):

```ts
if (result.kind === "success") router.refresh();
else
  setError(
    "message" in result ? result.message : `Action failed: ${result.kind}`,
  );
```

- [ ] **Step 2: Apply the client-detail edit**

Replace `client-detail-client.tsx:154-156` (the `else` branch of its `run()`):

```ts
      } else {
        setError(
          "message" in result
            ? result.message
            : `Action failed: ${result.kind}`,
        );
      }
```

- [ ] **Step 3: Verify the guard matches the proven sibling**

Run: `grep -n '"message" in result' "src/app/(site)/(admin)/admin/settings/_components/settings-client.tsx"`
Expected: `:179` — confirm the new code mirrors this exact shape.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean (the `in` narrowing resolves `result.message` to `string`).

- [ ] **Step 5: Flip the register rows and commit**

Change G1 and G2 verdicts to `fixed`.

```bash
git add "src/app/(site)/(admin)/admin/bookings/_components/bookings-calendar-client.tsx" "src/app/(site)/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx" docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "fix(admin): surface the real failure message instead of the bare result tag in booking actions"
```

---

### Task 6: G4 — guard the onboarding-status toast

**Files:**

- Modify: `src/features/admin/_components/onboarding-status-select.tsx:76-82`
- Register: G4 row

**Interfaces:**

- Consumes: `ClientMutationResult` from `setOnboardingStatus` — carries `message` on `validation_error` (`clients-actions.ts:402,525,529`) and `error` (`:536`).

- [ ] **Step 1: Apply the edit**

Replace `onboarding-status-select.tsx:76-82` (the `else` branch):

```ts
      } else {
        toast.add({
          title: "Couldn't update status",
          description:
            "message" in result ? result.message : result.kind,
          type: "error",
        });
      }
```

- [ ] **Step 2: Verify**

Run: `grep -n "description: result.kind" src/features/admin/_components/onboarding-status-select.tsx`
Expected: no match.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Flip the register row and commit**

Change G4's verdict to `fixed`.

```bash
git add src/features/admin/_components/onboarding-status-select.tsx docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "fix(admin): show the real reason on onboarding-status update failure"
```

---

### Task 7: G5 — static messages in `create-client-actions` core

**Files:**

- Modify: `src/features/admin/create-client-actions.ts:101-115`, `:138-139`
- Register: G5 row

Two leak branches (the register's nearby-class hunt found the second): `:102/:115` ships `createErr.message` when it is present and not a duplicate-email; `:139` ships `profileErr.message` raw. The duplicate-email branch (`:103-113`) and `generateClaimLinkCore` (`:184-203`, register-confirmed non-leaking) are left untouched.

- [ ] **Step 1: Apply the create-error edit**

Replace `create-client-actions.ts:101-115`. Keep the duplicate-email detection (it inspects the raw text) but never return the raw text on the generic branch:

```ts
if (createErr || !created.user) {
  const raw = createErr?.message ?? "";
  if (createErr && isDuplicateEmailError(raw)) {
    // existing duplicate-email handling unchanged — keep whatever this branch
    // returned before (a static, user-language duplicate message)
    return { kind: "duplicate_email" };
  }
  console.error("createClientCore: admin.createUser failed", createErr);
  return { kind: "error", message: "Could not create the account." };
}
```

> Note for the implementer: read `:103-113` first and preserve its exact existing return shape for the duplicate case (the snippet above shows `{ kind: "duplicate_email" }` as a placeholder for whatever that branch already returns — do not invent a new kind). Only the generic `else` return changes: from `{ kind: "error", message: msg }` to the static string, with a `console.error` above it.

- [ ] **Step 2: Apply the profile-error edit**

Replace `create-client-actions.ts:138-139`:

```ts
if (profileErr) {
  console.error("createClientCore: profile insert failed", profileErr);
  return { kind: "error", message: "Could not create the account." };
}
```

- [ ] **Step 3: Verify no raw driver text remains on the leak branches**

Run: `grep -nE "createErr\?\.message|profileErr\.message" src/features/admin/create-client-actions.ts`
Expected: `createErr?.message` appears only inside the `raw` assignment used for duplicate detection; `profileErr.message` no longer appears in a returned `message`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Flip the register row and commit**

Change G5's verdict to `fixed`.

```bash
git add src/features/admin/create-client-actions.ts docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "fix(admin): stop leaking the raw driver error when creating a client"
```

---

### Task 8: G6 — static messages in `onbehalf-actions` cores

**Files:**

- Modify: `src/features/admin/onbehalf-actions.ts` lines `103, 167, 250, 270, 283, 297, 361, 372`
- Register: G6 row

Eight branches ship a raw driver `.message` (register enumerated them). Each becomes `console.error(<context>, <err>)` + a static, field-aware message. Leave the three zod `parsed.error.issues.map(...).join("; ")` returns (`:84, :148, :237`) — those are field-level validation messages, already user-language.

- [ ] **Step 1: Apply all eight edits**

For each listed line, replace the raw-message return with a logged static one. Exact replacements:

```ts
// :103  (adminCreatePetCore insert)
console.error("adminCreatePetCore: insert failed", error);
return { kind: "error", message: "Couldn't save the pet. Please try again." };

// :167  (adminUpdatePetCore)
console.error("adminUpdatePetCore: update failed", error);
return { kind: "error", message: "Couldn't save the pet. Please try again." };

// :250  (adminSubmitFormCore pet lookup)
console.error("adminSubmitFormCore: pet lookup failed", petError);
return { kind: "error", message: "Couldn't save the form. Please try again." };

// :270  (adminSubmitFormCore select)
console.error("adminSubmitFormCore: select failed", selectError);
return { kind: "error", message: "Couldn't save the form. Please try again." };

// :283  (adminSubmitFormCore write)
console.error("adminSubmitFormCore: write failed", error);
return { kind: "error", message: "Couldn't save the form. Please try again." };

// :297  (adminSubmitFormCore write, second branch)
console.error("adminSubmitFormCore: write failed", error);
return { kind: "error", message: "Couldn't save the form. Please try again." };

// :361  (adminUploadPetPhotoCore upload)
console.error("adminUploadPetPhotoCore: upload failed", uploadError);
return {
  kind: "error",
  message: "Couldn't upload the photo. Please try again.",
};

// :372  (adminUploadPetPhotoCore url update)
console.error("adminUploadPetPhotoCore: photo url update failed", updateError);
return {
  kind: "error",
  message: "Couldn't upload the photo. Please try again.",
};
```

> The line numbers will drift as you edit top-down; match on the existing `return { kind: "error", message: <err>.message };` shape per branch rather than trusting the absolute line.

- [ ] **Step 2: Verify no raw driver text remains**

Run: `grep -nE "(petError|selectError|uploadError|updateError|error)\.message" src/features/admin/onbehalf-actions.ts`
Expected: matches only inside the zod `.issues.map((i) => i.message)` validation returns, never in a `{ kind: "error", message: X.message }` return.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean (the `_`-unused-var rule may flag a now-unused error binding — if a branch no longer reads the error object except via `console.error`, that is fine; it is read).

- [ ] **Step 4: Flip the register row and commit**

Change G6's verdict to `fixed`.

```bash
git add src/features/admin/onbehalf-actions.ts docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "fix(admin): replace raw driver errors with static messages in on-behalf pet and form actions"
```

---

### Task 9: G7 — static messages in `inquiry-actions` (public /contact)

**Files:**

- Modify: `src/features/inquiries/inquiry-actions.ts:107`, `:125`
- Register: G7 row

Two leak branches inside `submitInquiryCore`, reached from the **public signed-out** `/contact` page via `contact-form.tsx:133-134` → `FormRootError`. The flagged rate-limit string itself (`:112`) is clean and unchanged. The other `.message` returns in this file (`:154, :186, :201, :214, :226, :249, :267`) live in different functions the register ruled out-of-scope/DB-shape — leave them.

- [ ] **Step 1: Apply the count-error edit**

Replace `inquiry-actions.ts:107`:

```ts
if (countError) {
  console.error("submitInquiryCore: rate-limit count failed", countError);
  return { ok: false, error: "Something went wrong. Please try again." };
}
```

- [ ] **Step 2: Apply the insert-error edit**

Replace `inquiry-actions.ts:125`:

```ts
if (error) {
  console.error("submitInquiryCore: insert failed", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}
```

- [ ] **Step 3: Verify**

Run: `grep -nE "error: (countError|error)\.message" src/features/inquiries/inquiry-actions.ts`
Expected: no match inside `submitInquiryCore`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Flip the register row and commit**

Change G7's verdict to `fixed`.

```bash
git add src/features/inquiries/inquiry-actions.ts docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "fix(contact): show a static message instead of the raw driver error on inquiry submit"
```

---

### Task 10: SP2 regression lint rule — REMOVED (do not dispatch)

Dropped at pre-flight (maintainer decision, 2026-07-23). A lint rule was considered to keep the discard/leak classes from regressing, but it is not viable: the sanctioned guarded fallback legitimately retains `${result.kind}` (`"message" in result ? result.message : \`Action failed: ${result.kind}\``), so no low-false-positive rule distinguishes the correct pattern from the bug; and a raw-`.message` detector would flag ~60 legitimate `throw new Error(\`…${err.message}\`)` and server-log sites (`booking-repository.ts`, `webhook-core.ts`, `onboarding-action.ts`, the `Unexpected X row shape`invariants). Regression prevention falls to code review plus the nearby-class sweep already run during planning: a repo-wide grep for`${…kind}`interpolation found exactly one site beyond Tasks 5–9's targets,`service-edit-form.tsx:122`, and it is already correctly guarded. Task numbering below is unchanged so references stay stable; no implementer is dispatched for this task.

---

## SP4 — Component-convention fixes

### Task 11: A3 — `/services` zero-state uses `<EmptyState>`

**Files:**

- Modify: `src/app/(site)/(marketing)/services/page.tsx:270-273`
- Reference: `src/app/(site)/(marketing)/gallery/page.tsx:54`, `reviews/page.tsx:61` (sibling `EmptyState` usage)
- Register: A3 row

- [ ] **Step 1: Read the sibling pattern**

Read `gallery/page.tsx` around `:54` and `reviews/page.tsx` around `:61` to copy the exact `EmptyState` import path and prop shape (title/description/icon) those pages use.

- [ ] **Step 2: Apply the edit**

Replace `services/page.tsx:270-273` — swap the raw `<p>` for `<EmptyState>` using the same props shape as the siblings, keeping the existing copy verbatim ("Services coming soon — check back shortly." — split into the component's title/description as the siblings do). Add the `EmptyState` import to match.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 4: Flip the register row and commit**

Change A3's verdict to `fixed`.

```bash
git add "src/app/(site)/(marketing)/services/page.tsx" docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "fix(services): render the empty state through the shared EmptyState component"
```

---

### Task 12: D2 — gate the dead "Your booking" legend key

**Files:**

- Modify: `src/features/booking/_components/scheduler/legend.tsx:27-49`, `:63-82`
- Register: D2 row

The "Your booking" entry (`:44-48`) sits in the always-rendered static `ENTRIES` array, but its dot can only appear when `data.myBookings` is non-empty — never on the admin book-on-behalf flow, where `myBookings` is hardcoded empty. Gate it like the sibling `Premium day` entry (`:72-82`), which already conditionally renders on its data.

- [ ] **Step 1: Remove "Your booking" from the static `ENTRIES` array**

Delete the `{ label: "Your booking", swatchClass: "..." }` object from `ENTRIES` (`:44-48`). Keep its `swatchClass` string — you will reuse it in Step 2.

- [ ] **Step 2: Render it conditionally after the map**

After the `ENTRIES.map(...)` block and before (or beside) the `Premium day` conditional (`:72`), add:

```tsx
{
  data.myBookings && data.myBookings.size > 0 && (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn(
          "size-3 rounded-sm",
          "bg-status-available after:bg-brand relative after:absolute after:bottom-0.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:content-['']",
        )}
      />
      <span className="text-muted-foreground text-xs">Your booking</span>
    </li>
  );
}
```

- [ ] **Step 3: Verify the accessor exists**

Run: `grep -n "myBookings" src/features/booking/scheduler-context.tsx`
Expected: `:47  myBookings?: Set<string>;` — the optional-chained `data.myBookings?.size` guard is correct.

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Flip the register row and commit**

Change D2's verdict to `fixed`.

```bash
git add src/features/booking/_components/scheduler/legend.tsx docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "fix(scheduler): hide the own-booking legend key when no own bookings can render"
```

---

### Task 13: K3 + K4 — FieldGroup titles carry the optional suffix

**Files:**

- Modify: `src/features/accounts/_components/profile-fields.tsx:41-44` (interface), `:95`, `:130`, `:383` (render)
- Reference: `src/components/ui/form-field.tsx:121-128` (the optional-suffix markup to mirror)
- Register: K3, K4 rows

The two group titles hand-type "(optional)". FormField renders a muted "optional" suffix from an `optional` prop; teach `FieldGroup` the same, then drop the manual suffix.

- [ ] **Step 1: Add `optional` to the `FieldGroup` interface**

Replace `profile-fields.tsx:41-44`:

```ts
interface FieldGroup {
  title: string;
  optional?: boolean;
  fields: FieldSpec[];
}
```

- [ ] **Step 2: Render the suffix in `FieldGroupBlock`**

Replace the `<Eyebrow>` line at `:383`:

```tsx
<Eyebrow id={headingId}>
  {group.title}
  {group.optional ? (
    <span className="text-muted-foreground ml-1.5 text-xs font-normal">
      optional
    </span>
  ) : null}
</Eyebrow>
```

- [ ] **Step 3: Drop the manual "(optional)" from the two titles**

At `:95`: `title: "Additional owners",` and add `optional: true,` to that group object.
At `:130`: `title: "Second emergency contact",` and add `optional: true,` to that group object.

- [ ] **Step 4: Verify no manual "(optional)" remains in group titles**

Run: `grep -n "(optional)" src/features/accounts/_components/profile-fields.tsx`
Expected: no match.

- [ ] **Step 5: Typecheck + lint + scoped test**

Run: `npm run typecheck && npm run lint && npx vitest run src/features/accounts/_components/profile-fields.test.ts`
Expected: clean; existing profile-fields test still passes (update it if it asserts the old literal title — grep first).

- [ ] **Step 6: Flip the register rows and commit**

Change K3 and K4 verdicts to `fixed`.

```bash
git add src/features/accounts/_components/profile-fields.tsx docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "fix(account): route FieldGroup optional labeling through the shared convention"
```

---

## SP3 — Copy claims the code does not perform (decision-gated)

### Task 14: K5 — ZIP message matches the ZIP+4 regex

**Files:**

- Modify: `src/features/accounts/profile-schema.ts:18-21`
- Test: `src/features/accounts/profile-schema.test.ts` (create)
- Register: K5 row

**Decision (settled, maintainer may override):** fix the message, not the regex. The regex `^\d{5}(-\d{4})?$` correctly accepts both ZIP and ZIP+4; ZIP+4 is a valid US postal code, so narrowing the regex would reject legitimate input. Only the "5-digit" wording is wrong.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/accounts/profile-schema.test.ts
import { describe, expect, it } from "vitest";
import { profileSchema } from "./profile-schema";

const base = {
  full_name: "Alex Barba",
  phone: "555-123-4567",
  address: "1 Main St",
};

describe("profileSchema zip", () => {
  it("accepts a plain 5-digit ZIP", () => {
    expect(profileSchema.safeParse({ ...base, zip: "80301" }).success).toBe(
      true,
    );
  });

  it("accepts a ZIP+4", () => {
    expect(
      profileSchema.safeParse({ ...base, zip: "80301-1234" }).success,
    ).toBe(true);
  });

  it("rejects a malformed ZIP with a message that does not claim 5 digits only", () => {
    const res = profileSchema.safeParse({ ...base, zip: "abc" });
    expect(res.success).toBe(false);
    if (res.success) throw new Error("expected failure");
    const msg = res.error.issues.find((i) => i.path[0] === "zip")?.message;
    expect(msg).toBe("Enter a valid ZIP code");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/accounts/profile-schema.test.ts`
Expected: FAIL on the third case — message is still "Enter a valid 5-digit ZIP code".

- [ ] **Step 3: Apply the edit**

Replace `profile-schema.ts:21`'s message:

```ts
    .regex(/^\d{5}(-\d{4})?$/, "Enter a valid ZIP code"),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/accounts/profile-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Check for other assertions of the old string**

Run: `grep -rln "5-digit ZIP" src --include=*.test.ts --include=*.test.tsx --include=*.ts --include=*.tsx`
Expected: only the schema (now changed). If a test asserts the old text, update it in this commit.

- [ ] **Step 6: Flip the register row and commit**

Change K5's verdict to `fixed`.

```bash
git add src/features/accounts/profile-schema.ts src/features/accounts/profile-schema.test.ts docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "fix(account): match the ZIP validation message to the regex that accepts ZIP+4"
```

---

### Task 15: G3 — "and notified" claim (surface the decision first)

**Files:**

- Modify: `src/app/(site)/(admin)/admin/bookings/_components/bookings-calendar-client.tsx:538`
- Register: G3 row

**This task is decision-gated.** Before editing, present the decision to the maintainer and wait:

> G3: the cancel-confirm dialog says "The client is refunded in full and notified." The refund is real (admin cancel forces `fullRefund: true`). The notification is NOT — `booking_cancelled` is deliberately absent from the notifier vocabulary and no cancel path constructs a `Notifier`. **Caveat:** a Stripe dashboard setting _could_ email the client on refund independently of the app, invisible from code — please confirm whether that is configured. Two options: **(a) drop "and notified."** from the copy (default, if no independent email is confirmed), or **(b) build a `booking_cancelled` notification** so the claim becomes true (larger — new notifier event + wiring + tests).

- [ ] **Step 1: Get the maintainer's decision (and the Stripe-dashboard fact).**

- [ ] **Step 2a (if drop the claim):** Replace `bookings-calendar-client.tsx:538`:

```tsx
      description: "The client is refunded in full.",
```

Verify: `npm run typecheck`. Grep for any test asserting the old string (`grep -rln "refunded in full and notified" src --include=*.test.tsx`) and update it if present.

- [ ] **Step 2b (if build the notification):** Out of this plan's mechanical scope — spin a small sub-plan (new `booking_cancelled` `NotificationEvent`, wire it into the admin cancel path in `actions.ts:136`, `ResendNotifier`, and its email template under the emails file — note `emails.ts` is otherwise out of bounds, so this is a deliberate scoped exception the maintainer authorized by choosing (b)). Keep the copy as-is once the notification exists.

- [ ] **Step 3: Flip the register row and commit**

Change G3's verdict to `fixed` (or `built (<commit>)` if 2b).

```bash
git add "src/app/(site)/(admin)/admin/bookings/_components/bookings-calendar-client.tsx" docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "fix(admin): correct the cancel-confirm notification claim"   # adjust subject to the chosen option
```

---

## Close-out

### Task 16: Backfill register hashes, route copy-sync items, final gate

**Files:**

- Modify: `docs/content/voice/copy-register.md`
- Modify: `.superpowers/sdd/progress.md` (ledger close block)

- [ ] **Step 1: Confirm every engineering/component row is `fixed`.**

Run: `grep -nE "route:engineering|route:component" docs/content/voice/copy-register.md`
Expected: no matches (all flipped). Optionally append each fix commit's short hash to its row for traceability.

- [ ] **Step 2: Route the copy-sync items to Cal.** These are NOT source edits:
  - Surface A1 (`layout.tsx:35`) and A2 (`(marketing)/page.tsx:93`) meta descriptions to the maintainer/Cal directly (no drafts doc exists).
  - Confirm F3 (`term-descriptions.ts:19`) remains recorded in `docs/content/pricing-language-drafts.md` awaiting Cal — do not edit source.

- [ ] **Step 3: Full verification gate.**

Run: `npm run typecheck && npm run lint && node scripts/check-doc-links.mjs`
Expected: all clean. (Do NOT run bare `npm test`.)

- [ ] **Step 4: Write the ledger close block** in `.superpowers/sdd/progress.md` summarizing commits, the G3 decision taken, and the copy-sync hand-off. Commit:

```bash
git add docs/content/voice/copy-register.md .superpowers/sdd/progress.md
node scripts/check-doc-links.mjs
git commit -m "docs: close out the copy-cleanup engineering follow-up"
```

---

## Self-review

**Spec coverage:** SP1 → Tasks 1–4 (F4, F1, F2, C1). SP2 → Tasks 5–10 (G1, G2, G4, G5, G6, G7 + lint rule). SP4 → Tasks 11–13 (A3, D2, K3, K4). SP3 → Tasks 14–15 (K5, G3). Copy-sync (A1, A2, F3) → Task 16 Step 2 (routed, not edited). Every register `route:engineering` and `route:component` row maps to a task.

**Nearby-class hunt:** the register enumerated the extra branches (G5:139, G6's 8 branches, G7:107/125); those exact lines are in Tasks 7–9. The planned lint rule (Task 10) was dropped after a repo-wide sweep for `${…kind}` interpolation found no unguarded survivors beyond those tasks' targets (`service-edit-form.tsx:122` is already guarded); regression prevention is code review plus that completed sweep.

**Placeholder note:** Task 7 Step 1 contains one honest placeholder (`{ kind: "duplicate_email" }`) because the existing duplicate-email branch's return shape must be read from source rather than guessed — the step says so explicitly and scopes the change to the generic branch only.

**Ordering:** Tasks are independent (Task 10 is removed). Task 16 (close-out) runs last. Task 15 (G3) is decision-gated and can be deferred without blocking others.

---

_Last reviewed: 2026-07-23_
