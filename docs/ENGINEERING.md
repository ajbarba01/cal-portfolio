# Engineering Principles

> CORE doc — project-agnostic; project facts live in docs/DESIGN.md.

> Authority for **how code is structured and what "good" means** in this repo. Read before writing or refactoring any non-trivial code. For formatting/naming/docs see [CODE_STYLE.md](CODE_STYLE.md); for the dev loop see [WORKFLOW.md](WORKFLOW.md); for UI/design see [FRONTEND.md](FRONTEND.md).

Project is small today, must stay **professional, modular, scalable** so it grows without rewrites. Scope does not lower the bar. Each principle below is a **rule + why + example**. When a principle is violated, fix root cause or surface it (see _Critical Findings_) — never silently work around it.

---

## Architecture

### 1. Feature-first organization

`app/` is **routing only**. Domain logic lives in `features/<domain>/` (e.g. `orders/`, `accounts/`, `pricing/`, `gallery/`). New concept = new feature folder. **No catch-all `utils/`** — code lives with the thing it serves.

- **Why:** domain boundaries make codebase navigable, parallel-workable, refactor-safe as it grows.
- **Example:** order availability logic → `features/orders/`, not scattered across `app/` route files.

### 2. Generic vs app-specific split

Business-agnostic, reusable infra lives in `lib/`, must contain **zero** knowledge of business domain. Anything knowing the app's entities or business rules lives in its feature.

- **Why:** `lib/` stays portable + trivially testable; domain churn never leaks into shared infra.
- **Example:** `lib/haversine.ts` (pure math, reusable anywhere) vs a `features/<domain>/` module that knows the business rules using it.
- **Check:** grep `lib/` for any business-domain term → should be empty.

### 3. One-way dependency direction

Dependencies flow **components → hooks → services → data/adapters**, never the reverse. Lower layers never import upward.

- **Why:** one-way flow is predictable, testable, prevents circular tangles (Feature-Sliced Design / layered architecture).
- **Example:** `OrderForm` component calls `useOrder()`, which calls `orderService`, which calls data adapter. Adapter knows nothing about the form.

### 4. Isolate external vendors behind adapters

Every third-party dependency — payment provider, email provider, geocoding/distance, even database queries — sits behind a thin, typed interface owned by its feature. App code depends on the interface, not the vendor SDK.

- **Why:** swapping or upgrading a vendor is a one-module change, not an app-wide hunt. Serves the goal of swapping pieces with minimal effort.
- **Example:** a `features/<domain>/` module exposes `estimate(input)`; underlying provider can change while every caller stays untouched.

### 5. Pure core logic, isolated from IO

Core domain calculations and any state machine are **pure functions** over typed inputs — no DB calls, no `fetch`, no clock reads inside them. IO happens at the edges, passes data in.

- **Why:** pure logic is unit-testable without mocks, reusable on server or client, and the part most likely to contain real bugs — so most worth isolating and testing.
- **Example:** pure `calculate(inputs)` returns a result; route handler fetches inputs and calls it.

---

## Code quality

### 6. Single responsibility, small composable units

Each function/component does one thing. Break deep JSX into smaller components.

- **Why:** small units are readable, reusable, independently testable.

### 7. Typed boundaries everywhere

TypeScript `strict`, no `any`. **Validate + parse external data at the edges** — API responses, DB rows, form input, env vars — with a schema (Zod). Shared types live in one place, imported, never re-declared.

- **Why:** types catch errors at compile time; runtime validation at the boundary means rest of app trusts its data.
- **Example:** parse a form payload with a Zod schema in the server action; downstream code receives a typed, validated object.

### 8. No stringly-typed patterns; named constants for magic numbers

No string keys where a union/enum fits. Reused or non-obvious numbers get a named constant.

- **Example:** `type Status = 'pending' | 'confirmed'`, not loose strings. Reused or non-obvious number becomes a named, commented constant, not a bare literal.

- **Why:** premature abstraction is harder to undo than duplication; modular boundaries (above) already make later extraction cheap.

### 9. DRY by ownership

Each piece of state has **one** owner; no two systems write the same data, no parallel implementations of the same responsibility.

- **Example:** a derived value is computed by one service; multiple views read from it — none re-derive independently.

### 10. Error handling discipline

Handle **expected** absence explicitly (no selection, optional field, not-yet-loaded). For **invariants that should always hold**, fail loud — throw or surface — rather than silently swallowing. When a defensive guard exists for a real race or load-order case, comment **why** so the next reader doesn't promote it to a hard error or delete it.

- **Why:** silent catches hide bugs; loud failures on broken invariants get fixed.

### 11. Events/callbacks over polling; no prop-drilling

Prefer reactive data flow (server actions, realtime subscriptions, context) over polling. Don't thread props through many layers — lift state or use context.

### 12. Production-ready or surfaced

No dead or commented-out code, no leftover `console.log`, no naked `TODO` without a tracked follow-up. If temporary, say why and where it's tracked.

---

## Agent behavior

These govern how an AI agent works in this repo.

- **Read first, ground claims in inspection.** Inspect relevant code before proposing changes; no speculation presented as fact.
- **Surface root cause — Critical Findings.** On discovering any of the following, list it under a **Critical Findings** heading in your response _before_ proceeding; do not silently work around it or delete it to "clean up":
  - architectural violation (e.g. domain concepts leaking into `lib/`),
  - hidden coupling (cross-feature reads bypassing the service layer, deep relative imports),
  - duplicated responsibility (two systems owning the same state),
  - temporary logic becoming permanent (magic numbers without constants, stubs in shipping paths, untracked `TODO`).
- **Communicate high-level changes** after edits — what changed and why, briefly.
- **Bias:** root-cause fixes over shortcuts. Industry-standard, modular, scalable, neat. Production-ready or surfaced as a finding.

---

_Last reviewed: 2026-06-10_
