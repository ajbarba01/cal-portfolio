"use client";

import {
  submitForm,
  acceptAuthorization,
  FormCard,
  EXPENSE_AUTH_KIND,
  EXPENSE_AUTH_VERSION,
  EXPENSE_AUTH_TEXT,
  type AuthConfig,
} from "@/features/accounts/index.client";
import { Eyebrow } from "@/components/marketing/eyebrow";
import type { FormResponseRow, PetRef } from "../page";

interface FormsClientProps {
  owner: FormResponseRow | undefined;
  home: FormResponseRow | undefined;
  pets: PetRef[];
  petResponses: Record<string, FormResponseRow>;
  acceptedAuthVersion: string | null;
  acceptedAuthAt: string | null;
}

export function FormsClient({
  owner,
  home,
  pets,
  petResponses,
  acceptedAuthVersion,
  acceptedAuthAt,
}: FormsClientProps) {
  const ownerAuth: AuthConfig = {
    acceptedVersion: acceptedAuthVersion,
    acceptedAt: acceptedAuthAt,
    currentVersion: EXPENSE_AUTH_VERSION,
    text: EXPENSE_AUTH_TEXT,
    onAccept: (acceptedName) =>
      acceptAuthorization({
        kind: EXPENSE_AUTH_KIND,
        version: EXPENSE_AUTH_VERSION,
        acceptedName,
      }),
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <Eyebrow>Account</Eyebrow>
        <FormCard
          formKey="owner"
          existing={owner}
          onSubmit={submitForm}
          auth={ownerAuth}
        />
        <FormCard formKey="home" existing={home} onSubmit={submitForm} />
      </section>

      <section className="flex flex-col gap-4">
        <Eyebrow>Pets</Eyebrow>
        {pets.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Add a pet from your account to set up its care profile.
          </p>
        ) : (
          pets.map((pet) => (
            <FormCard
              key={pet.id}
              formKey="pet"
              petId={pet.id}
              title={`${pet.name} — care details`}
              existing={petResponses[pet.id]}
              onSubmit={submitForm}
            />
          ))
        )}
      </section>
    </div>
  );
}
