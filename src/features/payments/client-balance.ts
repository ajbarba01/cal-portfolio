/** Outstanding-balance math for a client's debits. Pure (ENGINEERING #5). */

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
