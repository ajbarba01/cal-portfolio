// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { updateServiceMock } = vi.hoisted(() => ({
  updateServiceMock: vi.fn(async () => ({ kind: "success" as const })),
}));

vi.mock("@/features/admin", async (importActual) => {
  const actual = await importActual<typeof import("@/features/admin")>();
  return { ...actual, updateService: updateServiceMock };
});

import { ServiceEditForm } from "./service-edit-form";
import type { ServiceAdminRow, UpdateServiceInput } from "@/features/admin";

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
    const arg = (
      updateServiceMock.mock.calls as unknown as [UpdateServiceInput][]
    )[0][0];
    expect(arg.serviceId).toBe("svc-walk");
    expect(
      (arg.pricing_config as { modifiers: { cents: number }[] }).modifiers[0]
        .cents,
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
