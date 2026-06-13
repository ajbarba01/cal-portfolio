"use client";

/** Service chooser for admin create-on-behalf. Client is already fixed. */

export interface PickableService {
  slug: string;
  name: string;
  description: string | null;
}

export function ServicePick({
  services,
  onPick,
}: {
  services: PickableService[];
  onPick: (slug: string) => void;
}) {
  return (
    <div>
      <p className="text-brand-strong mb-3 text-xs font-semibold tracking-wide uppercase">
        Which service?
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {services.map((s) => (
          <button
            key={s.slug}
            type="button"
            onClick={() => onPick(s.slug)}
            className="border-border bg-card hover:border-brand focus-visible:ring-ring rounded-xl border p-3 text-left focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="block text-sm font-semibold">{s.name}</span>
            {s.description ? (
              <span className="text-muted-foreground block text-xs">
                {s.description}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
