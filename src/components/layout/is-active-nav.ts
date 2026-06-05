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
