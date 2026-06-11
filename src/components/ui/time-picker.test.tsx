// @vitest-environment jsdom
import * as React from "react";
import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimePicker } from "./time-picker";

it("renders 6:30 AM for booking_open_minute = 390", () => {
  render(
    <TimePicker
      id="open"
      label="Bookings open at"
      value={390}
      onChange={() => undefined}
    />,
  );

  // The hour select should show "6"
  const hourTrigger = screen.getByLabelText("Bookings open at hour");
  expect(hourTrigger.textContent).toContain("6");

  // The minute select should show "30"
  const minuteTrigger = screen.getByLabelText("Bookings open at minute");
  expect(minuteTrigger.textContent).toContain("30");

  // The meridiem select should show "AM"
  const meridiemTrigger = screen.getByLabelText("Bookings open at AM or PM");
  expect(meridiemTrigger.textContent).toContain("AM");
});
