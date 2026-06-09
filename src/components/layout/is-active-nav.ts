import type { NavItem } from "./nav-config";

/** Active-nav matcher: exact route match, trailing-slash-insensitive. */
export function isActiveNav(pathname: string, href: string): boolean {
  const norm = (p: string) =>
    p !== "/" && p.endsWith("/") ? p.slice(0, -1) : p;
  return norm(pathname) === norm(href);
}

/** Section matcher: active for the href and any nested route under it (prefix-aware). */
export function isActiveSection(pathname: string, href: string): boolean {
  const norm = (p: string) =>
    p !== "/" && p.endsWith("/") ? p.slice(0, -1) : p;
  const a = norm(pathname);
  const b = norm(href);
  return a === b || a.startsWith(b + "/");
}

/**
 * Returns the href that should be highlighted for `pathname`, choosing the most
 * specific matching section. Returns null if no item matches.
 */
export function activeNavHref(
  pathname: string,
  hrefs: string[],
): string | null {
  const matches = hrefs.filter((href) => isActiveSection(pathname, href));
  if (matches.length === 0) return null;
  return matches.reduce((best, href) =>
    href.length > best.length ? href : best,
  );
}

/** Marketing-nav matcher: primary section plus any explicitly owned route sections. */
export function isActiveNavItem(pathname: string, item: NavItem): boolean {
  return [item.href, ...(item.activeSections ?? [])].some((section) =>
    isActiveSection(pathname, section),
  );
}

/** Current-page matcher: only the section linked by the nav item. */
export function isCurrentNavItem(pathname: string, item: NavItem): boolean {
  return isActiveSection(pathname, item.href);
}
