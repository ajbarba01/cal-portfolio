"use client";

import { useRouter } from "next/navigation";
import { Surface } from "@/components/ui/surface";
import {
  adminSubmitForm,
  type ClientDetailView,
} from "@/features/admin/index.client";
import { FormCard } from "@/features/accounts/index.client";
import { SECTION, LEGEND } from "./shared";

interface ClientFormsProps {
  clientId: string;
  forms: ClientDetailView["forms"];
  pets: ClientDetailView["pets"];
}

/** The client's submitted intake forms, editable on their behalf. */
export function ClientForms({ clientId, forms, pets }: ClientFormsProps) {
  const router = useRouter();

  return (
    <Surface as="section" variant="emphasis" className={SECTION}>
      <p className={LEGEND}>
        Forms{" "}
        {forms.length > 0 ? (
          <span className="text-muted-foreground font-normal tracking-normal normal-case">
            ({forms.length} on file)
          </span>
        ) : null}
      </p>
      {forms.length === 0 ? (
        <p className="text-muted-foreground text-sm">No forms on file.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {forms.map((form) => {
            const pet = form.pet_id
              ? pets.find((p) => p.id === form.pet_id)
              : undefined;
            return (
              <FormCard
                key={form.id}
                formKey={form.form_key}
                petId={form.pet_id}
                species={pet?.species}
                title={pet ? `${pet.name} — care details` : undefined}
                // The stored response is a jsonb column, so it arrives as
                // `unknown`; FormCard prefills field by field and ignores
                // whatever it does not recognise.
                existing={{ data: form.data as Record<string, unknown> }}
                onSubmit={async (fk, vals, pid) => {
                  const r = await adminSubmitForm(clientId, fk, vals, pid);
                  if (r.kind === "forbidden") {
                    return { kind: "error", message: "Not allowed" };
                  }
                  if (r.kind === "success") {
                    router.refresh();
                    return { kind: "success" };
                  }
                  return r;
                }}
              />
            );
          })}
        </div>
      )}
    </Surface>
  );
}
