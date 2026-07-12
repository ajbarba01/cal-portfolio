# Form system standardization — design (2026-07-12)

Group A of the tester-feedback action plan
([2026-07-12-tester-feedback-action-plan.md](2026-07-12-tester-feedback-action-plan.md)).
Adopt react-hook-form + zod resolvers behind a small RHF-aware layer in the
component system, then migrate every text form to it, worst-first.

## Problem

Every form hand-rolls its own state plumbing, so behavior differs per form:

- **Onboarding info-step** uses `useActionState` + server-only validation.
  React 19 auto-resets an uncontrolled `<form action>` after the action
  returns, so a validation error **wipes everything the user typed** — the
  tester's worst finding.
- **Intake FormCards** (owner / home / pet profiles) keep a controlled
  values-bag with `useTransition` and surface only a single form-level error
  string — no per-field errors.
- **Contact** reads `FormData` uncontrolled; required-field indication differs
  from other forms ("random ass indicator" feedback).
- Account, admin, review, claim forms each mix these patterns.

Root cause is architectural: no shared client-side validation or form-state
layer. Zod schemas already exist for every form (form registry, profile /
emergency / inquiry schemas) — they're just only enforced server-side.

## Decision

**react-hook-form + `@hookform/resolvers/zod`** behind a thin layer in the
component system. Client-side validation prevents the error round-trip;
RHF-owned state survives any round-trip that does happen. The server stays the
validation authority — both sides parse the _same_ zod schema, so they cannot
disagree in substance.

## The form layer (`src/components/form/`)

| Piece                           | What it is                                                                                                                                                                                                                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useAppForm(schema, options)`   | Thin wrapper over `useForm`: `zodResolver(schema)`, `mode: "onTouched"` (validate on blur, re-validate per keystroke once errored — industry standard), values typed from the schema. RHF's API stays exposed; no hiding.                                                                                 |
| `<Form>`                        | `FormProvider` + `<form noValidate onSubmit={handleSubmit(…)}>`. Renders the form-level (root) error as an `Alert` above the submit row — one place, every form.                                                                                                                                          |
| `FormField` (upgraded)          | The existing base-ui primitive gains an RHF mode: pass `name` alone and it reads error/touched state from form context (shadcn Controller pattern). The current controlled-`error` prop mode stays for non-RHF callers (booking steppers). Same base-ui aria wiring (`aria-invalid`, `aria-describedby`). |
| `submitAction(action, opts)`    | Submit helper: calls the server action with parsed values; maps `fieldErrors` → `setError` per field + focuses the first, `message` → root error, success → `onSuccess`.                                                                                                                                  |
| `FormActionResult` (`src/lib/`) | One shared server-action result contract: `{ ok: true } \| { ok: false; fieldErrors?: Record<string,string>; message?: string }`. Existing `ActionResult` / `OnboardingFormState` shapes converge on it.                                                                                                  |

### Required/optional convention (site-wide, rendered by the primitive)

**Required is the default; optional fields carry a muted "optional" suffix on
the label.** No asterisks. `FormField` renders it from an `optional` flag (RHF
mode derives it where the FieldSpec config provides it); individual forms never
hand-roll an indicator again.

### Unchanged

`FIELD_LIMITS` (client `maxLength` = server `.max()`, one constant),
`CharCounter`, `FormSection`, the form-on-card recipe in COMPONENT_SYSTEM.md.
New pieces are registered in COMPONENT_SYSTEM.md and `/showcase` (form family
section) in the same commit — same-commit doc rule.

### Dependencies

`react-hook-form`, `@hookform/resolvers`. First new runtime deps this pass;
both are zero-dependency and tree-shakeable.

## Migration (worst-first)

1. **Onboarding info-step** — drop `useActionState`; RHF + client-side zod
   means an invalid submit never round-trips, and RHF state survives when one
   does. Kills the clear-on-error bug **by construction**. The pure
   `parseOnboardingForm` stays server-side; its result maps to
   `FormActionResult`.
2. **Intake FormCards + ProfileFields** — keep the `FieldSpec[]` config
   renderer (it's the right shape); it emits RHF-mode `FormField`s instead of
   the controlled values-bag. The registry zod schema becomes the card's
   resolver. `required` flags drive the optional-suffix convention. The owner
   e-sign block joins the same form state (checkbox + typed name become
   fields).
3. **Contact** — RHF + the inquiry schema. Signed-in prefill becomes
   `form.reset(profileValues)` after the browser-side session fetch, applied
   only while the form is untouched so it never clobbers typing. The honeypot
   `company` field stays a plain unregistered input.
4. **Account** — profile form, password form, pet form, review form, claim
   form.
5. **Admin** — new-client form migrates fully. The service editor and
   settings panel are structured config editors (client-side validation and
   per-field error maps already; stepper/switch-dominated) — the same class as
   the booking forms, so they keep their state machines and only adopt the
   shared conventions: root error rendered as an `Alert`, optional-label
   convention on text fields. (The service editor's requires-approval/duration
   validation quirk is Group E scope; unchanged here.)

**Not migrated:** booking quantity forms + scheduler (structured state
machines, no free text), filter Multiswitches, one-click mutation buttons
(resolve, moderate, prepay, availability toggles).

## Testing

- **Unit:** `submitAction` mapping (fieldErrors → per-field `setError` +
  focus; message → root; success → callback). Required/optional label
  rendering in both FormField modes.
- **RTL, one per migrated form:** submit invalid → typed values persist,
  inline errors render, focus moves to first error. This is the regression
  class the tester found; it gets a permanent guard.
- **Server-action tests unchanged** — the server contract only converges in
  type shape, not substance.
- **Live verify:** drive onboarding and contact end-to-end (error path, then
  success path) in the running app.

## Risks / notes

- `FormField`'s dual mode (controlled `error` prop vs RHF context) must stay
  mutually exclusive and obvious — enforced by prop types, mirrored from the
  existing input-props/children exclusivity pattern.
- The intake cards submit through an injected `onSubmit` (account vs
  admin-on-behalf); the RHF migration keeps that injection seam.
- Contact page must stay static (no server cookie read) — prefill remains a
  browser-side fetch.
- Mobile parity: error summary/focus behavior verified at mobile widths; no
  desktop-only affordances.

---

_Last reviewed: 2026-07-12_
