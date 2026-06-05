export type NavItem = { href: string; label: string };
export type ZoneNav = { zoneLabel: string; items: NavItem[] };

export const accountNav: ZoneNav = {
  zoneLabel: "Account",
  items: [
    { href: "/account", label: "Profile" },
    { href: "/account/pets", label: "Pets" },
    { href: "/account/forms", label: "Forms" },
    { href: "/account/bookings", label: "Bookings" },
  ],
};

export const adminNav: ZoneNav = {
  zoneLabel: "Admin",
  items: [
    { href: "/admin/availability", label: "Availability" },
    { href: "/admin/bookings", label: "Bookings" },
    { href: "/admin/services", label: "Services" },
    { href: "/admin/settings", label: "Settings" },
    { href: "/admin/reviews", label: "Reviews" },
    { href: "/admin/clients", label: "Clients" },
  ],
};
