"use client";

import { useRouter } from "next/navigation";
import { Surface } from "@/components/ui/surface";
import {
  adminCreatePet,
  adminUpdatePet,
  adminUploadPetPhoto,
  type ClientDetailView,
} from "@/features/admin/index.client";
import {
  PetList,
  type PetFormActions,
  type PetViewLike,
  type ActionResult,
} from "@/features/accounts/index.client";
import { SECTION, LEGEND } from "./shared";

interface ClientPetsProps {
  clientId: string;
  pets: ClientDetailView["pets"];
}

/** The client's pets, editable on their behalf. */
export function ClientPets({ clientId, pets }: ClientPetsProps) {
  const router = useRouter();

  const adminPetActions: PetFormActions = {
    create: async (input) => {
      const r = await adminCreatePet(clientId, input);
      if (r.kind === "forbidden")
        return { kind: "error", message: "Not allowed" };
      return r;
    },
    update: async (petId, input): Promise<ActionResult> => {
      const r = await adminUpdatePet(clientId, petId, input);
      if (r.kind === "forbidden")
        return { kind: "error", message: "Not allowed" };
      return r;
    },
    uploadPhoto: async (petId, file): Promise<ActionResult> => {
      const r = await adminUploadPetPhoto(clientId, petId, file);
      if (r.kind === "forbidden")
        return { kind: "error", message: "Not allowed" };
      return r;
    },
  };

  // Adapt ClientPet[] → PetViewLike[] (ClientPet already has photoUrl)
  const petsForList: PetViewLike[] = pets.map((p) => ({
    id: p.id,
    name: p.name,
    species: p.species,
    breed: p.breed,
    notes: p.notes,
    birthdate: p.birthdate,
    photo_url: null, // photo_url not surfaced on ClientPet; photoUrl is the signed URL
    photoUrl: p.photoUrl,
  }));

  return (
    <Surface as="section" variant="emphasis" className={SECTION}>
      <p className={LEGEND}>
        Pets{" "}
        {pets.length > 0 ? (
          <span className="text-muted-foreground font-normal tracking-normal normal-case">
            ({pets.length})
          </span>
        ) : null}
      </p>
      <PetList
        pets={petsForList}
        onChanged={router.refresh}
        actions={adminPetActions}
        surface="plain"
        // No onDelete → Delete button is suppressed in admin zone
      />
    </Surface>
  );
}
