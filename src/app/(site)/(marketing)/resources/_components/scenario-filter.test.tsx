// @vitest-environment jsdom
import { beforeAll, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ScenarioFilter } from "./scenario-filter";

// The Multiswitch measures its indicator through a ResizeObserver, which jsdom
// does not implement.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const ROWS = [
  { id: "cpr", scenario: "emergency" as const, content: <span>Pet CPR</span> },
  {
    id: "heat",
    scenario: "seasonal" as const,
    content: <span>Heatstroke</span>,
  },
  { id: "bloat", scenario: "everyday" as const, content: <span>Bloat</span> },
];

/** `hidden` is a Tailwind `display: none`, so a filtered row leaves the layout. */
function rowFor(text: string): HTMLElement {
  const li = screen.getByText(text).closest("li");
  if (!li) throw new Error(`no row for ${text}`);
  return li;
}

it("hides every row outside the chosen scenario and restores them on All", async () => {
  const user = userEvent.setup();
  render(<ScenarioFilter rows={ROWS} />);

  // "All" is the initial selection: nothing is filtered out.
  for (const text of ["Pet CPR", "Heatstroke", "Bloat"]) {
    expect(rowFor(text)).not.toHaveClass("hidden");
  }

  await user.click(screen.getByRole("button", { name: "Seasonal" }));
  expect(rowFor("Heatstroke")).not.toHaveClass("hidden");
  expect(rowFor("Pet CPR")).toHaveClass("hidden");
  expect(rowFor("Bloat")).toHaveClass("hidden");

  await user.click(screen.getByRole("button", { name: "All" }));
  expect(rowFor("Pet CPR")).not.toHaveClass("hidden");
  expect(rowFor("Bloat")).not.toHaveClass("hidden");
});
