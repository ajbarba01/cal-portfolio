"use client";

import * as React from "react";

/**
 * One service tab. Text fields are plain strings; `detail` is the server-rendered
 * panel body (photo, long-form copy, receipt) passed through so marketing copy
 * stays server-rendered — only the active-tab state is client-side.
 */
export interface ServiceTabItem {
  slug: string;
  name: string;
  detail: React.ReactNode;
}

/**
 * Tabbed services: a centered tab strip (scrolls horizontally when it overflows,
 * e.g. on mobile) over a panel that shows the selected service. Clean editorial
 * styling — the hairline strip with a clay underline + soft tint on hover; the
 * receipt inside each panel is the only white card. Arrow-key navigable.
 */
export function ServiceTabs({ items }: { items: ServiceTabItem[] }) {
  const [active, setActive] = React.useState(items[0]?.slug ?? "");
  const tabRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (slug: string) => {
    setActive(slug);
    tabRefs.current[slug]?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = items[(index + dir + items.length) % items.length];
    tabRefs.current[next.slug]?.focus();
    select(next.slug);
  };

  return (
    <div>
      {/* Centered, horizontally scrollable tab strip. */}
      <div className="border-border [scrollbar-width:none] overflow-x-auto overflow-y-hidden border-b text-center [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div
          role="tablist"
          aria-label="Services"
          className="inline-flex gap-1 align-bottom"
        >
          {items.map((item, i) => {
            const selected = item.slug === active;
            return (
              <button
                key={item.slug}
                ref={(el) => {
                  tabRefs.current[item.slug] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${item.slug}`}
                aria-selected={selected}
                aria-controls={`panel-${item.slug}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(item.slug)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={[
                  "focus-visible:ring-ring/50 -mb-px flex shrink-0 cursor-pointer flex-col gap-0.5 rounded-t-xl border-b-2 px-4 pt-2.5 pb-3 text-left whitespace-nowrap transition-[color,background-color,border-color] duration-200 ease-out outline-none focus-visible:ring-3 focus-visible:ring-inset",
                  selected
                    ? "border-brand bg-sidebar-active text-foreground"
                    : "text-muted-foreground bg-section-alt hover:text-foreground border-transparent hover:bg-[color-mix(in_oklab,var(--brand)_12%,var(--section-alt))]",
                ].join(" ")}
              >
                <span
                  className={[
                    "font-heading text-[1.15rem] leading-tight",
                    selected ? "text-brand-strong" : "",
                  ].join(" ")}
                >
                  {item.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Panels */}
      <div className="pt-8">
        {items.map((item) => {
          const selected = item.slug === active;
          return (
            <section
              key={item.slug}
              id={`panel-${item.slug}`}
              role="tabpanel"
              aria-labelledby={`tab-${item.slug}`}
              hidden={!selected}
            >
              <div className="mb-5">
                <h2 className="font-heading text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
                  {item.name}
                </h2>
              </div>
              {item.detail}
            </section>
          );
        })}
      </div>
    </div>
  );
}
