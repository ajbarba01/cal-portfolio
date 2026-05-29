# Code Style

> Authority for **formatting, naming, and documentation conventions**. Read before writing any code. For architecture/quality principles see [ENGINEERING.md](ENGINEERING.md). Most of this is enforced by tooling — when in doubt, run the tools.

Sourced from the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html), the [community TypeScript Style Guide](https://mkosir.github.io/typescript-style-guide/), [React + TypeScript conventions](https://react-typescript-style-guide.com/), and [TSDoc](https://tsdoc.org/).

---

## Tooling (the source of truth for formatting)

- **Prettier** formats; **ESLint** lints; **`tsc --strict`** type-checks. A pre-commit hook runs all three — code that fails any of them does not get committed.
- Line length ~100. Don't hand-format around the formatter; let Prettier own whitespace.

## Naming

- `camelCase` — variables, functions, methods, props.
- `PascalCase` — types, interfaces, enums, React components. **No `I` prefix** on interfaces (`BookingRequest`, not `IBookingRequest`).
- `UPPER_CASE` — true global constants.
- **Booleans** read as predicates: prefix `is` / `has` / `should` (`isAvailable`, `hasPaid`).
- Descriptive and unabbreviated. No `tmp`, `data2`, or project-ambiguous shorthand.

## Files & folders

- Component file name matches its folder: `ProfileHero/ProfileHero.tsx`.
- Non-component files: `kebab-case.ts` (`distance.ts`, `use-booking.ts`).
- One primary export per file; the file is named for it.

## Components

- One responsibility per component. Break deep JSX into smaller named components rather than nesting.
- Feature-specific UI is co-located with its feature; only cross-cutting widgets live in a shared `components/`.
- Props are typed; no `any`. Prefer explicit prop types over inline object types when reused.

## Documentation (TSDoc)

- Use `/** … */` TSDoc on **exported functions, components, and public APIs**.
- `@param` / `@returns` **only when they add information** beyond the name and type — don't restate the signature.
- Comments explain **WHY**, never restate **WHAT**. If the code needs a comment to explain what it does, prefer clearer code.
- Never reference the current task, phase, or PR in a comment (it rots). No commented-out code, no leftover `console.log`, no naked `TODO` (track it).

```ts
/** Estimate straight-line miles between two points, scaled to approximate road distance. */
export function estimateRoadMiles(from: LatLng, to: LatLng): number { … }
```

## Imports

- Order: external packages → internal aliases (`@/features/...`, `@/lib/...`) → relative.
- Use path aliases; avoid deep relative chains (`../../../`).
- No unused imports (ESLint enforces).

---

_Last reviewed: 2026-05-29_
