import {
  Briefcase,
  CalendarCheck,
  CalendarDays,
  FileText,
  LayoutDashboard,
  MessageSquare,
  PawPrint,
  Settings,
  Star,
  UserRound,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  activeSections?: string[];
};
export type ZoneNav = { zoneLabel: string; items: NavItem[] };

/** Zone nav icons keyed by item href. Single source for AppSidebar (desktop rail) and the mobile drawer. */
export const NAV_ICONS: Record<string, LucideIcon> = {
  "/admin": LayoutDashboard,
  "/admin/availability": CalendarDays,
  "/admin/bookings": CalendarCheck,
  "/admin/clients": Users,
  "/admin/inquiries": MessageSquare,
  "/admin/reviews": Star,
  "/admin/services": Briefcase,
  "/admin/settings": Settings,

  "/account": UserRound,
  "/account/pets": PawPrint,
  "/account/forms": FileText,
  "/account/bookings": CalendarCheck,
  "/account/inquiries": MessageSquare,
};

/** Keyed by item href. Passed down from a server layout; omitted in account/marketing zones. */
export type NavBadges = Record<string, { count: number; label: string }>;

export const accountNav: ZoneNav = {
  zoneLabel: "Account",
  items: [
    { href: "/account", label: "Profile" },
    { href: "/account/pets", label: "Pets" },
    { href: "/account/forms", label: "Forms" },
    { href: "/account/bookings", label: "Bookings" },
    { href: "/account/inquiries", label: "Inquiries" },
  ],
};

export const adminNav: ZoneNav = {
  zoneLabel: "Admin",
  items: [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/availability", label: "Availability" },
    { href: "/admin/bookings", label: "Bookings" },
    { href: "/admin/clients", label: "Clients" },
    { href: "/admin/services", label: "Services" },
    { href: "/admin/settings", label: "Settings" },
    { href: "/admin/reviews", label: "Reviews" },
    { href: "/admin/inquiries", label: "Inquiries" },
  ],
};
