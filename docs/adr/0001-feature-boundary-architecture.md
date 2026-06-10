# ADR-0001: Feature-boundary architecture with enforced public APIs

## Context

`src/features/<domain>/` folders were flat with no public/private distinction. Cross-feature imports reached internal files (accounts→booking internals, admin→booking/payments/pricing internals; booking↔pricing coupled through internals). Boundaries eroded silently because nothing enforced them (finding A3).

## Decision

Each feature exposes its public surface via `src/features/<domain>/index.ts`. Cross-feature imports resolve only through that index. Enforced with `eslint-plugin-boundaries` `entry-point` rule (feature elements: allow `index.ts` only), wired into the lint gate. Within a feature, files import each other freely. Feature→feature cycles are permitted by the allow-list where they already exist (e.g. booking↔admin via the scheduler); breaking cycles is out of scope for SP3a (behavior-preserving) and noted for later.

## Consequences

- Refactors inside a feature can't break external consumers as long as `index.ts` is stable.
- A new cross-feature dependency is a deliberate act (add the export to `index.ts`).
- Initial cost: authoring index files + rewriting cross-feature imports to them.
