/** Outstanding-balance math for a client's debits. Pure (ENGINEERING #5).
 *
 * AUDIT NOTE (owing system): this sum is the ADMIN-side reporting projection.
 * The booking DEBT GATE is separate — it lives in the create/quote path
 * (`booking-service-shared` reads `getOutstandingDebtCents` and returns
 * `blocked_debt` on any unsettled balance; admin `skipDebtGate` downgrades it
 * to a warning) and in the series-roll cron. So a client with unsettled debt
 * IS blocked from booking by current design; that is correct — only genuine
 * unsettled debt blocks. Settled AND waived debits both drop out of the sum
 * (settled_at non-null); `resolution` records which. The no-show fix
 * (net-of-paid) and admin waive/adjust exist partly to keep this gate from
 * wrongly blocking on spurious or disputed debt.
 */

export interface DebitLike {
  amount_cents: number;
  settled_at: string | null;
}

/** Sum of unsettled debit amounts (cents). Unsettled = settled_at is null. */
export function outstandingBalanceCents(debits: DebitLike[]): number {
  return debits.reduce(
    (sum, debit) =>
      debit.settled_at === null ? sum + debit.amount_cents : sum,
    0,
  );
}
