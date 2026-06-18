"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FIELD_LIMITS } from "@/lib/field-limits";
import { Switch } from "@/components/ui/switch";
import { updateService, type ServiceAdminRow } from "@/features/admin";

// ---------------------------------------------------------------------------
// Labelled switch row — wraps the shared Switch primitive with its caption
// ---------------------------------------------------------------------------

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

function SwitchToggle({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <div className="flex items-center gap-3">
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={label}
      />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ServicesClient
// ---------------------------------------------------------------------------

interface EditState {
  serviceId: string;
  name: string;
  description: string;
  requiresApproval: boolean;
  active: boolean;
}

export function ServicesClient({ services }: { services: ServiceAdminRow[] }) {
  const [editState, setEditState] = useState<EditState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEdit(svc: ServiceAdminRow) {
    setEditState({
      serviceId: svc.id,
      name: svc.name,
      description: svc.description ?? "",
      requiresApproval: svc.requires_approval,
      active: svc.active,
    });
    setError(null);
    setSuccessId(null);
  }

  function cancelEdit() {
    setEditState(null);
    setError(null);
  }

  function handleSave(svc: ServiceAdminRow) {
    if (!editState) return;
    setError(null);

    // pricing_config intentionally omitted — the seeded {modifiers, constraints}
    // shape is validated by parsePricingConfig in updateServiceCore; the old
    // fieldsToConfig output would fail that validation. Phase 4 will rebuild
    // the editor to emit the correct shape.
    startTransition(async () => {
      const result = await updateService({
        serviceId: svc.id,
        name: editState.name,
        description: editState.description || null,
        requires_approval: editState.requiresApproval,
        active: editState.active,
      });
      if (result.kind === "success") {
        setEditState(null);
        setSuccessId(svc.id);
      } else {
        setError(
          "message" in result
            ? result.message
            : `Action failed: ${result.kind}`,
        );
      }
    });
  }

  return (
    <ul className="space-y-6">
      {services.map((svc) => {
        const isEditing = editState?.serviceId === svc.id;

        return (
          <li key={svc.id} className="rounded-md border p-4">
            {isEditing && editState ? (
              <div className="space-y-4">
                {/* Service type badge */}
                <div className="flex items-center gap-2">
                  <span className="font-medium">{svc.name}</span>
                  <span className="text-muted-foreground bg-muted rounded px-2 py-0.5 text-xs tracking-wide lowercase">
                    type: {svc.pricing_type}
                  </span>
                </div>

                {/* Name */}
                <div className="space-y-1">
                  <Label htmlFor={`name-${svc.id}`}>Name</Label>
                  <Input
                    id={`name-${svc.id}`}
                    maxLength={FIELD_LIMITS.name}
                    value={editState.name}
                    onChange={(e) =>
                      setEditState((s) =>
                        s ? { ...s, name: e.target.value } : s,
                      )
                    }
                  />
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <Label htmlFor={`desc-${svc.id}`}>Description</Label>
                  <Input
                    id={`desc-${svc.id}`}
                    maxLength={FIELD_LIMITS.note}
                    value={editState.description}
                    onChange={(e) =>
                      setEditState((s) =>
                        s ? { ...s, description: e.target.value } : s,
                      )
                    }
                  />
                </div>

                {/* Pricing — read-only note until Phase 4 modifier-aware editor */}
                <div className="space-y-2">
                  <p className="text-brand-strong text-xs font-semibold tracking-widest uppercase">
                    Pricing
                  </p>
                  {/* TODO Phase 4: rebuild editor to emit {modifiers, constraints} shape */}
                  <p className="text-muted-foreground text-sm italic">
                    Pricing is configured in the seed/migration and isn&apos;t
                    editable here yet — a modifier-aware editor lands in Phase
                    4. (Type: {svc.pricing_type})
                  </p>
                </div>

                {/* Toggles */}
                <div className="flex flex-wrap gap-5">
                  <SwitchToggle
                    checked={editState.requiresApproval}
                    onChange={(val) =>
                      setEditState((s) =>
                        s ? { ...s, requiresApproval: val } : s,
                      )
                    }
                    label="Requires approval"
                    disabled={isPending}
                  />
                  <SwitchToggle
                    checked={editState.active}
                    onChange={(val) =>
                      setEditState((s) => (s ? { ...s, active: val } : s))
                    }
                    label="Active"
                    disabled={isPending}
                  />
                </div>

                {error && (
                  <p role="alert" className="text-destructive text-sm">
                    {error}
                  </p>
                )}

                <div className="flex gap-2">
                  <Button onClick={() => handleSave(svc)} disabled={isPending}>
                    {isPending ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={cancelEdit}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div className="text-sm">
                  <p className="font-medium">{svc.name}</p>
                  <p className="text-muted-foreground">
                    {svc.pricing_type} · {svc.concurrency} ·{" "}
                    {svc.active ? "active" : "inactive"}
                  </p>
                  {svc.description && (
                    <p className="text-muted-foreground">{svc.description}</p>
                  )}
                  {successId === svc.id && (
                    <p className="text-muted-foreground text-sm">Saved!</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startEdit(svc)}
                >
                  Edit
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
