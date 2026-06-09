const NON_TERMINAL = new Set(["pending_approval", "confirmed"]);

export interface MeetGreetBookingRow {
  client_id: string;
  starts_at: string;
  status: string;
}

/**
 * Pure: returns the set of client ids that have an upcoming (future, non-terminal)
 * meet-and-greet booking. Used to decide whether the admin's "Approve" needs the
 * pre-visit confirmation.
 */
export function deriveMeetGreetUpcoming(
  rows: MeetGreetBookingRow[],
  now: Date,
): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    if (NON_TERMINAL.has(r.status) && new Date(r.starts_at) > now) {
      out.add(r.client_id);
    }
  }
  return out;
}
