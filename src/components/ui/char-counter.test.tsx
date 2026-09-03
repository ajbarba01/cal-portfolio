// @vitest-environment jsdom

/**
 * CharCounter has two jobs and a threshold between them: it always shows the
 * budget, and it announces the budget only once the budget is nearly spent.
 *
 * The silence below the threshold is the load-bearing half. A live region on a
 * figure that changes with every keystroke reads the number over the user's own
 * typing for the whole field, which is why the announcement is a separate,
 * usually empty, element rather than the visible one.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { CharCounter } from "./char-counter";

/** The visible budget, and whatever the live region is currently announcing. */
function readCounter(container: HTMLElement) {
  const visible = container.querySelector("p");
  const live = container.querySelector("[aria-live]");
  return { visible: visible?.textContent, announced: live?.textContent };
}

function renderAt(count: number, max = 100) {
  return render(<CharCounter value={"x".repeat(count)} max={max} />);
}

describe("CharCounter", () => {
  it("shows the count against the cap", () => {
    const { container } = renderAt(12);

    expect(readCounter(container).visible).toBe("12 / 100");
  });

  it("groups a four-figure budget so it stays readable", () => {
    const { container } = renderAt(1234, 5000);

    expect(readCounter(container).visible).toBe("1,234 / 5,000");
  });

  it.each([0, 50, 89])(
    "stays silent at %s characters of a 100-character budget",
    (count) => {
      const { container } = renderAt(count);

      expect(readCounter(container).announced).toBe("");
    },
  );

  it("starts announcing in the last tenth of the budget", () => {
    const { container } = renderAt(90);

    expect(readCounter(container)).toEqual({
      visible: "90 / 100",
      announced: "90 / 100",
    });
  });

  it("keeps announcing once the cap is reached", () => {
    const { container } = renderAt(100);

    expect(readCounter(container).announced).toBe("100 / 100");
  });

  it.each([
    [50, "text-muted-foreground"],
    [95, "text-warning-foreground"],
    [100, "text-destructive"],
  ])("colours the figure by band at %s characters", (count, token) => {
    const { container } = renderAt(count);

    expect(container.querySelector("p")?.className).toContain(token);
  });

  it("treats a value past the cap as at the cap, not as a third state", () => {
    // A paste can exceed maxLength on some browsers, and the server schema is
    // the real wall — the counter should read spent, not broken.
    const { container } = renderAt(140);

    expect(container.querySelector("p")?.className).toContain(
      "text-destructive",
    );
    expect(readCounter(container).announced).toBe("140 / 100");
  });

  it("puts the caller's id on the visible figure, which is the described-by target", () => {
    const { container } = render(
      <CharCounter value="hello" max={100} id="notes-counter" />,
    );

    expect(container.querySelector("p")?.id).toBe("notes-counter");
    expect(container.querySelector("[aria-live]")?.id).toBe("");
  });

  it("keeps the announcement out of the caller's layout", () => {
    const { container } = renderAt(95);

    expect(container.querySelector("[aria-live]")?.className).toContain(
      "sr-only",
    );
  });
});
