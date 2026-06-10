# ADR-0002: Client-safe feature entry points

Refines [ADR-0001](0001-feature-boundary-architecture.md) (feature-boundary architecture). ADR-0001's decision stands; this ADR adds a second permitted entry point to it.

## Context

ADR-0001 gave each feature a single public barrel `src/features/<domain>/index.ts` and routed all cross-feature imports (including from `"use client"` components) through it. Some barrels statically re-export non-action modules that do `import "server-only"` (an un-tree-shakeable side-effect) — e.g. `booking/booking-form-data`, `payments/stripe-gateway`, and modules pulling `lib/supabase/service`.

When a `"use client"` file imports such a barrel — even only for a client-safe symbol — the bundler drags `server-only` into the browser bundle and `npm run build` (Turbopack) fails with "You're importing a module that depends on 'server-only' … cannot be imported from a Client Component". A Next.js **server action** module (`"use server"`) is exempt: it becomes an RPC reference and is never bundled. The poison is only a barrel statically re-exporting a **non-action** server-only module.

## Decision

A feature MAY expose a second entry point `src/features/<domain>/index.client.ts` alongside `index.ts`. The client entry re-exports only the client-safe subset of the feature's surface — client components, hooks, pure types/utils, and `"use server"` action functions — and EXCLUDES non-action server-only modules (data loaders, repo/gateway factories, mailers, anything pulling `supabase/service` outside a `"use server"` action).

Routing rule:

- `"use client"` files import from `@/features/<domain>/index.client`.
- Server code (files without `"use client"`) imports from `@/features/<domain>` (the full `index.ts`), unchanged.

Both `index.ts` and `index.client.ts` are permitted feature entry points in the `eslint-plugin-boundaries` `entry-point` rule (`allow: ["index.ts", "index.client.ts"]`). Create a client entry only for features whose barrel is actually imported by a `"use client"` file AND re-exports a non-action server-only module (YAGNI — no empty client entries).

## Consequences

- Client bundles are build-safe: server-only side effects can no longer leak into the browser through a feature barrel.
- The boundary seam from ADR-0001 is preserved — cross-feature imports still resolve through a sanctioned entry point, now one of two.
- Minor duplication: the client-safe export list is maintained in both entries. Drift is caught by `npm run build` (a leaked server-only import fails the client build) and `npm run typecheck`.
