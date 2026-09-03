// @vitest-environment jsdom

/**
 * The public booking flow's rendered structure.
 *
 * This is the revenue path, so what is pinned here is the shape a screen reader
 * and a keyboard user meet: which labelled step regions exist, in what order,
 * and which of them a viewer in each auth state is allowed to reach. The
 * assertions read regions and controls, never sentences — Cal rewrites this copy
 * through the content registry, and a rewrite must not turn a test red.
 */

import { describe, it, expect, vi } from "vitest";
import { render, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/feedback/toast", () => ({
  useToast: () => ({ add: vi.fn() }),
}));

// Replace only the websocket/Supabase IO surface of the client barrel; the rest
// (Scheduler, PetAssignment, QuantityForm, QuotePanel, helpers) is real, so the
// render reflects the true step structure.
const { previewQuoteMock, createBookingMock } = vi.hoisted(() => ({
  previewQuoteMock: vi.fn(async () => ({ kind: "not_authenticated" })),
  createBookingMock: vi.fn(),
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
    previewQuote: previewQuoteMock,
    createBooking: createBookingMock,
  };
});

import { ServiceBookingClient } from "./service-booking-client";
import type { AuthState, ServiceDetail } from "@/features/booking";
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

/** A recent timestamp well within the 180-day form-freshness window. */
const FRESH_AT = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

const DOG: AssignablePet = {
  id: "pet-dog-001",
  name: "Biscuit",
  species: "dog",
  breed: null,
  notes: null,
  photoUrl: null,
};

const CAT: AssignablePet = {
  ...DOG,
  id: "pet-cat-001",
  name: "Miso",
  species: "cat",
};

type Overrides = {
  authState?: AuthState;
  pets?: AssignablePet[];
  petIds?: string[];
  formResponses?: Record<
    string,
    { data: Record<string, unknown>; submittedAt: string | null }
  >;
};

function renderFlow({
  authState = "ready",
  pets = [],
  petIds = [],
  formResponses = {},
}: Overrides = {}) {
  return render(
    <ServiceBookingClient
      service={WALK_SERVICE}
      rules={RULES}
      initialBusy={[]}
      authState={authState}
      pets={pets}
      initialSelection={{ start: null, end: null, petIds }}
      myBookingDayKeys={[]}
      formResponses={formResponses}
      acceptedAuthVersion={null}
      acceptedAuthAt={null}
      viewerDriveBufferMin={0}
    />,
  );
}

/**
 * Each step is a `<section>` named by its own heading, so the ids of those
 * headings are the flow's structure in document order — independent of every
 * word inside them.
 */
function stepRegionIds(container: HTMLElement): string[] {
  return [...container.querySelectorAll("section[aria-labelledby]")].map(
    (section) => section.getAttribute("aria-labelledby") ?? "",
  );
}

function region(container: HTMLElement, labelledBy: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(
    `section[aria-labelledby="${labelledBy}"]`,
  );
  if (!found) throw new Error(`no region labelled by #${labelledBy}`);
  return found;
}

/** Each required form is a disclosure, so its collapsed toggle stands for a row. */
function formRows(formsRegion: HTMLElement): HTMLElement[] {
  return within(formsRegion).getAllByRole("button", { expanded: false });
}

describe("ServiceBookingClient", () => {
  it("lays the flow out as one labelled region per step, in order", () => {
    const { container } = renderFlow({ pets: [DOG] });

    expect(stepRegionIds(container)).toEqual([
      "cal-heading",
      "pets-heading",
      "qty-heading",
      "forms-heading",
      "create-comments-heading",
      "receipt-heading",
    ]);
  });

  it("gives every step region a heading to be named by", () => {
    // A region with a dangling aria-labelledby is an unnamed landmark: it is
    // announced as "region" with nothing to distinguish it from the next one.
    const { container } = renderFlow({ pets: [DOG] });

    for (const id of stepRegionIds(container)) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it("drops the pet step for a service that assigns no pets", () => {
    const { container } = render(
      <ServiceBookingClient
        service={{
          ...WALK_SERVICE,
          slug: "meet-greet",
          pricingType: "meet_greet",
        }}
        rules={RULES}
        initialBusy={[]}
        authState="ready"
        pets={[]}
        initialSelection={{ start: null, end: null, petIds: [] }}
        myBookingDayKeys={[]}
        formResponses={{}}
        acceptedAuthVersion={null}
        acceptedAuthAt={null}
        viewerDriveBufferMin={0}
      />,
    );

    expect(stepRegionIds(container)).not.toContain("pets-heading");
  });

  it("offers no way to book until a quote has been computed", () => {
    const { container } = renderFlow({ pets: [DOG] });

    // Nothing is selected, so the receipt holds a prompt and no control: an
    // enabled CTA here would submit a booking with no price attached.
    expect(
      within(region(container, "receipt-heading")).queryAllByRole("button"),
    ).toEqual([]);
  });

  it("replaces the receipt with the sign-in gate for a guest", () => {
    const { container } = renderFlow({ authState: "guest", pets: [DOG] });

    const ids = stepRegionIds(container);
    expect(ids).toContain("gate-guest-heading");
    expect(ids).not.toContain("receipt-heading");
    // The gate's whole job is to send the viewer somewhere they can sign in.
    expect(
      within(region(container, "gate-guest-heading")).getByRole("link"),
    ).toHaveProperty("href", expect.stringContaining("/login"));
  });

  it("shows the forms step to a guest without offering the forms themselves", () => {
    const { container } = renderFlow({ authState: "guest", pets: [DOG] });

    expect(stepRegionIds(container)).toContain("forms-heading");
    expect(
      within(region(container, "forms-heading")).queryAllByRole("button"),
    ).toEqual([]);
  });

  it("lists one openable row per form the assigned pets make necessary", () => {
    // A walk with a dog assigned needs the owner form plus that dog's care and
    // walk forms. Each row is a disclosure, so counting collapsed toggles counts
    // requirements without reading a single label.
    const { container } = renderFlow({ pets: [DOG], petIds: [DOG.id] });

    expect(formRows(region(container, "forms-heading"))).toHaveLength(3);
  });

  it("asks for the account form alone while no pet is assigned", () => {
    const { container } = renderFlow({ pets: [DOG] });

    expect(formRows(region(container, "forms-heading"))).toHaveLength(1);
  });

  it("keeps the forms step in place once every requirement is up to date", () => {
    const { container } = renderFlow({
      pets: [DOG],
      petIds: [DOG.id],
      formResponses: {
        owner: { data: {}, submittedAt: FRESH_AT },
        [`pet_care:${DOG.id}`]: { data: {}, submittedAt: FRESH_AT },
        [`pet_walk:${DOG.id}`]: { data: {}, submittedAt: FRESH_AT },
      },
    });

    // The step renders before a date is picked, and the rows stay reachable so
    // a client can revise an answer rather than being told there is nothing here.
    expect(stepRegionIds(container)).toContain("forms-heading");
    expect(formRows(region(container, "forms-heading"))).toHaveLength(3);
  });

  it("offers each eligible pet as a toggle and leaves the rest out", () => {
    const { container } = renderFlow({ pets: [DOG, CAT] });

    // Only dogs are walked, so the cat must not be selectable for this service.
    const toggles = within(region(container, "pets-heading"))
      .getAllByRole("button", { pressed: false })
      .map((toggle) => toggle.textContent ?? "");
    expect(toggles).toHaveLength(1);
    expect(toggles[0]).toContain(DOG.name);
    expect(toggles[0]).not.toContain(CAT.name);
  });

  it("marks the pet a viewer arrived with as already chosen", () => {
    const { container } = renderFlow({ pets: [DOG], petIds: [DOG.id] });

    expect(
      within(region(container, "pets-heading")).getAllByRole("button", {
        pressed: true,
      }),
    ).toHaveLength(1);
  });
});
