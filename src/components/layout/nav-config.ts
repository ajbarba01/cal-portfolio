export type NavItem = {
  href: string;
  label: string;
  activeSections?: string[];
};
export type ZoneNav = { zoneLabel: string; items: NavItem[] };

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
