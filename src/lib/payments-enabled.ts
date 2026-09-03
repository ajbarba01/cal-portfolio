/**
 * Payments kill-switch: whether prepay is enabled sitewide, controlled by the
 * `NEXT_PUBLIC_PAYMENTS_ENABLED` env var. Defaults off — with it unset, the
 * prepay CTA is hidden everywhere, balances still display as owed, the admin
 * "Unpaid" pill stays, and the confirmation email drops its prepay sentence.
 *
 * `NEXT_PUBLIC_*` vars are inlined at build time by Next.js, so this module is
 * safe to import from client components, server actions, and route handlers —
 * it touches no Node API and carries no `server-only` marker.
 */

/**
 * True only for the exact literal `"true"`. Any other value — unset, `"false"`,
 * or a case variant like `"TRUE"` — is off, so a malformed env value fails
 * closed rather than silently enabling payments.
 */
export function isPaymentsEnabled(value: string | undefined): boolean {
  return value === "true";
}

/** Build-time snapshot of the kill-switch, evaluated once at module load. */
export const PAYMENTS_ENABLED = isPaymentsEnabled(
  process.env.NEXT_PUBLIC_PAYMENTS_ENABLED,
);
