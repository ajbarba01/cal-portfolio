import { type ZodSchema } from "zod";
import { emergencySchema } from "./emergency-schema";
import { ownerSchema } from "./owner-schema";
import { homeAccessSchema } from "./home-access-schema";
import { homeSittingSchema } from "./home-sitting-schema";
import { petCareSchema } from "./pet-care-schema";
import { petWalkSchema } from "./pet-walk-schema";

/**
 * Entity-scoped intake forms. `scope` decides whether a response is keyed to the
 * account (one row per client) or to a pet (one row per client + pet). The
 * booking requirement gate and the standalone /account/forms surface both read
 * `scope` to know how many rows a form expects.
 *
 * `emergency` is legacy (the original single-form gate). It is superseded by
 * `owner` but kept registered so existing rows still validate if edited; it is
 * no longer a required profile and is not surfaced on the profiles page.
 *
 * `home` and `pet` were legacy DB keys replaced by `home_access`, `home_sitting`,
 * `pet_care`, and `pet_walk`. These old keys are no longer in the registry.
 */
export type FormScope = "account" | "pet";

export interface FormRegistryEntry {
  schema: ZodSchema;
  scope: FormScope;
  /** Cal-facing card title. */
  title: string;
}

export const formRegistry = {
  emergency: {
    schema: emergencySchema,
    scope: "account",
    title: "Emergency contact & vet info",
  },
  owner: {
    schema: ownerSchema,
    scope: "account",
    title: "Owner & emergency contacts",
  },
  home_access: {
    schema: homeAccessSchema,
    scope: "account",
    title: "Home access",
  },
  home_sitting: {
    schema: homeSittingSchema,
    scope: "account",
    title: "House-sitting details",
  },
  pet_care: {
    schema: petCareSchema,
    scope: "pet",
    title: "Pet care",
  },
  pet_walk: {
    schema: petWalkSchema,
    scope: "pet",
    title: "Walks & outings",
  },
} satisfies Record<string, FormRegistryEntry>;

export type FormKey = keyof typeof formRegistry;
