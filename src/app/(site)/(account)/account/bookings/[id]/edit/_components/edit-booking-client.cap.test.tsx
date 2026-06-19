// @vitest-environment jsdom

/**
 * P3.1 — pet-cap surface consistency. Pins that client-edit enforces the
 * service's pet cap (constraints.maxDogs) the same way the public booking
 * surface does: a walk caps at 2 dogs, so a viewer editing a walk booking can't
 * grow the selection past two. Guards the maxSelect passthrough (use-edit-booking
 * → PetAssignment) that mirrors the durationBounds threading.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/feedback/toast", () => ({
  useToast: () => ({ add: vi.fn() }),
}));

// Replace only the websocket/Supabase IO surface of the client barrel; the rest
// (Scheduler, PetAssignment, useBookingScheduler, diffBookingPatch) is REAL so
// the render exercises the true cap wiring.
const { previewEditMock, editBookingMock } = vi.hoisted(() => ({
  previewEditMock: vi.fn(async () => ({ kind: "unavailable", reason: "n/a" })),
  editBookingMock: vi.fn(),
}));

vi.mock("@/features/booking/index.client", async (importActual) => {
  const actual =
    await importActual<typeof import("@/features/booking/index.client")>();
  return {
    ...actual,
    useAvailability: () => ({
      openWindows: [],
      openSlots: [],
      loading: false,
      error: null,
    }),
    useBusyRanges: () => ({ busy: [], refresh: vi.fn() }),
    useOvernightNights: () => ({
      overnightNights: new Set<string>(),
      loading: false,
      error: null,
    }),
    usePremiumDays: () => ({ premiumDays: new Set<string>() }),
    previewEdit: previewEditMock,
    editBooking: editBookingMock,
  };
});

import { EditBookingClient } from "./edit-booking-client";
import type { ServiceDetail } from "@/features/booking";
import type { AssignablePet } from "@/features/booking/index.client";

const RULES = {
  bookingOpenMinute: 480,
  bookingCloseMinute: 1080,
  minLeadTimeHours: 2,
  hardMaxAdvanceDays: 90,
};

const WALK_SERVICE: ServiceDetail = {
  slug: "walk",
  name: "Walk",
  description: null,
  pricingType: "walk",
  defaultDurationMin: 60,
  constraints: {
    intervalMin: 15,
    minDurationMin: 30,
    maxDurationMin: 180,
    maxDogs: 2,
    allowedSpecies: ["dog"],
  },
};

const dog = (id: string, name: string): AssignablePet => ({
  id,
  name,
  species: "dog",
  breed: null,
  notes: null,
  photoUrl: null,
});

const PETS = [dog("a", "Rex"), dog("b", "Milo"), dog("c", "Spot")];

describe("EditBookingClient pet cap", () => {
  it("enforces the walk 2-dog cap — a third pet is blocked with the at-cap notice", () => {
    render(
      <EditBookingClient
        bookingId="bk1"
        service={WALK_SERVICE}
        rules={RULES}
        initialBusy={[]}
        pets={PETS}
        priorFinalCents={0}
        initial={{
          startsAtIso: "2026-07-01T15:00:00.000Z",
          endsAtIso: "2026-07-01T16:00:00.000Z",
          petIds: ["a", "b"],
          quantities: { type: "walk", qty: { hours: 1, leashManners: false } },
          comments: "",
          wasConfirmed: false,
          isSeriesOccurrence: false,
        }}
      />,
    );

    const spot = screen.getByRole("button", { name: /Spot/ });
    fireEvent.click(spot);

    // Cap held: the third dog is NOT selected and the at-cap notice shows.
    expect(spot).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/up to 2 pets/i)).toBeInTheDocument();
  });
});
