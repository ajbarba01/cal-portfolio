/**
 * Whether automated emails (confirmations, reminders) may be sent to this
 * recipient. Unclaimed shadow accounts (Cal-created, not yet claimed) are
 * suppressed — Cal handles their comms manually until they claim. A null/absent
 * flag is treated as claimed so legacy rows notify normally.
 */
export function shouldNotify(recipient: {
  unclaimed: boolean | null;
}): boolean {
  return recipient.unclaimed !== true;
}
