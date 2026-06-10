// Client-safe public API of the payments feature.
//
// Why this exists (see docs/adr/0002-client-server-entry-points.md):
// `index.ts` re-exports `StripeGateway` from `stripe-gateway`, which does
// `import "server-only"`. A `"use client"` file importing the barrel drags
// that side-effect into the browser bundle and breaks `npm run build`.
//
// This client entry re-exports ONLY the client-safe surface. It EXCLUDES the
// non-action server-only `StripeGateway`. `createPrepayIntent` is a
// `"use server"` action (RPC-safe from client).
export type { PaymentGateway } from "./types";
export * from "./client-balance";
export { applyStripeEvent } from "./webhook-core";
export { createPrepayIntent } from "./create-intent";
