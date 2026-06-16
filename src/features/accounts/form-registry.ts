import { type ZodSchema } from "zod";
import { emergencySchema } from "./emergency-schema";
import { ownerSchema } from "./owner-schema";
import { homeSchema } from "./home-schema";
import { petFormSchema } from "./pet-form-schema";

/**
 * Entity-scoped intake forms. `scope` decides whether a response is keyed to the
 * account (one row per client) or to a pet (one row per client + pet). The
 * booking requirement gate and the standalone /account/forms surface both read
 * `scope` to know how many rows a form expects.
 *
 * `emergency` is legacy (the original single-form gate). It is superseded by
 * `owner` but kept registered so existing rows still validate if edited; it is
 * no longer a required profile and is not surfaced on the profiles page.
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
  home: {
    schema: homeSchema,
    scope: "account",
    title: "Home access & care",
  },
  pet: {
    schema: petFormSchema,
    scope: "pet",
    title: "Pet care details",
  },
} satisfies Record<string, FormRegistryEntry>;

export type FormKey = keyof typeof formRegistry;
