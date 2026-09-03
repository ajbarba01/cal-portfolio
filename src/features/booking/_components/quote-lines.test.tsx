// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { QuoteLines } from "./quote-lines";

describe("QuoteLines", () => {
  it("renders one row per line, label and amount", () => {
    render(
      <QuoteLines
        breakdown={{
          lines: [
            { label: "House sitting base (2 nights)", amountCents: 10000 },
            { label: "Friends & Family (−50%)", amountCents: -5000 },
          ],
          finalCents: 5000,
        }}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      screen.getByText("House sitting base (2 nights)"),
    ).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("Friends & Family (−50%)")).toBeInTheDocument();
    expect(screen.getByText("-$50.00")).toBeInTheDocument();
  });

  it("renders nothing for a legacy breakdown stored as an empty object", () => {
    const { container } = render(<QuoteLines breakdown={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the booking has no breakdown at all", () => {
    const { container } = render(<QuoteLines breakdown={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a breakdown whose line list is empty", () => {
    render(<QuoteLines breakdown={{ lines: [], finalCents: 0 }} />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("renders an info-tooltip trigger for a line that has a description", () => {
    render(
      <QuoteLines
        breakdown={{
          lines: [
            {
              label: "Premium night",
              amountCents: 1250,
              description: "Holiday & peak-date rate.",
            },
            { label: "House sitting base (2 nights)", amountCents: 10000 },
          ],
          finalCents: 11250,
        }}
      />,
    );

    expect(
      screen.getByRole("button", { name: /premium night/i }),
    ).toBeInTheDocument();
  });

  it("does not render a tooltip trigger for a line without a description", () => {
    render(
      <QuoteLines
        breakdown={{
          lines: [
            { label: "House sitting base (2 nights)", amountCents: 10000 },
          ],
          finalCents: 10000,
        }}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /house sitting base/i }),
    ).not.toBeInTheDocument();
  });
});
