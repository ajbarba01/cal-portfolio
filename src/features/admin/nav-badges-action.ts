"use server";

import { navBadgesFor, type NavBadgeMap } from "./attention-counts";
import { getAttentionCounts } from "./attention-counts-query";

/**
 * The admin nav badges for the caller. Both shells read them here — the
 * server-rendered sidebar through the admin layout, the client-resolved header
 * as a server action — so the counts and their labels stay in one place.
 *
 * Safe by construction: the counts behind it are zero for anyone who is not an
 * admin, so a non-admin caller of this action learns nothing.
 */
export async function fetchAttentionCounts(): Promise<NavBadgeMap> {
  return navBadgesFor(await getAttentionCounts());
}
