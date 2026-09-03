// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { updateServiceMock } = vi.hoisted(() => ({
  // Typed on the action's input so the assertions read the submitted payload
  // without casting the recorded call.
  updateServiceMock: vi.fn(async (_input: UpdateServiceInput) => ({
    kind: "success" as const,
  })),
}));

vi.mock("@/features/admin/index.client", async (importActual) => {
  const actual =
    await importActual<typeof import("@/features/admin/index.client")>();
  return { ...actual, updateService: updateServiceMock };
});

import { ServiceEditForm } from "./service-edit-form";
import type {
  ServiceAdminRow,
  UpdateServiceInput,
} from "@/features/admin/index.client";

const WALK_ROW: ServiceAdminRow = {
  id: "svc-walk",
  slug: "walk",
  name: "Walk",
  description: null,
  pricing_type: "walk",
  pricing_config: {
    modifiers: [{ kind: "base_per_hour", cents: 2500 }],
    constraints: {
      intervalMin: 15,
      minDurationMin: 30,
      maxDurationMin: 180,
      maxDogs: 2,
      allowedSpecies: ["dog"],
    },
  },
  default_duration_min: 60,
  max_pets: null,
  concurrency: "exclusive",
  form_key: null,
  requires_approval: false,
  active: true,
  sort_order: 0,
};

/** House-sitting is priced per night and seeds `default_duration_min` as null. */
const HOUSE_SIT_ROW: ServiceAdminRow = {
  ...WALK_ROW,
  id: "svc-house-sitting",
  slug: "house-sitting",
  name: "House sitting",
  pricing_type: "house_sitting",
  pricing_config: {
    modifiers: [{ kind: "base_per_night", cents: 6000 }],
    constraints: { intervalMin: 15, allowedSpecies: ["dog", "cat"] },
  },
  default_duration_min: null,
};

/** The payload the form submitted, or a loud failure if it never submitted. */
function submittedInput(): UpdateServiceInput {
  const call = updateServiceMock.mock.calls[0];
  if (!call) throw new Error("updateService was not called");
  return call[0];
}

describe("ServiceEditForm", () => {
  it("saves a rate edit as a rebuilt pricing_config", async () => {
    render(
      <ServiceEditForm
        service={WALK_ROW}
        onCancel={() => {}}
        onSaved={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Base rate (per hour)"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(updateServiceMock).toHaveBeenCalledTimes(1));
    const arg = submittedInput();
    expect(arg.serviceId).toBe("svc-walk");
    expect(
      (arg.pricing_config as { modifiers: { cents: number }[] }).modifiers[0]
        ?.cents,
    ).toBe(3000);
    expect(arg.default_duration_min).toBe(60);
  });

  it("blocks save and shows an error for an out-of-range value", async () => {
    render(
      <ServiceEditForm
        service={WALK_ROW}
        onCancel={() => {}}
        onSaved={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Max dogs"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/at least 1/i)).toBeInTheDocument();
    expect(updateServiceMock).not.toHaveBeenCalled();
  });

  it("saves a per-night rate edit even though the service has no duration", async () => {
    render(
      <ServiceEditForm
        service={HOUSE_SIT_ROW}
        onCancel={() => {}}
        onSaved={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Base rate (per night)"), {
      target: { value: "70" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(updateServiceMock).toHaveBeenCalledTimes(1));
    const arg = submittedInput();
    expect(
      (arg.pricing_config as { modifiers: { cents: number }[] }).modifiers[0]
        ?.cents,
    ).toBe(7000);
    expect(arg.default_duration_min).toBeUndefined();
  });

  it("falls back to read-only pricing for an unparseable config", () => {
    const legacy = {
      ...WALK_ROW,
      pricing_config: { rate_cents_per_hour: 2500 },
    } as ServiceAdminRow;
    render(
      <ServiceEditForm
        service={legacy}
        onCancel={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(screen.queryByLabelText("Base rate (per hour)")).toBeNull();
    expect(screen.getByText(/can't be edited here/i)).toBeInTheDocument();
  });
});
