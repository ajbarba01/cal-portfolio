"use client";

import { useRouter } from "next/navigation";
import { deletePet, PetList } from "@/features/accounts/index.client";
import type { PetView } from "../page";

// ─── Pets wrapper ─────────────────────────────────────────────────────────────

export function PetsClient({ pets }: { pets: PetView[] }) {
  const router = useRouter();

  // Re-pull server data (fresh ids + signed photo URLs) after any mutation.
  const refresh = () => router.refresh();

  return <PetList pets={pets} onChanged={refresh} onDelete={deletePet} />;
}
