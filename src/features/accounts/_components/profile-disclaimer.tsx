import { Info } from "lucide-react";

export const PROFILE_DISCLAIMER =
  'If anything here feels too sensitive to share, you can leave it blank or write "N/A" and reach out to Cal directly — we\'ll work it out together.';

export function ProfileDisclaimer() {
  return (
    <p className="text-muted-foreground border-border bg-muted/40 flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed">
      <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>{PROFILE_DISCLAIMER}</span>
    </p>
  );
}
