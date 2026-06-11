// Client-safe public API of the accounts feature.
//
// Mirrors the pattern of src/features/booking/index.client.ts (see
// docs/adr/0002-client-server-entry-points.md). This barrel re-exports ONLY
// client-safe surfaces: client components, pure types, and "use server" action
// functions (which become RPC references in the browser bundle).
//
// "use client" files import from here; server code imports index.ts.

// ─── Shared profile-scoped components ────────────────────────────────────────

export { FormCard } from "./_components/form-card";
export type {
  FormCardProps,
  FormResponseLike,
  EmergencyFormValues,
} from "./_components/form-card";

export { PetList } from "./_components/pet-list";
export type { PetListProps, PetViewLike } from "./_components/pet-list";

// ─── PetForm (reused in booking pet-assignment dialog too) ───────────────────

export { PetForm } from "./_components/pet-form";
export type { PetFormActions } from "./_components/pet-form";

// ─── Actions ("use server" — RPC-safe from client) ───────────────────────────

export {
  submitForm,
  deletePet,
  createPet,
  updatePet,
  updateProfile,
  changePassword,
} from "./account-actions";
export type {
  Pet,
  PetInput,
  ActionResult,
  CreatePetResult,
} from "./account-actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { FormKey } from "./form-registry";
export type { ProfileInput } from "./profile-schema";
