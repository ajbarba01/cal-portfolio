// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { updateSettingsMock } = vi.hoisted(() => ({
  updateSettingsMock: vi.fn(),
}));

vi.mock("@/features/admin/index.client", async (importActual) => {
  const actual =
    await importActual<typeof import("@/features/admin/index.client")>();
  return { ...actual, updateSettings: updateSettingsMock };
});

import { SettingsClient } from "./settings-client";
import type { SettingsRow } from "@/features/admin/index.client";
import { settingsUpdateSchema } from "@/features/admin/settings-schema";
import { zodFieldErrors } from "@/lib/form-action-result";

const SETTINGS: SettingsRow = {
  id: "settings-1",
  origin_label: "Denver",
  origin_lat: 39.74,
  origin_lng: -104.98,
  road_factor: 1.3,
  avg_speed_mph: 25,
  auto_approve_threshold_miles: 10,
  hard_cutoff_miles: 50,
  gate_use_road_miles: true,
  booking_open_minute: 480,
  booking_close_minute: 1200,
  min_lead_time_hours: 12,
  auto_confirm_horizon_days: 14,
  hard_max_advance_days: 180,
  recurrence_generation_horizon_days: 60,
  recurring_discount_pct: 10,
  recurring_min_occurrences: 4,
  cancellation_full_refund_hours: 48,
  late_cancel_refund_pct: 50,
  no_show_charge_pct: 100,
  holiday_surcharge_cents: 1500,
  holiday_dates: [],
  reminder_lead_hours: 24,
  drive_buffer_pct: 120,
};

/**
 * Build the rejection the real action would return, so the key convention the
 * editor reads (a settings column name per bad value) is pinned to the schema
 * and the flattening helper rather than hand-written here. `updateSettingsCore`
 * composes these same two pieces.
 */
function rejectionFor(badInput: Record<string, unknown>) {
  const parsed = settingsUpdateSchema.safeParse(badInput);
  if (parsed.success)
    throw new Error("expected the schema to reject the input");
  return {
    kind: "validation_error" as const,
    message: "Please check your entries and try again.",
    fieldErrors: zodFieldErrors(parsed.error),
  };
}

function saveSettings() {
  const view = render(<SettingsClient initialSettings={SETTINGS} />);
  fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
  return view;
}

describe("SettingsClient", () => {
  it("marks a rejected column's own field and points it at the form error", async () => {
    const rejection = rejectionFor({ late_cancel_refund_pct: 500 });
    expect(Object.keys(rejection.fieldErrors)).toEqual([
      "late_cancel_refund_pct",
    ]);
    updateSettingsMock.mockResolvedValue(rejection);
    saveSettings();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Please check your entries and try again.");
    const field = screen.getByLabelText("Refund for a late cancellation");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", alert.id);
    // zod writes for developers ("Too big: expected number to be <=100") and
    // names DB columns; none of that text may reach Cal.
    for (const zodMessage of Object.values(rejection.fieldErrors)) {
      expect(screen.queryByText(zodMessage)).toBeNull();
    }
  });

  it("opens Advanced when the rejected column is inside it", async () => {
    updateSettingsMock.mockResolvedValue(rejectionFor({ origin_label: "" }));
    const { container } = saveSettings();
    const advanced = container.querySelector("details");

    await waitFor(() => expect(advanced?.open).toBe(true));
    expect(screen.getByLabelText("Origin label")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("leaves Advanced closed and no field marked on a clean save", async () => {
    updateSettingsMock.mockResolvedValue({ kind: "success" });
    const { container } = saveSettings();

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Settings saved."),
    );
    expect(container.querySelector("details")?.open).toBe(false);
    expect(container.querySelector("[aria-invalid]")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
