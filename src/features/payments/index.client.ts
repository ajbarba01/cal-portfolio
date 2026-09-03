// Client-safe public API of the payments feature.
//
// Why this exists (see docs/adr/0002-client-server-entry-points.md):
// `index.ts` re-exports `StripeGateway` from `stripe-gateway`, which does
// `import "server-only"`. A `"use client"` file importing the barrel drags
// that side-effect into the browser bundle and breaks `npm run build`.
//
// This client entry re-exports ONLY the client-safe surface. It EXCLUDES the
// non-action server-only `StripeGateway` and `applyStripeEvent`, the webhook
// writer that takes a service-role client. `createPrepayIntent` is a
// `"use server"` action (RPC-safe from client). `client-balance` is admin-side
// reporting math with no client caller — server code takes it from `index.ts`.
export type { PaymentGateway, PaymentTxn } from "./types";
export type { RefundAllocation } from "./projection";
// Pure projections (no IO) — safe for client surfaces.
export { sums, netPaid, amountOwedCents, planRefunds } from "./projection";
export { createPrepayIntent } from "./create-intent";
// Pure display helpers (no server-only) — safe for client surfaces.
export {
  paymentPill,
  retainedHalfLabel,
  disputeLabel,
  type BookingPaymentStatus,
} from "./payment-display";
