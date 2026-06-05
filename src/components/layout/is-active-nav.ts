/** Active-nav matcher: exact route match, trailing-slash-insensitive. */
export function isActiveNav(pathname: string, href: string): boolean {
  const norm = (p: string) =>
    p !== "/" && p.endsWith("/") ? p.slice(0, -1) : p;
  return norm(pathname) === norm(href);
}
