/**
 * Public barrel for the pets feature.
 * All cross-feature imports of pet-related APIs resolve through this entry point.
 */

export {
  SPECIES_VALUES,
  type PetSpecies,
  SPECIES,
  speciesEnum,
} from "./species";

export { PetAvatar } from "./pet-avatar";

export {
  listClientPets,
  PET_COLUMNS,
  SIGNED_URL_TTL_SECONDS,
  type AssignablePet,
  type ClientPetView,
  type ListClientPetsResult,
  type PetRow,
} from "./pets-repo";
