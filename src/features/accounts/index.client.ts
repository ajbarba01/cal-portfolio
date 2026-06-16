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
  AuthConfig,
} from "./_components/form-card";
export type { FieldValues } from "./_components/profile-fields";

export { PetList } from "./_components/pet-list";
export type { PetListProps, PetViewLike } from "./_components/pet-list";

// ─── PetForm (reused in booking pet-assignment dialog too) ───────────────────

export { PetForm } from "./_components/pet-form";
export type { PetFormActions } from "./_components/pet-form";

// ─── Actions ("use server" — RPC-safe from client) ───────────────────────────

export {
  submitForm,
  confirmForm,
  acceptAuthorization,
  deletePet,
  createPet,
  updatePet,
  updateProfile,
  changePassword,
} from "./account-actions";
export {
  EXPENSE_AUTH_KIND,
  EXPENSE_AUTH_VERSION,
  EXPENSE_AUTH_TEXT,
} from "./authorizations";
export type {
  Pet,
  PetInput,
  ActionResult,
  CreatePetResult,
} from "./account-actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { FormKey } from "./form-registry";
export type { ProfileInput } from "./profile-schema";
