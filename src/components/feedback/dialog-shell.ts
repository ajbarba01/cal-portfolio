// Shared modal shell styling — consumed by the confirm dialog (alertdialog) and
// the generic Dialog primitive so every modal reads as one component family.
// Mobile: bottom-sheet; ≥sm: centered.
export const dialogBackdropClass =
  "bg-foreground/20 fixed inset-0 z-50 backdrop-blur-[1px]";

// Radius and depth come from the card + elevation tokens (`rounded-card`,
// `shadow-elev-2`) — a modal is a floating surface, the one place the house
// no-shadow rule does not apply. Note tailwind-merge does not know these custom
// scale keys, so a caller passing its own `rounded-*` / `shadow-*` through
// `cn()` will not reliably win: override by editing this string, not the call.
export const dialogPanelClass =
  "group bg-popover text-popover-foreground border-border rounded-t-card shadow-elev-2 fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-md flex-col gap-3 border p-5 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-card";
