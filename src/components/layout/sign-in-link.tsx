"use client";

/**
 * SignInLink — the signed-out counterpart to AccountMenu, sharing its exact
 * shape through {@link HeaderMenu}: a clay-soft profile disc (a person glyph
 * instead of initials) with the proximity caret, over a panel offering "Sign in"
 * and "Create account".
 *
 * The disc links straight to /login, carrying returnTo so the user lands back on
 * the page they came from.
 *
 * Rendered by HeaderAuth (an async server component that cannot call hooks) for
 * signed-out visitors. The mobile drawer handles sign-in inline.
 */

import { usePathname } from "next/navigation";
import { LogIn, UserPlus, UserRound } from "lucide-react";
import { HeaderMenu, HeaderMenuLink } from "@/components/layout/header-menu";

export function SignInLink() {
  const pathname = usePathname();
  const loginHref =
    pathname && pathname !== "/"
      ? `/login?returnTo=${encodeURIComponent(pathname)}`
      : "/login";

  return (
    <HeaderMenu
      href={loginHref}
      triggerLabel="Sign in"
      navLabel="Sign in"
      disc={<UserRound className="size-5" aria-hidden />}
      crestAvatar={<UserRound className="size-7" aria-hidden />}
      crestTitle="Welcome"
      crestSubtitle="Sign in to manage your bookings"
    >
      <HeaderMenuLink href={loginHref} icon={LogIn} emphasized>
        Sign in
      </HeaderMenuLink>
      <HeaderMenuLink href="/signup" icon={UserPlus}>
        Create account
      </HeaderMenuLink>
    </HeaderMenu>
  );
}
