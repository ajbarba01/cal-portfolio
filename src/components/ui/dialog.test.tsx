// @vitest-environment jsdom
import * as React from "react";
import { it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Dialog } from "./dialog";

it("opens, shows title, and closes via the close affordance", () => {
  function Harness() {
    const [open, setOpen] = React.useState(true);
    return (
      <Dialog open={open} onOpenChange={setOpen} title="Details">
        <p>body</p>
      </Dialog>
    );
  }
  render(<Harness />);
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByText("Details")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Close"));
  expect(screen.queryByRole("dialog")).toBeNull();
});
