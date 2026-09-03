/**
 * TEMPORARY re-export. `PetAvatar` and the species taxonomy now live in the
 * pets feature (`@/features/pets`); this file keeps the old path resolving so
 * the tree stays buildable until pet-assignment.tsx is repointed. Delete it
 * with that repoint — it is the last importer.
 */
export { PetAvatar, type PetSpecies } from "@/features/pets";
