"use client";

import * as React from "react";

import { Reveal } from "@/components/effects/reveal";
import {
  Multiswitch,
  type MultiswitchOption,
} from "@/components/ui/multiswitch";
import { cn } from "@/lib/utils";
import { SCENARIO_LABEL, type Scenario } from "./scenarios";

type Filter = "all" | Scenario;

const FILTER_OPTIONS: ReadonlyArray<MultiswitchOption<Filter>> = [
  { value: "all", label: "All" },
  { value: "emergency", label: SCENARIO_LABEL.emergency },
  { value: "seasonal", label: SCENARIO_LABEL.seasonal },
  { value: "everyday", label: SCENARIO_LABEL.everyday },
];

export type ScenarioFilterRow = {
  /** Stable key; also the row's identity for React. */
  id: string;
  scenario: Scenario;
  /** The row's contents, rendered on the server. */
  content: React.ReactNode;
};

/**
 * The only interactive part of /resources: a scenario Multiswitch that hides the
 * rows it filters out. The rows themselves arrive pre-rendered from the server
 * page, so the copy registry never reaches the browser — this island ships the
 * switch, the state, and the `hidden` toggle, nothing else.
 */
export function ScenarioFilter({
  rows,
}: {
  rows: ReadonlyArray<ScenarioFilterRow>;
}) {
  const [filter, setFilter] = React.useState<Filter>("all");

  return (
    <>
      <Reveal className="mb-6">
        <Multiswitch
          ariaLabel="Filter health resources by scenario"
          options={FILTER_OPTIONS}
          value={filter}
          onValueChange={setFilter}
          className="flex-wrap"
        />
      </Reveal>

      <ul className="flex flex-col" role="list">
        {rows.map((row) => (
          <Reveal
            as="li"
            key={row.id}
            className={cn(
              // A bottom-bordered hover row, not a card — the radius only ever
              // shows on the hover tint, so it stays off the card token.
              "border-border group relative -mx-3 flex gap-4 rounded-lg border-b px-3 py-4 transition-colors duration-200 last:border-0 hover:bg-[color-mix(in_oklab,var(--brand)_5%,transparent)]",
              filter !== "all" && filter !== row.scenario && "hidden",
            )}
          >
            {row.content}
          </Reveal>
        ))}
      </ul>
    </>
  );
}
