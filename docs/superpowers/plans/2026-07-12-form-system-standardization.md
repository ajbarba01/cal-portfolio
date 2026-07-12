# Form System Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt react-hook-form + zod resolvers behind a thin layer in the component system, then migrate every text form to it — killing the clear-on-error bug class and unifying validation UX site-wide.

**Architecture:** A form layer in `src/components/form/` (`useAppForm` hook, `Form`/`FormRootError` components, `submitAction` server-error mapper) plus an RHF mode on the existing base-ui `FormField`. Client-side zod validation (same schemas the server parses) prevents error round-trips; RHF-owned state survives any that happen. Server stays validation authority via one shared `FormActionResult` contract. Spec: `docs/superpowers/specs/2026-07-12-form-system-design.md`.

**Tech Stack:** react-hook-form 7.x, `@hookform/resolvers` 5.x (`zodResolver`, Zod 4 compatible — the repo is on zod ^4.4), base-ui Field, vitest + @testing-library/react + jsdom (all already installed).

## Global Constraints

- TypeScript `strict`, no `any`.
- Commit messages: subject line only, Conventional Commits, no body/trailers, no internal identifiers.
- Work on `main`; stage files by name; commit only after verification (pre-commit hook runs eslint+prettier+typecheck).
- Design tokens only — no hardcoded colors; existing classes (`text-destructive` etc.) are already tokenized.
- Same-commit doc rule: COMPONENT_SYSTEM.md updates land in the same commit as the primitive they describe.
- `FIELD_LIMITS` stays the single client/server length authority — never inline a max.
- Required/optional convention (site-wide): **required is the default; optional fields get a muted "optional" label suffix. No asterisks.** Remove per-form `*` and "(optional)" strings as forms migrate.
- Validation mode: `onTouched` everywhere. Validation errors render inline at the field; form-level errors render via `FormRootError`; never as a toast.
- RTL tests run in the existing vitest jsdom environment. Component test files live next to the component. Run scoped tests with `npx vitest run <path>`; per repo policy do NOT gate on full `vitest run` (integration tests need the local Supabase stack).
- Unmigrated by design: booking quantity/scheduler forms, filter Multiswitches, one-click mutation buttons, the admin service editor + settings state machines (conventions only — Task 12).

---

## File structure

New:

- `src/lib/form-action-result.ts` — shared server-action result contract (business-agnostic infra → `src/lib/`).
- `src/components/form/use-app-form.ts` — `useAppForm(schema, options)`.
- `src/components/form/form.tsx` — `Form`, `FormRootError`.
- `src/components/form/submit-action.ts` — server-error mapper.
- `src/components/form/index.ts` — barrel.
- `src/components/form/form.test.tsx`, `src/components/ui/form-field.test.tsx` — layer tests.

Modified (layer): `src/components/ui/form-field.tsx`, `docs/COMPONENT_SYSTEM.md`, showcase page.
Modified (migrations): listed per task.

---

### Task 1: Install deps + `FormActionResult` contract + `useAppForm`

**Files:**

- Modify: `package.json` (via npm install)
- Create: `src/lib/form-action-result.ts`
- Create: `src/components/form/use-app-form.ts`
- Create: `src/components/form/index.ts`
- Test: `src/components/form/use-app-form.test.tsx`

**Interfaces:**

- Produces: `FormActionResult` = `{ ok: true } | { ok: false; fieldErrors?: Record<string, string>; message?: string }`; `useAppForm(schema, options?)` returning RHF's `UseFormReturn` typed from the schema (mode `onTouched`, zodResolver preset). Later tasks import both from `@/components/form` and `@/lib/form-action-result`.

- [ ] **Step 1: Install dependencies**

```bash
npm install react-hook-form @hookform/resolvers
```

Expected: both land in `dependencies`; `npx tsc --noEmit` still passes.

- [ ] **Step 2: Write the contract**

Create `src/lib/form-action-result.ts`:

```ts
/**
 * The one server-action result contract for form submits. Server actions
 * validate with the same zod schema the client resolver uses, so
 * `fieldErrors` keys are the form's field names. `message` carries a
 * form-level (root) error. Success payloads that need data (e.g. created
 * ids) extend this shape in their own feature types.
 */
export type FormActionResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Record<string, string>; message?: string };

/** Flatten a zod error into first-message-per-field, ready for setError. */
export function zodFieldErrors(error: {
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>;
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".");
    if (key && !(key in out)) out[key] = issue.message;
  }
  return out;
}
```

- [ ] **Step 3: Write the failing hook test**

Create `src/components/form/use-app-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { z } from "zod";
import { useAppForm } from "./use-app-form";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
});

describe("useAppForm", () => {
  it("validates with the zod schema and reports field errors", async () => {
    const { result } = renderHook(() =>
      useAppForm(schema, { defaultValues: { name: "" } }),
    );
    await act(async () => {
      await result.current.trigger();
    });
    expect(result.current.formState.errors.name?.message).toBe(
      "Name is required",
    );
  });

  it("parses valid values through the schema on submit", async () => {
    const { result } = renderHook(() =>
      useAppForm(schema, { defaultValues: { name: "Kiche" } }),
    );
    let submitted: unknown;
    await act(async () => {
      await result.current.handleSubmit((v) => {
        submitted = v;
      })();
    });
    expect(submitted).toEqual({ name: "Kiche" });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/components/form/use-app-form.test.tsx`
Expected: FAIL — cannot resolve `./use-app-form`.

- [ ] **Step 5: Implement `useAppForm`**

Create `src/components/form/use-app-form.ts`:

```ts
"use client";

import {
  useForm,
  type UseFormProps,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

/**
 * The app's `useForm` preset: zod resolver from the given schema and
 * `onTouched` validation (validate on blur; live re-validate once a field
 * has errored; everything validates on submit). RHF's full API is returned
 * unhidden — this exists so every form starts from the same defaults, not
 * to wrap RHF away.
 */
export function useAppForm<TSchema extends z.ZodType>(
  schema: TSchema,
  options?: Omit<UseFormProps<z.infer<TSchema>>, "resolver" | "mode">,
): UseFormReturn<z.infer<TSchema>> {
  return useForm<z.infer<TSchema>>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    ...options,
  });
}
```

Create `src/components/form/index.ts`:

```ts
export { useAppForm } from "./use-app-form";
```

If `zodResolver`'s generics fight zod v4's input/output split on some schema (`.trim()` chains are fine; transforms are not used in these form schemas), the sanctioned fallback is `standardSchemaResolver` from `@hookform/resolvers/standard-schema` — same call shape.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/components/form/use-app-form.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/form-action-result.ts src/components/form
git commit -m "feat(forms): add react-hook-form layer foundation"
```

---

### Task 2: `Form`, `FormRootError`, `submitAction`

**Files:**

- Create: `src/components/form/form.tsx`
- Create: `src/components/form/submit-action.ts`
- Modify: `src/components/form/index.ts`
- Test: `src/components/form/form.test.tsx`

**Interfaces:**

- Consumes: `useAppForm` (Task 1), `FormActionResult` (Task 1), existing `Alert` (`@/components/ui/alert`, props `variant="error"` + children).
- Produces:
  - `<Form form={form} onSubmit={fn} className?>{children}</Form>` — FormProvider + `<form noValidate>`; `onSubmit` receives parsed values.
  - `<FormRootError />` — renders `formState.errors.root` as an error `Alert`; place it above the submit row.
  - `submitAction(form, action, opts?)` → `(values) => Promise<void>` where `action: (values: TValues) => Promise<FormActionResult>` and `opts?: { onSuccess?: () => void | Promise<void> }`. Maps `fieldErrors` → per-field `setError` (type `"server"`) + `setFocus` on the first; `message`/bare failure → `setError("root", …)`. Does NOT catch rejections — a server action `redirect()` must propagate.

- [ ] **Step 1: Write the failing tests**

Create `src/components/form/form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { z } from "zod";
import { useAppForm } from "./use-app-form";
import { Form, FormRootError } from "./form";
import { submitAction } from "./submit-action";
import type { FormActionResult } from "@/lib/form-action-result";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
});

function Harness({
  action,
  onSuccess,
}: {
  action: (v: { name: string }) => Promise<FormActionResult>;
  onSuccess?: () => void;
}) {
  const form = useAppForm(schema, { defaultValues: { name: "" } });
  return (
    <Form form={form} onSubmit={submitAction(form, action, { onSuccess })}>
      <input aria-label="Name" {...form.register("name")} />
      <FormRootError />
      <button type="submit">Save</button>
    </Form>
  );
}

describe("Form + submitAction", () => {
  it("maps server fieldErrors onto fields and focuses the first", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      fieldErrors: { name: "Taken" },
    } satisfies FormActionResult);
    const user = userEvent.setup();
    render(<Harness action={action} />);
    await user.type(screen.getByLabelText("Name"), "Kiche");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveFocus());
    // typed value survives the server error — the tester's bug class
    expect(screen.getByLabelText("Name")).toHaveValue("Kiche");
  });

  it("renders a message as the root error via FormRootError", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      message: "Something broke",
    } satisfies FormActionResult);
    const user = userEvent.setup();
    render(<Harness action={action} />);
    await user.type(screen.getByLabelText("Name"), "Kiche");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Something broke")).toBeInTheDocument();
  });

  it("calls onSuccess when the action succeeds", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<Harness action={action} onSuccess={onSuccess} />);
    await user.type(screen.getByLabelText("Name"), "Kiche");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });

  it("never calls the action when client validation fails", async () => {
    const action = vi.fn();
    const user = userEvent.setup();
    render(<Harness action={action} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });
});
```

If `@testing-library/user-event` is not yet a devDependency, install it in this step: `npm install -D @testing-library/user-event`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/form/form.test.tsx`
Expected: FAIL — cannot resolve `./form` / `./submit-action`.

- [ ] **Step 3: Implement**

Create `src/components/form/form.tsx`:

```tsx
"use client";

import * as React from "react";
import {
  FormProvider,
  useFormContext,
  useFormState,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form";
import { Alert } from "@/components/ui/alert";

/**
 * FormProvider + the <form> element in one: every migrated form renders
 * exactly this shell. `noValidate` keeps browser validation bubbles off —
 * zod (via useAppForm) is the validator; base-ui Field renders the errors.
 */
export function Form<TValues extends FieldValues>({
  form,
  onSubmit,
  className,
  children,
}: {
  form: UseFormReturn<TValues>;
  onSubmit: (values: TValues) => void | Promise<void>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className={className}
      >
        {children}
      </form>
    </FormProvider>
  );
}

/**
 * The form-level (root) error slot — place it above the submit row. Renders
 * nothing until submitAction (or the form itself) sets errors.root.
 */
export function FormRootError() {
  const { control } = useFormContext();
  const { errors } = useFormState({ control });
  const message = errors.root?.message;
  if (!message) return null;
  return (
    <Alert variant="error" role="alert">
      {message}
    </Alert>
  );
}
```

Check `src/components/ui/alert.tsx` for the actual prop name/values of its variant (`error` vs `destructive`) and the correct children shape before wiring — use whatever the Alert primitive really exposes.

Create `src/components/form/submit-action.ts`:

```ts
"use client";

import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import type { FormActionResult } from "@/lib/form-action-result";

/**
 * Bridge an RHF form to a server action that returns FormActionResult.
 * - fieldErrors → per-field setError (type "server") + focus the first
 * - message (or a bare failure) → errors.root, rendered by FormRootError
 * - success → opts.onSuccess
 * Rejections are NOT caught: a server action that redirect()s throws
 * NEXT_REDIRECT, which must propagate to the Next.js runtime.
 */
export function submitAction<TValues extends FieldValues>(
  form: UseFormReturn<TValues>,
  action: (values: TValues) => Promise<FormActionResult>,
  opts?: { onSuccess?: () => void | Promise<void> },
): (values: TValues) => Promise<void> {
  return async (values) => {
    const result = await action(values);
    if (result.ok) {
      await opts?.onSuccess?.();
      return;
    }
    const entries = Object.entries(result.fieldErrors ?? {});
    for (const [name, message] of entries) {
      form.setError(name as Path<TValues>, { type: "server", message });
    }
    if (entries.length > 0) {
      form.setFocus(entries[0][0] as Path<TValues>);
    }
    if (result.message || entries.length === 0) {
      form.setError("root", {
        type: "server",
        message: result.message ?? "Something went wrong. Please try again.",
      });
    }
  };
}
```

Update `src/components/form/index.ts`:

```ts
export { useAppForm } from "./use-app-form";
export { Form, FormRootError } from "./form";
export { submitAction } from "./submit-action";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/form/form.test.tsx src/components/form/use-app-form.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/form package.json package-lock.json
git commit -m "feat(forms): add Form shell and server-error mapping"
```

---

### Task 3: `FormField` RHF mode + required/optional convention

**Files:**

- Modify: `src/components/ui/form-field.tsx`
- Test: `src/components/ui/form-field.test.tsx`
- Modify: `docs/COMPONENT_SYSTEM.md` (same commit — registry rows for the form family + convention)

**Interfaces:**

- Consumes: RHF context from `<Form>` (Task 2).
- Produces (backward compatible — every existing call site keeps working):
  - Existing controlled mode: `error?: React.ReactNode` + input props/`children`, unchanged.
  - New RHF mode: when rendered inside a `<Form>` **and** no `error`/`value`/`onChange` prop is given, the field self-wires via `useController({ name })`: value/onChange/onBlur/ref go to the Input, the field's error message comes from form state.
  - New `optional?: boolean` prop (both modes): renders a muted `optional` suffix after the label. Required is the unmarked default.

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/form-field.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { z } from "zod";
import { useAppForm, Form } from "@/components/form";
import { FormField } from "./form-field";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
});

function RhfHarness() {
  const form = useAppForm(schema, { defaultValues: { name: "" } });
  return (
    <Form form={form} onSubmit={() => {}}>
      <FormField label="Name" name="name" type="text" />
      <button type="submit">Save</button>
    </Form>
  );
}

describe("FormField", () => {
  it("controlled mode still renders a passed error", () => {
    render(<FormField label="Zip" name="zip" type="text" error="Bad zip" />);
    expect(screen.getByText("Bad zip")).toBeInTheDocument();
  });

  it("RHF mode wires value + validation from form context", async () => {
    const user = userEvent.setup();
    render(<RhfHarness />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "Kiche");
    expect(screen.getByLabelText("Name")).toHaveValue("Kiche");
    // onTouched + errored → live re-validation clears the message
    expect(screen.queryByText("Name is required")).not.toBeInTheDocument();
  });

  it("renders the muted optional suffix", () => {
    render(<FormField label="Breed" name="breed" type="text" optional />);
    expect(screen.getByText("optional")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/ui/form-field.test.tsx`
Expected: FAIL — `optional` unknown prop / RHF mode not wired (error never appears).

- [ ] **Step 3: Implement**

Rewrite `src/components/ui/form-field.tsx`. Full file:

```tsx
"use client";

import * as React from "react";
import { Field } from "@base-ui/react/field";
import { useFormContext, useController } from "react-hook-form";

import { cn } from "@/lib/utils";
import { space } from "@/lib/design-tokens";
import { Input } from "@/components/ui/input";

type FormFieldBase = {
  label: React.ReactNode;
  name: string;
  hint?: React.ReactNode;
  /**
   * Controlled inline error. When provided, the field is marked invalid and the
   * message is shown via `Field.Error match={true}` so base-ui wires
   * `aria-describedby` correctly. Passing `error` (or `value`/`onChange`) keeps
   * the field in controlled mode even inside a <Form>.
   */
  error?: React.ReactNode;
  /**
   * Site-wide convention: required is the unmarked default; optional fields
   * carry a muted "optional" suffix. No asterisks anywhere.
   */
  optional?: boolean;
  className?: string;
};

// Either pass input props (rendered as a styled Input) OR a custom control via
// `children` — never both. The `children` branch forbids input props so they
// can't be silently dropped.
type FormFieldProps =
  | (FormFieldBase & { children: React.ReactNode } & {
      [K in keyof Omit<
        React.ComponentProps<typeof Input>,
        "name" | "children"
      >]?: never;
    })
  | (FormFieldBase & { children?: undefined } & Omit<
        React.ComponentProps<typeof Input>,
        "name"
      >);

export function FormField(props: FormFieldProps) {
  const {
    label,
    name,
    hint,
    error,
    optional,
    className,
    children,
    ...inputProps
  } = props as FormFieldBase & {
    children?: React.ReactNode;
  } & Omit<React.ComponentProps<typeof Input>, "name">;

  // RHF mode: inside a <Form> (FormProvider) with no controlled props, the
  // field self-wires via useController. Outside a provider — or when the
  // caller passes error/value/onChange — it behaves exactly as before.
  const formContext = useFormContext();
  const isControlled =
    error !== undefined ||
    "value" in props ||
    "onChange" in props ||
    children !== undefined;
  const rhf = formContext !== null && !isControlled;

  return rhf ? (
    <RhfFormField
      label={label}
      name={name}
      hint={hint}
      optional={optional}
      className={className}
      inputProps={inputProps}
    />
  ) : (
    <PlainFormField
      label={label}
      name={name}
      hint={hint}
      error={error}
      optional={optional}
      className={className}
      inputProps={inputProps}
    >
      {children}
    </PlainFormField>
  );
}

function FieldShell({
  name,
  label,
  hint,
  optional,
  invalid,
  errorMessage,
  className,
  children,
}: {
  name: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  optional?: boolean;
  invalid: boolean;
  errorMessage?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // `invalid` tells Field.Root the field is in error state; base-ui then sets
    // aria-invalid on the linked control and aria-describedby to the Field.Error id.
    <Field.Root
      name={name}
      invalid={invalid}
      className={cn("flex flex-col", space.field, className)}
    >
      <Field.Label className="text-sm leading-none font-medium">
        {label}
        {optional ? (
          <span className="text-muted-foreground ml-1.5 text-xs font-normal">
            optional
          </span>
        ) : null}
      </Field.Label>

      {children}

      {hint ? (
        <Field.Description className="text-muted-foreground text-xs">
          {hint}
        </Field.Description>
      ) : null}

      {/* match={true} forces Field.Error visible for a controlled error string,
          ensuring the element gets an id that base-ui links via aria-describedby. */}
      {errorMessage ? (
        <Field.Error match={true} className="text-destructive text-sm">
          {errorMessage}
        </Field.Error>
      ) : null}
    </Field.Root>
  );
}

function RhfFormField({
  label,
  name,
  hint,
  optional,
  className,
  inputProps,
}: {
  label: React.ReactNode;
  name: string;
  hint?: React.ReactNode;
  optional?: boolean;
  className?: string;
  inputProps: Omit<React.ComponentProps<typeof Input>, "name">;
}) {
  const { field, fieldState } = useController({ name });
  return (
    <FieldShell
      name={name}
      label={label}
      hint={hint}
      optional={optional}
      invalid={fieldState.invalid}
      errorMessage={fieldState.error?.message}
      className={className}
    >
      <Field.Control
        render={
          <Input
            {...inputProps}
            value={(field.value as string | undefined) ?? ""}
            onChange={field.onChange}
            onBlur={field.onBlur}
            ref={field.ref}
          />
        }
      />
    </FieldShell>
  );
}

function PlainFormField({
  label,
  name,
  hint,
  error,
  optional,
  className,
  inputProps,
  children,
}: {
  label: React.ReactNode;
  name: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  optional?: boolean;
  className?: string;
  inputProps: Omit<React.ComponentProps<typeof Input>, "name">;
  children?: React.ReactNode;
}) {
  return (
    <FieldShell
      name={name}
      label={label}
      hint={hint}
      optional={optional}
      invalid={Boolean(error)}
      errorMessage={error}
      className={className}
    >
      {/* A custom control passed via `children` is wired through Field.Control so
          base-ui links the label + aria-describedby; a bare element won't register
          otherwise. Plain Input fields use the default branch. */}
      {children ? (
        React.isValidElement(children) ? (
          <Field.Control render={children as React.ReactElement} />
        ) : (
          children
        )
      ) : (
        <Field.Control render={<Input {...inputProps} />} />
      )}
    </FieldShell>
  );
}
```

Note: `useFormContext()` returns `null` outside a provider — that's the mode switch. If the installed RHF version types it non-null, guard with a try-free null check (it does return null at runtime).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/ui/form-field.test.tsx src/components/form`
Expected: PASS. Also run `npx tsc --noEmit` — all existing FormField call sites must still typecheck.

- [ ] **Step 5: Register in COMPONENT_SYSTEM.md (same commit)**

In the registry table add rows:

```markdown
| RHF form shell | `Form` + `useAppForm` + `submitAction` | `src/components/form/` — zod resolver, `onTouched`, server-error mapping; see "Form recipe" |
| form-level (root) error | `FormRootError` | renders `errors.root` as an error Alert, above the submit row |
```

In the "Form recipe" section, replace the sentence about validation with: forms are RHF (`useAppForm` + `<Form>`); `FormField` self-wires inside a `<Form>`; required is the unmarked default and optional fields carry the muted `optional` suffix (no asterisks); form-level errors render via `FormRootError` above the submit row. Update the `_Last reviewed:_` footer date.

- [ ] **Step 6: Add the form family to /showcase**

Find the showcase route (`src/app/**/showcase/`). Add a "Form" section rendering a small `useAppForm` demo form: one required field, one optional field (shows the suffix), a field with a hint, a submit that always returns `{ ok: false, fieldErrors: … }` from a local stub — demonstrating inline errors + root error. Follow the existing section structure in that file.

- [ ] **Step 7: Verify + commit**

Run: `npx tsc --noEmit && npx vitest run src/components`
Expected: PASS.

```bash
git add src/components/ui/form-field.tsx src/components/ui/form-field.test.tsx docs/COMPONENT_SYSTEM.md src/app
git commit -m "feat(forms): RHF mode and optional-label convention in FormField"
```

---

### Task 4: Onboarding server action → `FormActionResult`

**Files:**

- Modify: `src/features/accounts/onboarding-form.ts`
- Modify: `src/features/accounts/onboarding-action.ts`
- Modify: `src/features/accounts/index.ts` (exports)
- Test: `src/features/accounts/onboarding-form.test.ts` (update), `src/features/accounts/onboarding-action.test.ts` (update)

**Interfaces:**

- Consumes: `FormActionResult`, `zodFieldErrors` (Task 1).
- Produces:
  - `onboardingClientSchema` — flat zod object = profile fields (`full_name`, `phone`, `address`, `zip`) + emergency fields (`contact_name`, `contact_phone`, `contact_relationship`, `vet_name`, `vet_phone`). Exported for the client resolver (Task 5).
  - `splitOnboardingInput(flat)` → `OnboardingInput` (`{ profile, emergency }`) — pure, unit-tested.
  - Server action `submitOnboarding(input: unknown, returnTo?: string): Promise<FormActionResult>` — auth-guards, re-parses with `onboardingClientSchema`, runs `runOnboarding`, `revalidatePath("/onboarding")`, then `redirect(onboardingSuccessPath(safeReturnTo(returnTo)))` (redirect throws — the success return type is never reached; type it `Promise<FormActionResult>` anyway for the failure paths).
- Deletes: `parseOnboardingForm`, `OnboardingFormState`, the old `completeOnboarding(prevState, formData)` signature (Task 5 removes its only caller — do the deletion here, wire the client in Task 5, commit both in their own tasks; typecheck stays green because Task 5's component is rewritten in the same task that flips the import… **ordering note:** to keep every commit green, in THIS task keep `completeOnboarding` exported as a deprecated alias that wraps the new action, and delete it in Task 5's commit).

- [ ] **Step 1: Write failing tests for the pure pieces**

In `src/features/accounts/onboarding-form.test.ts`, replace the `parseOnboardingForm` tests with:

```ts
import { describe, it, expect } from "vitest";
import {
  onboardingClientSchema,
  splitOnboardingInput,
} from "./onboarding-form";

const valid = {
  full_name: "Alex Client",
  phone: "3035551234",
  address: "1 Main St",
  zip: "80401",
  contact_name: "Sam Friend",
  contact_phone: "3035555678",
  contact_relationship: "Friend",
  vet_name: "Front Range Vet",
  vet_phone: "3035559999",
};

describe("onboardingClientSchema", () => {
  it("accepts a complete submission", () => {
    expect(onboardingClientSchema.safeParse(valid).success).toBe(true);
  });

  it("reports per-field messages for missing fields", () => {
    const r = onboardingClientSchema.safeParse({ ...valid, full_name: "" });
    expect(r.success).toBe(false);
  });
});

describe("splitOnboardingInput", () => {
  it("splits the flat form values into profile + emergency", () => {
    const input = splitOnboardingInput(valid);
    expect(input.profile).toEqual({
      full_name: "Alex Client",
      phone: "3035551234",
      address: "1 Main St",
      zip: "80401",
    });
    expect(input.emergency).toEqual({
      contact_name: "Sam Friend",
      contact_phone: "3035555678",
      contact_relationship: "Friend",
      vet_name: "Front Range Vet",
      vet_phone: "3035559999",
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/accounts/onboarding-form.test.ts`
Expected: FAIL — `onboardingClientSchema` not exported.

- [ ] **Step 3: Implement the pure module**

In `src/features/accounts/onboarding-form.ts`: keep `onboardingSuccessPath` and `OnboardingInput` as-is; delete `parseOnboardingForm` + `OnboardingFormState`; add:

```ts
import { z } from "zod";
import { profileSchema, type ProfileInput } from "./profile-schema";
import {
  emergencySchema,
  type EmergencyInput,
} from "@/features/accounts/emergency-schema";

/**
 * The onboarding form as the client sees it: one flat object (RHF field names
 * are flat), validated with the exact profile + emergency schemas the server
 * re-parses. Client and server cannot drift — same zod objects.
 */
export const onboardingClientSchema = z.object({
  ...profileSchema.shape,
  ...emergencySchema.shape,
});

export type OnboardingClientInput = z.infer<typeof onboardingClientSchema>;

/** Regroup the flat client values into the { profile, emergency } shape runOnboarding takes. */
export function splitOnboardingInput(
  flat: OnboardingClientInput,
): OnboardingInput {
  const { full_name, phone, address, zip, ...emergency } = flat;
  return {
    profile: { full_name, phone, address, zip } satisfies ProfileInput,
    emergency: emergency satisfies EmergencyInput,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/features/accounts/onboarding-form.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite the server action**

In `src/features/accounts/onboarding-action.ts`, keep `runOnboarding` untouched. Replace `completeOnboarding` with:

```ts
export async function submitOnboarding(
  input: unknown,
  returnTo?: string,
): Promise<FormActionResult> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const parsed = onboardingClientSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  }

  const serviceClient = createServiceClient();
  await runOnboarding(
    { serviceClient, userId: user.id, geocoder: defaultGeocoder },
    splitOnboardingInput(parsed.data),
  );

  // Purge the cached /onboarding payload (it still holds the info form) so the
  // redirect renders the wizard fresh at its new meet_greet_pending state.
  revalidatePath("/onboarding");
  redirect(onboardingSuccessPath(safeReturnTo(returnTo)));
}
```

Imports to add: `onboardingClientSchema`, `splitOnboardingInput` from `./onboarding-form`; `FormActionResult`, `zodFieldErrors` from `@/lib/form-action-result`. Update `src/features/accounts/index.ts` to export `submitOnboarding`, `onboardingClientSchema` and drop the removed names. Update `onboarding-action.test.ts` to call `submitOnboarding` with object input instead of building `FormData` — assertions on `runOnboarding` behavior stay identical.

- [ ] **Step 6: Typecheck + scoped tests**

Run: `npx tsc --noEmit` — expected: ONE error at `info-step.tsx` (still importing removed names). That's Task 5's file; to keep this commit green, temporarily keep a thin back-compat export as described in Interfaces, OR fold Task 5 into this commit if the alias feels sillier than just finishing the wire-up. Preferred: implement Task 5 before committing, as one commit. (Tasks 4+5 = one commit is acceptable; the review gate is the pair.)

---

### Task 5: Onboarding info-step → RHF (kills the clear-on-error bug)

**Files:**

- Modify: `src/app/(onboarding)/onboarding/_components/info-step.tsx`
- Test: `src/app/(onboarding)/onboarding/_components/info-step.test.tsx` (new)

**Interfaces:**

- Consumes: `useAppForm`, `Form`, `FormRootError`, `submitAction` (Tasks 1–2), RHF-mode `FormField` (Task 3), `submitOnboarding` + `onboardingClientSchema` (Task 4).

- [ ] **Step 1: Write the failing regression test**

Create `info-step.test.tsx` — the tester's exact bug as a guard. Mock the action module:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InfoStep } from "./info-step";

vi.mock("@/features/accounts", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/features/accounts")>();
  return {
    ...mod,
    submitOnboarding: vi
      .fn()
      .mockResolvedValue({ ok: false, message: "Server rejected it" }),
  };
});

describe("InfoStep", () => {
  it("keeps every typed value when the server returns an error", async () => {
    const user = userEvent.setup();
    render(<InfoStep />);
    await user.type(screen.getByLabelText("Full name"), "Alex Client");
    await user.type(screen.getByLabelText("Phone"), "3035551234");
    await user.type(screen.getByLabelText("Street address"), "1 Main St");
    await user.type(screen.getByLabelText("ZIP code"), "80401");
    await user.type(screen.getByLabelText("Contact name"), "Sam Friend");
    await user.type(screen.getByLabelText("Contact phone"), "3035555678");
    await user.type(screen.getByLabelText("Relationship"), "Friend");
    await user.type(screen.getByLabelText("Vet name or clinic"), "FR Vet");
    await user.type(screen.getByLabelText("Vet phone"), "3035559999");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText("Server rejected it")).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Alex Client");
    expect(screen.getByLabelText("ZIP code")).toHaveValue("80401");
    expect(screen.getByLabelText("Vet phone")).toHaveValue("3035559999");
  });

  it("blocks an incomplete submit client-side with inline errors", async () => {
    const user = userEvent.setup();
    render(<InfoStep />);
    await user.type(screen.getByLabelText("Full name"), "Alex Client");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(
      await screen.findByText("Phone number is required"),
    ).toBeInTheDocument();
    // the typed value is untouched
    expect(screen.getByLabelText("Full name")).toHaveValue("Alex Client");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run "src/app/(onboarding)/onboarding/_components/info-step.test.tsx"`
Expected: FAIL (component still on useActionState).

- [ ] **Step 3: Rewrite `info-step.tsx`**

```tsx
"use client";

import { submitOnboarding, onboardingClientSchema } from "@/features/accounts";
import {
  useAppForm,
  Form,
  FormRootError,
  submitAction,
} from "@/components/form";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { FIELD_LIMITS } from "@/lib/field-limits";

/**
 * Step 1 — profile + emergency info form. RHF + zod validate client-side, so
 * an invalid submit never round-trips (and never resets the form — the old
 * useActionState wiring lost all input on a server validation error). The
 * server re-parses the same schema; submitOnboarding redirects on success.
 */
export function InfoStep({ returnTo }: { returnTo?: string }) {
  const form = useAppForm(onboardingClientSchema, {
    defaultValues: {
      full_name: "",
      phone: "",
      address: "",
      zip: "",
      contact_name: "",
      contact_phone: "",
      contact_relationship: "",
      vet_name: "",
      vet_phone: "",
    },
  });
  const isPending = form.formState.isSubmitting;

  return (
    <Form
      form={form}
      onSubmit={submitAction(form, (values) =>
        submitOnboarding(values, returnTo),
      )}
      className="flex flex-col gap-5"
    >
      <FormSection title="Your profile">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Full name"
            name="full_name"
            type="text"
            autoComplete="name"
            maxLength={FIELD_LIMITS.name}
          />
          <FormField
            label="Phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={FIELD_LIMITS.phone}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Street address"
            name="address"
            type="text"
            autoComplete="street-address"
            maxLength={FIELD_LIMITS.addressLine}
          />
          <FormField
            label="ZIP code"
            name="zip"
            type="text"
            autoComplete="postal-code"
            inputMode="numeric"
            maxLength={10}
          />
        </div>
      </FormSection>

      <FormSection title="Emergency contact">
        <FormField
          label="Contact name"
          name="contact_name"
          type="text"
          maxLength={FIELD_LIMITS.name}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Contact phone"
            name="contact_phone"
            type="tel"
            maxLength={FIELD_LIMITS.phone}
          />
          <FormField
            label="Relationship"
            name="contact_relationship"
            type="text"
            placeholder="e.g. Parent, Spouse, Friend"
            maxLength={FIELD_LIMITS.relationship}
          />
        </div>
      </FormSection>

      <FormSection title="Veterinarian">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Vet name or clinic"
            name="vet_name"
            type="text"
            maxLength={FIELD_LIMITS.name}
          />
          <FormField
            label="Vet phone"
            name="vet_phone"
            type="tel"
            maxLength={FIELD_LIMITS.phone}
          />
        </div>
      </FormSection>

      <FormRootError />

      <Button
        type="submit"
        variant="brand"
        disabled={isPending}
        className="w-full"
      >
        {isPending ? "Saving…" : "Continue →"}
      </Button>
    </Form>
  );
}
```

Note the hidden `returnTo` input is gone — it rides as a plain argument now. Remove any now-dead back-compat alias left in Task 4.

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run "src/app/(onboarding)" src/features/accounts/onboarding-form.test.ts src/features/accounts/onboarding-action.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors anywhere.

- [ ] **Step 5: Commit (Tasks 4+5 together)**

```bash
git add src/features/accounts "src/app/(onboarding)"
git commit -m "feat(onboarding): validate client-side and preserve input on error"
```

---

### Task 6: Contact form → RHF

**Files:**

- Modify: `src/app/(site)/(marketing)/contact/_components/contact-form.tsx`
- Modify: `src/features/inquiries/inquiry-actions.ts` (only if `submitInquiry`'s result isn't already `{ ok }`-shaped — read it first; it returns `{ ok: true } | { ok: false; error }`, adapt inline in the component, no server change needed)
- Test: `src/app/(site)/(marketing)/contact/_components/contact-form.test.tsx` (new)

**Interfaces:**

- Consumes: form layer (Tasks 1–3), `submitInquirySchema` (`@/features/inquiries`), existing `submitInquiry`.
- Produces: nothing new — behavior contract: prefill never clobbers typed input; honeypot stays unregistered.

- [ ] **Step 1: Failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactForm } from "./contact-form";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  }),
}));
vi.mock("@/features/inquiries", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/features/inquiries")>();
  return {
    ...mod,
    submitInquiry: vi.fn().mockResolvedValue({ ok: false, error: "Nope" }),
  };
});

describe("ContactForm", () => {
  it("preserves input and shows the error on server failure", async () => {
    const user = userEvent.setup();
    render(<ContactForm heading="Contact" intro="hi" replyNote="soon" />);
    await user.type(screen.getByLabelText(/name/i), "Alex");
    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.type(screen.getByLabelText(/phone/i), "3035551234");
    await user.type(screen.getByLabelText(/message/i), "Hello Cal");
    await user.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByText("Nope")).toBeInTheDocument();
    expect(screen.getByLabelText(/message/i)).toHaveValue("Hello Cal");
  });

  it("blocks an empty submit client-side", async () => {
    const user = userEvent.setup();
    render(<ContactForm heading="Contact" intro="hi" replyNote="soon" />);
    await user.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
  });
});
```

Adjust label matchers to the component's actual labels after reading the render section of the current file (lines ~98-end) — the test must target real labels.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run "src/app/(site)/(marketing)/contact"`
Expected: FAIL.

- [ ] **Step 3: Rewrite the form logic**

Keep the component's success-card, prefill effect, and layout; replace the state plumbing:

- `const form = useAppForm(submitInquirySchema, { defaultValues: { name: "", email: "", phone: "", subject: "", message: "", company: "" } });`
- Prefill effect: after the profile fetch resolves, call `form.reset({ ...form.getValues(), name, email, phone })` **only if `!form.formState.isDirty`** — never clobber typing.
- Submit: `submitAction(form, async (values) => { const r = await submitInquiry(values); return r.ok ? { ok: true } : { ok: false, message: r.error }; }, { onSuccess: () => { setIsDone(true); toast.add({ type: "success", title: "Message sent", description: "Thanks - Cal will get back to you." }); } })`.
- Fields become RHF-mode `FormField`s (no `value`/`onChange`); the message `Textarea` stays a `children` control — wire it with `form.register("message")` spread onto the Textarea and pass `error={form.formState.errors.message?.message}` to its `FormField` (the children branch is controlled mode; explicit error prop is correct there). `CharCounter` reads `form.watch("message")`.
- Honeypot: `<input type="text" name="company" tabIndex={-1} autoComplete="off" className="hidden" {...form.register("company")} />` — registered is fine (it's part of the schema), still visually hidden.
- `subject` field gets `optional` (schema allows empty); every other visible field is required by schema — no indicators needed under the convention.
- Replace the old error `<p role="alert">` with `<FormRootError />` above the submit row; drop `useTransition`/`useState` for error/pending (use `form.formState.isSubmitting`).

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run "src/app/(site)/(marketing)/contact" && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(site)/(marketing)/contact"
git commit -m "feat(contact): client-side validation with preserved input"
```

---

### Task 7: Intake FormCards + ProfileFields → RHF

**Files:**

- Modify: `src/features/accounts/_components/profile-fields.tsx`
- Modify: `src/features/accounts/_components/form-card.tsx`
- Test: `src/features/accounts/_components/form-card.test.tsx` (new)

**Interfaces:**

- Consumes: form layer; `formRegistry[formKey].schema` becomes the card's resolver; existing injected `onSubmit(formKey, values, petId)` seam stays.
- Produces: `ProfileFields` renders RHF-mode fields (drops `values`/`onChange` props → takes nothing but `formKey`); `profileFieldNames(formKey)` unchanged (still drives default values).

- [ ] **Step 1: Failing test**

`form-card.test.tsx` — mount `FormCard` for `formKey="owner"` with a stubbed `onSubmit` returning `{ kind: "validation_error", message: "bad" }`; open the card, type into "Owner name", submit, assert the typed value survives and the message renders. Second test: submit with required fields empty → `onSubmit` never called, inline errors render. (Mirror the test structure from Task 5 — mock nothing but the injected prop, which needs no mocking.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/accounts/_components/form-card.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`profile-fields.tsx`:

- Keep the `FieldSpec[]` config and group rendering exactly as-is; change the leaf renderer: each spec emits an RHF-mode `FormField` (`name`, `label`, `hint`, `placeholder`, `type`, `maxLength: spec.max`) with `optional={!spec.required}`. Multiline specs keep the `children` Textarea branch: `<FormField label={…} name={…} optional={!spec.required} error={errors[name]?.message}><Textarea rows={3} maxLength={spec.max} {...register(name)} /></FormField>` using `useFormContext()` inside the component. Delete the `values`/`onChange` props and the required/optional text-label helper (the convention lives in FormField now).
- `FieldValues` type stays exported (form-card still uses it for the submit payload).

`form-card.tsx`:

- Replace the values-bag with `useAppForm(formRegistry[formKey].schema, { defaultValues: initialValues(formKey, existing) })` — note the registry schema is `ZodSchema` (untyped); type the form as `Record<string, string>` via a local cast, which is honest to what these dynamic cards are.
- Submit: `submitAction(form, async (values) => { const r = await onSubmit(formKey, values as FieldValues, petId); return r.kind === "success" ? { ok: true } : { ok: false, message: r.message }; }, { onSuccess })` where `onSuccess` runs the existing e-sign acceptance + `setSubmitted(true); setOpen(false); onSaved?.()` sequence. The e-sign fields (`authChecked`, `authName`) stay local state (they're not part of the registry schema — YAGNI on schema surgery); the pre-submit guard check moves inside the action callback returning `{ ok: false, message: … }`.
- `EmergencyFields` (legacy): convert the same way as ProfileFields (RHF-mode fields, no values/onChange props).
- Replace the error `<p role="alert">` with `<FormRootError />`; pending comes from `form.formState.isSubmitting`.
- On `open` toggling to true with `status === "stale"`, call `form.reset(initialValues(formKey, existing))` so a reopened card shows fresh server values.

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/features/accounts && npx tsc --noEmit`
Expected: PASS — including the existing accounts unit tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts
git commit -m "feat(accounts): intake profile cards validate client-side"
```

---

### Task 8: Account profile + password forms

**Files:**

- Modify: `src/app/(site)/(account)/account/_components/profile-form.tsx`
- Modify: `src/app/(site)/(account)/account/_components/password-form.tsx`
- Test: `src/app/(site)/(account)/account/_components/account-forms.test.tsx` (new, covers both)

**Interfaces:**

- Consumes: form layer; `profileSchema` (`@/features/accounts`); `updateProfile`, `changePassword` actions (existing `ActionResult` results — adapt inline like Task 6).
- Produces: `passwordFormSchema` local to `password-form.tsx`:

```ts
const passwordFormSchema = z
  .object({
    new_password: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(FIELD_LIMITS.password),
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    message: "Passwords don't match.",
    path: ["confirm_password"],
  });
```

- [ ] **Step 1: Failing tests** — for profile: server failure preserves edited values + shows message (mock `@/features/accounts`'s `updateProfile`). For password: mismatched confirm never calls `changePassword` and shows "Passwords don't match." inline at the confirm field.

- [ ] **Step 2: Run to verify failure** — `npx vitest run "src/app/(site)/(account)/account/_components/account-forms.test.tsx"`.

- [ ] **Step 3: Implement** — same conversion recipe as Task 6:

- `profile-form.tsx`: `useAppForm(profileSchema, { defaultValues: initialValues })`; fields → RHF-mode; keep the success "Saved" indicator driven by a local `saved` boolean set in `onSuccess` (clear it in a `form.watch` subscription or on next submit); `FormRootError` above the submit row.
- `password-form.tsx`: `useAppForm(passwordFormSchema, …)`; submit adapts `changePassword(values.new_password)`; on success `form.reset()` + saved indicator. The mismatch check deletes entirely — the schema owns it now.

- [ ] **Step 4: Run + typecheck** — expected PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(site)/(account)/account/_components"
git commit -m "feat(account): profile and password forms on the RHF layer"
```

---

### Task 9: Pet form

**Files:**

- Modify: `src/features/accounts/_components/pet-form.tsx`
- Test: `src/features/accounts/_components/pet-form.test.tsx` (new)

**Interfaces:**

- Consumes: form layer; existing `PetInput` type + injected `PetFormActions` seam (unchanged).
- Produces: local `petFormSchema`:

```ts
const petFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(FIELD_LIMITS.name),
  species: z.enum(["dog", "cat"]),
  breed: z.string().max(FIELD_LIMITS.shortText).optional().or(z.literal("")),
  notes: z.string().max(FIELD_LIMITS.note).optional().or(z.literal("")),
  birthdate: z.string().optional().or(z.literal("")),
});
```

(Species stays the dog/cat enum — the species-model expansion is Group B, not this pass.)

- [ ] **Step 1: Failing test** — server failure on create preserves name/notes + shows message; empty name blocks client-side, action not called. Mock the injected `actions` prop (no module mocking needed).

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — conversion recipe; specifics:

- `species` RadioGroup and `PhotoCropField` stay custom controls: species via `useController({ name: "species" })` (`field.value`/`field.onChange`), photo stays local `useState` (not a form value).
- `name` loses its `"Name *"` label → `label="Name"` (required unmarked); `breed`, `birthdate`, `notes`, photo get `optional`.
- Notes textarea: children-branch `FormField` + `register("notes")` + `CharCounter` on `form.watch("notes")` (same pattern as Task 6's message field).
- The post-save photo-upload sequence stays inside the action callback; any upload failure returns `{ ok: false, message }` so it lands in `FormRootError`.

- [ ] **Step 4: Run + typecheck** — also re-run `npx vitest run src/features/accounts` (FormCard shares the folder).

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/_components/pet-form.tsx src/features/accounts/_components/pet-form.test.tsx
git commit -m "feat(accounts): pet form on the RHF layer"
```

---

### Task 10: Review form + claim form

**Files:**

- Modify: `src/app/(site)/(marketing)/reviews/_components/review-form.tsx`
- Modify: `src/app/(auth)/claim/_components/claim-form.tsx`
- Test: `src/app/(site)/(marketing)/reviews/_components/review-form.test.tsx`, `src/app/(auth)/claim/_components/claim-form.test.tsx` (new)

**Interfaces:**

- Consumes: form layer; `submitReview` (`@/features/reviews`, returns `{ ok } | { ok: false; error }`), `claimAccount` (`@/features/accounts/index.client`, returns `kind`-style result).
- Produces: local schemas:

```ts
// review-form.tsx
const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z
    .string()
    .trim()
    .min(1, "Write a few words first")
    .max(FIELD_LIMITS.note),
});

// claim-form.tsx
const claimSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });
```

- [ ] **Step 1: Failing tests** — review: server failure preserves body text; empty body blocks client-side (replaces the current disabled-button heuristic). Claim: mismatch shows inline at confirm, `claimAccount` not called; `kind: "unauthenticated"` result renders the expired-link message as root error. Mock `@/lib/supabase/client` for the review form's auth gate (return a signed-in session).

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — conversion recipe; specifics:

- Review: `rating` via `useController` feeding `StarRatingInput` (unchanged component); body = children-branch Textarea + CharCounter; drop the `disabled={body.trim().length === 0}` gate (validation owns it — button only disables while submitting); auth gate + success card stay.
- Claim: fields become RHF-mode `FormField`s (this form used raw `Label`+`Input` — switching to `FormField` also standardizes its look); result mapping: `success` → existing router push/refresh in `onSuccess`; every failure `kind` maps to `{ ok: false, message }`.

- [ ] **Step 4: Run + typecheck** — expected PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(site)/(marketing)/reviews/_components" "src/app/(auth)/claim"
git commit -m "feat(forms): review and claim forms on the RHF layer"
```

---

### Task 11: Admin new-client form

**Files:**

- Modify: `src/app/(site)/(admin)/admin/clients/new/_components/new-client-form.tsx`
- Test: `src/app/(site)/(admin)/admin/clients/new/_components/new-client-form.test.tsx` (new)

**Interfaces:**

- Consumes: form layer; `createUnclaimedClient` (`@/features/admin`) — result kinds `success | email_exists | validation_error | forbidden | error`.
- Produces: local schema:

```ts
const newClientSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Full name is required")
    .max(FIELD_LIMITS.name),
  email: z.string().trim().email("Enter a valid email").max(FIELD_LIMITS.email),
  phone: z.string().max(FIELD_LIMITS.phone).optional().or(z.literal("")),
  address: z
    .string()
    .max(FIELD_LIMITS.addressLine)
    .optional()
    .or(z.literal("")),
  zip: z.string().max(FIELD_LIMITS.zip).optional().or(z.literal("")),
});
```

- [ ] **Step 1: Failing test** — `email_exists` result renders its message and preserves typed values (mock `@/features/admin`); empty email blocks client-side.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — conversion recipe; specifics: raw `Label`+`Input` pairs become `FormField`s (`phone`/`zip`/`address` get `optional`, their "(optional)" label strings deleted); the status `Select` stays local `useState` (structured control, passed into the action alongside form values); `email_exists` maps to `{ ok: false, fieldErrors: { email: … } }` — the message lands on the email field; `forbidden`/`error`/`validation_error` map to root message; success keeps toast + router push in `onSuccess`.

- [ ] **Step 4: Run + typecheck** — expected PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(site)/(admin)/admin/clients/new"
git commit -m "feat(admin): new-client form on the RHF layer"
```

---

### Task 12: Conventions pass on service editor + settings (no RHF)

**Files:**

- Modify: `src/app/(site)/(admin)/admin/services/_components/service-edit-form.tsx`
- Modify: `src/app/(site)/(admin)/admin/settings/_components/settings-client.tsx`

Per spec these structured config editors keep their state machines. Bounded changes only:

- [ ] **Step 1: Root errors → Alert.** In both files, replace bare `<p role="alert" className="text-destructive text-sm">…</p>` form-level error renders (`errors._form` in the service editor; the equivalent in settings — read the file first) with the `Alert` error variant (import from `@/components/ui/alert`), matching what `FormRootError` renders. Per-field error strings stay as they are.

- [ ] **Step 2: Optional-label convention.** Audit both files' text-field labels: any "(optional)" strings or `*` markers move to the convention (most of these editors' fields are required config — expect few or no changes; the audit is the deliverable).

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit && npx vitest run src/features/admin src/features/pricing`
Expected: PASS (these features' unit tests cover the editors' validation logic, which is untouched).

```bash
git add "src/app/(site)/(admin)/admin/services" "src/app/(site)/(admin)/admin/settings"
git commit -m "refactor(admin): align config editors with form error conventions"
```

---

### Task 13: Sweep, docs, live verify

- [ ] **Step 1: Indicator sweep.** `rg -n '\(optional\)|required \*|\*"' src/` and `rg -n '"\w+ \*"' src/` — any remaining hand-rolled required/optional markers in migrated surfaces move to the convention. `rg -n 'role="alert"' src/` — remaining bare error `<p>`s in migrated forms should be gone (unmigrated booking/scheduler surfaces may keep theirs).

- [ ] **Step 2: Full scoped test run + typecheck.**

Run: `npx tsc --noEmit && npx vitest run src/components src/features/accounts "src/app"`
Expected: PASS.

- [ ] **Step 3: Live verify (superpowers:verification-before-completion).** Start the dev stack; drive in a real browser:

1. Onboarding: fill partially → submit → inline errors, **all typed values intact**; complete → advances to meet-and-greet step.
2. Contact (signed out): empty submit blocked inline; valid submit → success card + toast.
3. Contact (signed in): prefill appears; type into message first, confirm prefill doesn't clobber it.
4. An intake card (owner) and the pet form: server-error path if reproducible, otherwise validate-and-save.
5. Mobile width (≤390px): repeat onboarding error path — error visibility + focus behavior.

- [ ] **Step 4: Docs.** Confirm COMPONENT*SYSTEM.md changes from Task 3 still describe reality; update `docs/DEV_NOTES.md` only if the maintainer asks. Update the spec's `\_Last reviewed:*` footer if anything drifted during implementation.

- [ ] **Step 5: Final commit (if the sweep changed anything)**

```bash
git add -u
git commit -m "chore(forms): finish required-indicator and error-display sweep"
```

---

## Self-review notes

- **Spec coverage:** layer (Tasks 1–3), required/optional convention (Task 3 + sweeps), onboarding bug-by-construction (Tasks 4–5), FormCard/ProfileFields (7), contact incl. prefill/honeypot rules (6), account forms (8–10), admin (11–12), showcase + COMPONENT_SYSTEM registration (3), testing incl. per-form persistence regression tests (each migration task) and live verify (13). Covered.
- **Contract consistency:** `FormActionResult` and `zodFieldErrors` defined once (Task 1); `submitAction` result-adaptation pattern (`kind`/`ok` → `FormActionResult`) is repeated per task with each feature's real result type — intentional, the server contracts are not rewritten (spec: "converges in type shape, not substance"; full convergence would touch every action's tests for no user-visible gain).
- **Green-commit ordering:** Task 4's action rewrite orphans `info-step.tsx`; resolved by committing 4+5 together (noted in both tasks).
- **Risk flags for implementers:** `useFormContext()` null-detection outside a provider (Task 3 note); zod v4 + resolver generics (Task 1 fallback noted); base-ui `Field.Control render` needs the ref forwarded — the existing `Input` already forwards refs (it's used with Field.Control today).
