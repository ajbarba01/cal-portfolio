"use client";

import * as React from "react";

import { SectionHeader } from "@/components/marketing/section-header";
import { StatDisplay } from "@/components/marketing/stat-display";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CharCounter } from "@/components/ui/char-counter";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { ListRow } from "@/components/ui/list-row";
import { Multiswitch } from "@/components/ui/multiswitch";
import { NumberStepper } from "@/components/ui/number-stepper";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup } from "@/components/ui/radio-group";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { TextLink } from "@/components/ui/text-link";
import { Textarea } from "@/components/ui/textarea";
import { UnitInput } from "@/components/ui/unit-input";
import { FIELD_LIMITS } from "@/lib/field-limits";

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
  const [toggle, setToggle] = React.useState(true);
  const [pet, setPet] = React.useState<"dog" | "cat">("dog");
  const [agree, setAgree] = React.useState(true);
  const [notes, setNotes] = React.useState("");

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
        <div className="flex max-w-md flex-col gap-1.5">
          <Tag>CharCounter — long free-text fields (cap from field-limits)</Tag>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Type to see the counter turn amber near the cap, red at it"
            maxLength={FIELD_LIMITS.note}
            aria-describedby="showcase-notes-counter"
          />
          <CharCounter
            id="showcase-notes-counter"
            value={notes}
            max={FIELD_LIMITS.note}
            className="text-right"
          />
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
        title="Surface — one card, shimmer = outer card"
        note="Structural rule: an OUTER card (not nested inside another card) shimmers; a nested card is plain. emphasis = outer card (default top-level). interactive = outer + clickable. plain = nested card / sub-section. One radius (rounded-card); ShimmerCard aliases emphasis."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Surface variant="emphasis" className="p-5">
            <p className="font-medium">emphasis</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Outer card (default top-level). Shimmer ring.
            </p>
          </Surface>
          <Surface variant="interactive" className="p-5">
            <p className="font-medium">interactive</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Outer + clickable — shimmer ring + border/tint hover.
            </p>
          </Surface>
          <Surface variant="plain" className="p-5">
            <p className="font-medium">plain</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Nested card / sub-section. No shimmer.
            </p>
          </Surface>
          <Surface variant="floating" className="p-5">
            <p className="font-medium">floating</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Floating overlay (toast, dropdown). Sanctioned shadow, no shimmer.
            </p>
          </Surface>
        </div>
      </Section>

      {/* ── FormSection ───────────────────────────────────────────────── */}
      <Section
        title="FormSection — titled field group"
        note="Replaces fieldset/legend (whose notch misaligns with the shimmer ring). An emphasis Surface titled by an Eyebrow, grouped via role=group + aria-labelledby. Multi-section forms stack several; each is its own outer card."
      >
        <div className="flex max-w-md flex-col gap-4">
          <FormSection title="Your profile">
            <FormField label="Full name" name="demo_full_name" />
            <FormField
              label="Phone"
              name="demo_phone"
              hint="We only call about your bookings."
            />
          </FormSection>
          <FormSection title="Emergency contact">
            <FormField
              label="Contact name"
              name="demo_emergency"
              error="Required — add a backup contact."
            />
          </FormSection>
        </div>
      </Section>

      {/* ── Families ──────────────────────────────────────────────────── */}
      <Section
        title="Component families"
        note="The consolidated small-component families — one source each, replacing the hand-rolled drift the audit found. All shadow-free."
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Tag>Badge — variants + sizes + outline chip</Tag>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>default</Badge>
              <Badge variant="brand">brand</Badge>
              <Badge variant="available">available</Badge>
              <Badge variant="booked">booked</Badge>
              <Badge variant="pending">pending</Badge>
              <Badge variant="destructive">destructive</Badge>
              <Badge variant="outline">outline</Badge>
              <Badge variant="outline" size="md">
                chip md
              </Badge>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Tag>Alert — info / success / warning / error</Tag>
            <div className="grid gap-2 sm:grid-cols-2">
              <Alert variant="info" title="Heads up">
                Editable until 24h before the visit.
              </Alert>
              <Alert variant="success" title="Saved">
                Your changes are live.
              </Alert>
              <Alert variant="warning" title="Override applied">
                Rate differs from the standard sliding scale.
              </Alert>
              <Alert variant="error" title="Couldn't save">
                Check the highlighted fields.
              </Alert>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Tag>TextLink — the one inline CTA</Tag>
            <p className="text-sm">
              Questions? <TextLink href="#">Contact Cal</TextLink> or{" "}
              <TextLink href="#">browse the FAQ</TextLink>.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Tag>
              Switch — shared on/off toggle (was hand-rolled per admin page)
            </Tag>
            <div className="flex items-center gap-3">
              <Switch
                checked={toggle}
                onCheckedChange={setToggle}
                aria-label="Demo toggle"
              />
              <span className="text-sm font-medium">
                {toggle ? "On" : "Off"}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Tag>RadioGroup — single-select form field</Tag>
            <RadioGroup
              ariaLabel="Species"
              value={pet}
              onValueChange={setPet}
              options={[
                { value: "dog", label: "🐕 Dog" },
                { value: "cat", label: "🐈 Cat" },
              ]}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Tag>Checkbox</Tag>
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
              />
              Repeat weekly
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <Tag>UnitInput — leading $ / trailing unit</Tag>
            <div className="flex flex-wrap gap-3">
              <UnitInput
                unit="$"
                unitPosition="leading"
                type="number"
                defaultValue="15.00"
                aria-label="Price"
                className="w-40"
              />
              <UnitInput
                unit="% of booking"
                type="number"
                defaultValue="50"
                aria-label="Deposit"
                className="w-48"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Tag>SectionHeader</Tag>
            <SectionHeader
              eyebrow="Field journal"
              title="A consistent section intro"
              description="Eyebrow + heading + description, locked to the type scale."
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Tag>StatDisplay — stacked / receipt</Tag>
              <div className="flex gap-8">
                <StatDisplay value="120+" label="Walks logged" />
                <StatDisplay value="4.9" label="Avg rating" />
              </div>
              <Surface
                variant="plain"
                className="mt-1 flex flex-col gap-1.5 p-4"
              >
                <StatDisplay
                  variant="receipt"
                  label="Dog walking ×3"
                  value="$90"
                />
                <StatDisplay
                  variant="receipt"
                  label="Sliding-scale adj."
                  value="−$10"
                />
              </Surface>
            </div>
            <div className="flex flex-col gap-2">
              <Tag>ListRow — plain / interactive</Tag>
              <div className="flex flex-col gap-2">
                <ListRow>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Plain row</span>
                    <Badge variant="available">active</Badge>
                  </div>
                </ListRow>
                <ListRow interactive>
                  <div className="flex items-center justify-between">
                    <TextLink href="#">Interactive row</TextLink>
                    <Badge variant="booked">booked</Badge>
                  </div>
                </ListRow>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Form field standard ───────────────────────────────────────── */}
      <Section
        title="Form field — standard fill"
        note="Decided: one fill site-wide = bg-background (cream), matching the form-on-card recipe. The unified form recipe applies this everywhere (account forms drop their transparent fill); bg-input stays only as the border role (border-input)."
      >
        <Surface
          variant="emphasis"
          className="flex flex-col gap-1.5 p-5 sm:max-w-sm"
        >
          <Tag>Label + Input on an emphasis card</Tag>
          <Input className="bg-background" placeholder="Your name" />
        </Surface>
      </Section>
    </main>
  );
}
