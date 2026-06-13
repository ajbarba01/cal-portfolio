"use server";

import type { AttentionCounts } from "./attention-counts";
import { getAttentionCounts } from "./attention-counts-query";

/**
 * Server action exposing admin attention counts to the client-resolved header
 * (the mobile drawer badges). Safe by construction: `getAttentionCounts` is built
 * from admin-gated list actions, so a non-admin caller resolves to zeros rather
 * than any leaked data. Desktop sidebar badges remain server-rendered in the
 * dynamic admin zone — this is only for the now-client-side header.
 */
export async function fetchAttentionCounts(): Promise<AttentionCounts> {
  return getAttentionCounts();
}
