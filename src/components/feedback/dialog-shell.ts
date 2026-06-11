// Shared modal shell styling — consumed by the confirm dialog (alertdialog) and
// the generic Dialog primitive so every modal reads as one component family.
// Mobile: bottom-sheet; ≥sm: centered.
export const dialogBackdropClass =
  "bg-foreground/20 fixed inset-0 z-50 backdrop-blur-[1px]";

export const dialogPanelClass =
  "bg-popover text-popover-foreground border-border fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-md flex-col gap-3 rounded-t-xl border p-5 shadow-xl sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl";
