"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Multiswitch } from "@/components/ui/multiswitch";
import { NumberStepper } from "@/components/ui/number-stepper";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";

/** A labelled block in the catalog. */
function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl leading-tight font-semibold">
          {title}
        </h2>
        {note ? (
          <p className="text-muted-foreground max-w-[70ch] text-sm leading-relaxed">
            {note}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Small caption above a specimen. */
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground text-xs font-medium tracking-wide">
      {children}
    </span>
  );
}

const BUTTON_VARIANTS = [
  "default",
  "brand",
  "outline",
  "secondary",
  "ghost",
  "destructive",
  "link",
] as const;

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
] as const;

type FilterValue = (typeof FILTER_OPTIONS)[number]["value"];

export function ShowcaseClient() {
  const [select, setSelect] = React.useState("two");
  const [filter, setFilter] = React.useState<FilterValue>("all");
  const [count, setCount] = React.useState(2);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-14 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-brand-strong text-xs font-semibold tracking-[0.14em] uppercase">
          Component System
        </p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight">
          Showcase
        </h1>
        <p className="text-muted-foreground max-w-[70ch] leading-relaxed">
          Dev-only catalog of the shared primitives, rendered with the real
          components and live tokens. Use it to verify the groupings line up and
          to make visual decisions (e.g. the input fill below).
        </p>
      </header>

      {/* ── Control track ─────────────────────────────────────────────── */}
      <Section
        title="Control track"
        note="Input, Select, a same-size Button (size=lg → control md), the Multiswitch track, and the NumberStepper all read height + radius + outline from one shared token track, so they align by construction. They should share the same top and bottom edge in this row."
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Tag>Input</Tag>
            <Input placeholder="Text field" className="w-44" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Tag>Select</Tag>
            <Select value={select} onValueChange={(v) => v && setSelect(v)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one">One</SelectItem>
                <SelectItem value="two">Two</SelectItem>
                <SelectItem value="three">Three</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Tag>Button (lg)</Tag>
            <Button variant="brand" size="lg">
              Submit
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <Tag>Multiswitch</Tag>
            <Multiswitch
              options={FILTER_OPTIONS}
              value={filter}
              onValueChange={setFilter}
              ariaLabel="Filter"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Tag>NumberStepper (lg)</Tag>
            <NumberStepper
              value={count}
              onChange={setCount}
              min={0}
              max={9}
              ariaLabel="Count"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Tag>Textarea — shares the shell, height auto</Tag>
          <Textarea placeholder="Multi-line field" className="max-w-md" />
        </div>
      </Section>

      {/* ── Buttons ───────────────────────────────────────────────────── */}
      <Section
        title="Buttons"
        note="Heights are sourced from the control track: default = control sm (32px), lg = control md (36px, lines up with an Input). xs/sm are sub-track compact densities."
      >
        <div className="flex flex-col gap-3">
          {(["sm", "default", "lg"] as const).map((size) => (
            <div key={size} className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground w-16 text-xs">{size}</span>
              {BUTTON_VARIANTS.map((variant) => (
                <Button key={variant} variant={variant} size={size}>
                  {variant}
                </Button>
              ))}
            </div>
          ))}
        </div>
      </Section>

      {/* ── Surface ───────────────────────────────────────────────────── */}
      <Section
        title="Surface — one card, variant = intent"
        note="plain: flat data container. interactive: lifts on hover (clickable). emphasis: the clay shimmer ring, reserved for surfaces containing user input or emphasizing an important region. One radius (rounded-card); ShimmerCard is now an alias of emphasis."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Surface variant="plain" className="p-5">
            <p className="font-medium">plain</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Flat container. Admin rows, fieldsets, list items.
            </p>
          </Surface>
          <Surface variant="interactive" className="p-5">
            <p className="font-medium">interactive</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Hover me — lifts via the elevation token.
            </p>
          </Surface>
          <Surface variant="emphasis" className="p-5">
            <p className="font-medium">emphasis</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Shimmer ring on hover. Forms / important regions.
            </p>
          </Surface>
        </div>
      </Section>

      {/* ── Input fill decision ───────────────────────────────────────── */}
      <Section
        title="Input fill — pick one (open question)"
        note="Today account forms use a transparent fill while marketing/auth force bg-background; the designed bg-input (sand) token is unused. We standardize on ONE. Both candidates below sit on a card the way a real form would — compare and decide."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Surface variant="emphasis" className="p-5">
            <Tag>Candidate A — bg-background (cream)</Tag>
            <Input className="bg-background mt-1.5" placeholder="Your name" />
          </Surface>
          <Surface variant="emphasis" className="p-5">
            <Tag>Candidate B — bg-input (sand)</Tag>
            <Input className="bg-input mt-1.5" placeholder="Your name" />
          </Surface>
        </div>
      </Section>
    </main>
  );
}
