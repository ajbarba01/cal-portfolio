// @vitest-environment jsdom

/**
 * Pet-cap and pet-awareness surface consistency for client-edit.
 *
 * The cap case pins that client-edit enforces the service's pet cap
 * (constraints.maxDogs) the same way the public booking surface does: a walk
 * caps at 2 dogs, so a viewer editing a walk booking can't grow the selection
 * past two. Guards the maxSelect passthrough (use-edit-booking → PetAssignment)
 * that mirrors the durationBounds threading.
 *
 * The check-in case pins the other half of the `isPetAware` contract: every paid
 * service assigns pets, so an uncapped, multi-species service still renders the
 * pet step and still routes a toggle into the patch as `petIds`.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/feedback/toast", () => ({
  useToast: () => ({ add: vi.fn() }),
}));

// Replace only the websocket/Supabase IO surface the hook reaches; the rest
// (Scheduler, PetAssignment, useBookingScheduler, diffBookingPatch) is REAL so
// the render exercises the true cap wiring.
const { previewEditMock, editBookingMock } = vi.hoisted(() => ({
  // Typed on the input so the recorded calls carry the patch the hook built.
  previewEditMock: vi.fn(
    async (_input: { bookingId: string; patch: EditBookingPatch }) => ({
      kind: "unavailable",
      reason: "n/a",
    }),
  ),
  editBookingMock: vi.fn(),
}));

vi.mock("@/features/booking/use-availability", async (importActual) => ({
  ...(await importActual<
    typeof import("@/features/booking/use-availability")
  >()),
  useAvailability: () => ({
    openWindows: [],
    openSlots: [],
    loading: false,
    error: null,
  }),
}));
vi.mock("@/features/booking/use-busy-ranges", async (importActual) => ({
  ...(await importActual<
    typeof import("@/features/booking/use-busy-ranges")
  >()),
  useBusyRanges: () => ({ busy: [], refresh: vi.fn() }),
}));
vi.mock("@/features/booking/use-overnight-nights", async (importActual) => ({
  ...(await importActual<
    typeof import("@/features/booking/use-overnight-nights")
  >()),
  useOvernightNights: () => ({
    overnightNights: new Set<string>(),
    loading: false,
    error: null,
  }),
}));
vi.mock("@/features/booking/use-premium-days", async (importActual) => ({
  ...(await importActual<
    typeof import("@/features/booking/use-premium-days")
  >()),
  usePremiumDays: () => ({ premiumDays: new Set<string>() }),
}));
vi.mock("@/features/booking/preview-edit", async (importActual) => ({
  ...(await importActual<typeof import("@/features/booking/preview-edit")>()),
  previewEdit: previewEditMock,
}));
vi.mock("@/features/booking/actions", async (importActual) => ({
  ...(await importActual<typeof import("@/features/booking/actions")>()),
  editBooking: editBookingMock,
}));

import { EditBookingClient } from "./edit-booking-client";
import type { EditBookingPatch } from "@/features/booking/booking-service";
import type { ServiceDetail } from "@/features/booking/service-detail";
import type { AssignablePet } from "./pet-assignment";

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

const CHECK_IN_SERVICE: ServiceDetail = {
  slug: "check-in",
  name: "Check-in",
  description: null,
  pricingType: "check_in",
  defaultDurationMin: 30,
  constraints: {
    intervalMin: 15,
    minDurationMin: 30,
    maxDurationMin: 120,
    allowedSpecies: ["dog", "cat"],
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
        viewerDriveBufferMin={0}
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

  it("renders the pet step for an uncapped check-in and patches petIds on toggle", async () => {
    render(
      <EditBookingClient
        bookingId="bk2"
        service={CHECK_IN_SERVICE}
        rules={RULES}
        initialBusy={[]}
        pets={PETS}
        priorFinalCents={0}
        viewerDriveBufferMin={0}
        initial={{
          startsAtIso: "2026-07-01T15:00:00.000Z",
          endsAtIso: "2026-07-01T15:30:00.000Z",
          petIds: ["a"],
          quantities: { type: "check_in", qty: { hours: 0.5 } },
          comments: "",
          wasConfirmed: false,
          isSeriesOccurrence: false,
        }}
      />,
    );

    // check_in is pet-aware, so the step renders at all.
    expect(
      screen.getByRole("region", { name: /which pets\?/i }),
    ).toBeInTheDocument();

    const milo = screen.getByRole("button", { name: /Milo/ });
    fireEvent.click(milo);
    expect(milo).toHaveAttribute("aria-pressed", "true");

    // The debounced preview is where the patch first becomes observable.
    await waitFor(() => expect(previewEditMock).toHaveBeenCalled());
    const lastCall = previewEditMock.mock.calls.at(-1);
    expect(lastCall?.[0].patch.petIds).toEqual(["a", "b"]);
  });
});
