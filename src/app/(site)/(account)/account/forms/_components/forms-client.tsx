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
import {
  servicesRequiring,
  type RequiredFormKey,
} from "@/features/booking/index.client";
import { Eyebrow } from "@/components/marketing/eyebrow";
import type { FormResponseRow, PetRef } from "../page";

// ─── Service label map ────────────────────────────────────────────────────────

const SERVICE_LABELS: Record<string, string> = {
  house_sitting: "House-sitting",
  check_in: "Check-ins",
  walk: "Dog walks",
  training: "Training",
  meet_greet: "Meet & greet",
};

// ─── RequiredFor caption ──────────────────────────────────────────────────────

function RequiredFor({ formKey }: { formKey: RequiredFormKey }) {
  const services = servicesRequiring(formKey)
    .map((s) => SERVICE_LABELS[s])
    .filter(Boolean);
  if (services.length === 0) return null;
  return (
    <p className="text-muted-foreground text-xs">
      Required for: {services.join(", ")}
    </p>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface FormsClientProps {
  owner: FormResponseRow | undefined;
  homeAccess: FormResponseRow | undefined;
  homeSitting: FormResponseRow | undefined;
  pets: PetRef[];
  petResponses: Record<string, FormResponseRow>;
  acceptedAuthVersion: string | null;
  acceptedAuthAt: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FormsClient({
  owner,
  homeAccess,
  homeSitting,
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
      {/* ── Account forms ── */}
      <section className="flex flex-col gap-4">
        <Eyebrow>Account</Eyebrow>
        <div className="flex flex-col gap-1">
          <FormCard
            formKey="owner"
            existing={owner}
            onSubmit={submitForm}
            auth={ownerAuth}
          />
          <RequiredFor formKey="owner" />
        </div>
        <div className="flex flex-col gap-1">
          <FormCard
            formKey="home_access"
            existing={homeAccess}
            onSubmit={submitForm}
          />
          <RequiredFor formKey="home_access" />
        </div>
        <div className="flex flex-col gap-1">
          <FormCard
            formKey="home_sitting"
            existing={homeSitting}
            onSubmit={submitForm}
          />
          <RequiredFor formKey="home_sitting" />
        </div>
      </section>

      {/* ── Per-pet groups ── */}
      <section className="flex flex-col gap-6">
        <Eyebrow>Pets</Eyebrow>
        {pets.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Add a pet from your account to set up its care profile.
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            {pets.map((pet) => (
              <section
                key={pet.id}
                aria-label={`${pet.name} forms`}
                className="flex flex-col gap-3"
              >
                {/* Pet group header */}
                <div className="border-border/60 flex flex-col gap-0.5 border-b pb-2">
                  <h3 className="font-heading text-foreground text-lg leading-snug font-semibold">
                    {pet.name}
                  </h3>
                  <p className="text-muted-foreground text-xs capitalize">
                    {pet.species}
                  </p>
                </div>

                {/* Pet cards */}
                <div className="flex flex-col gap-1">
                  <FormCard
                    formKey="pet_care"
                    petId={pet.id}
                    title={`${pet.name} — care details`}
                    existing={petResponses[`pet_care:${pet.id}`]}
                    onSubmit={submitForm}
                  />
                  <RequiredFor formKey="pet_care" />
                </div>
                {pet.species === "dog" && (
                  <div className="flex flex-col gap-1">
                    <FormCard
                      formKey="pet_walk"
                      petId={pet.id}
                      title={`${pet.name} — walks & outings`}
                      existing={petResponses[`pet_walk:${pet.id}`]}
                      onSubmit={submitForm}
                    />
                    <RequiredFor formKey="pet_walk" />
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
