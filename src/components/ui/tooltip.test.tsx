// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InfoTooltip } from "./tooltip";

describe("InfoTooltip", () => {
  it("exposes the label as the trigger's accessible name", () => {
    render(
      <InfoTooltip
        label="What is a premium night?"
        content="A holiday surcharge."
      />,
    );
    expect(
      screen.getByRole("button", { name: "What is a premium night?" }),
    ).toBeInTheDocument();
  });

  it("reveals the content on focus", async () => {
    const user = userEvent.setup();
    render(
      <InfoTooltip label="Premium night" content="A holiday surcharge." />,
    );
    await user.tab();
    expect(await screen.findByText("A holiday surcharge.")).toBeInTheDocument();
  });
});
