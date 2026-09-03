"use client";

/**
 * AccountMenu — the header control for signed-in users: a profile disc showing
 * the user's initials, linking to /account, over a panel listing every account
 * section plus Sign out. The disc, caret, hover bridge and panel chrome all come
 * from {@link HeaderMenu}; this component supplies only the identity and rows.
 */

import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isActiveNav,
  isActiveSection,
} from "@/components/layout/is-active-nav";
import { HeaderMenu, HeaderMenuLink } from "@/components/layout/header-menu";
import { accountNav, NAV_ICONS } from "@/components/layout/nav-config";
import { SignOutButton } from "@/components/sign-out-button";
import { focusRing } from "@/components/ui/control-variants";

/** Initials for the disc: first+last of the name, else the email's first char. */
function initialsOf(name: string | null, email: string | null): string {
  const trimmed = name?.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
    return (first + last).toUpperCase();
  }
  if (email) return email.charAt(0).toUpperCase();
  return "?";
}

export function AccountMenu({
  fullName,
  email,
}: {
  fullName: string | null;
  email: string | null;
}) {
  const pathname = usePathname();
  const initials = initialsOf(fullName, email);

  return (
    <HeaderMenu
      href="/account"
      triggerLabel={fullName ? `Account — ${fullName}` : "Account"}
      navLabel="Account"
      current={isActiveSection(pathname, "/account")}
      disc={initials}
      crestAvatar={initials}
      crestTitle={fullName?.trim() || "Your account"}
      crestSubtitle={email}
    >
      {accountNav.items.map(({ href, label }) => {
        const active = isActiveNav(pathname, href);
        return (
          <HeaderMenuLink
            key={href}
            href={href}
            icon={NAV_ICONS[href]}
            emphasized={active}
            current={active}
          >
            {label}
          </HeaderMenuLink>
        );
      })}
      <SignOutButton
        className={cn(
          "text-destructive-warm hover:bg-destructive-warm/10 border-border mt-1.5 flex w-full items-center gap-3 border-t px-4 py-2.5 text-sm transition-colors",
          focusRing,
          "focus-visible:-outline-offset-2",
        )}
      >
        <LogOut className="size-4 shrink-0" aria-hidden />
        Sign out
      </SignOutButton>
    </HeaderMenu>
  );
}
