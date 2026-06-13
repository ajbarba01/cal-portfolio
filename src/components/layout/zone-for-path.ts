import { accountNav, adminNav, type ZoneNav } from "./nav-config";

/**
 * Pick the zone nav for a pathname. Used by the mobile drawer in the persistent
 * header, which can no longer receive a zone prop from a per-zone layout (the
 * header lives above the zones now) and instead derives the zone client-side.
 */
export function zoneNavForPath(pathname: string): ZoneNav | undefined {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return adminNav;
  if (pathname === "/account" || pathname.startsWith("/account/"))
    return accountNav;
  return undefined;
}
