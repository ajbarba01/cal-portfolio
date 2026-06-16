"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FIELD_LIMITS } from "@/lib/field-limits";
import { Switch } from "@/components/ui/switch";
import {
  updateService,
  type ServiceAdminRow,
  pricingFields,
  fieldsToConfig,
  type PricingField,
} from "@/features/admin";
import type { PricingType } from "@/features/pricing";

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
// Unit field row — bordered row with leading $ or trailing unit
// ---------------------------------------------------------------------------

interface UnitFieldProps {
  id: string;
  label: string;
  leadingUnit?: string;
  trailingUnit?: string;
  value: string;
  onChange: (raw: string) => void;
}

function UnitField({
  id,
  label,
  leadingUnit,
  trailingUnit,
  value,
  onChange,
}: UnitFieldProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-muted-foreground text-xs">
        {label}
      </Label>
      <div className="bg-background flex h-9 items-center gap-1.5 rounded-md border px-2.5">
        {leadingUnit && (
          <span className="text-muted-foreground text-sm select-none">
            {leadingUnit}
          </span>
        )}
        <input
          id={id}
          type="number"
          min={0}
          step={leadingUnit === "$" ? "0.01" : "1"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-background min-w-0 flex-1 border-0 text-sm focus:outline-none"
        />
        {trailingUnit && (
          <span className="text-muted-foreground text-xs whitespace-nowrap select-none">
            {trailingUnit}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-field display: converts PricingField → controlled input string
// ---------------------------------------------------------------------------

function fieldDisplayValue(field: PricingField): string {
  if (field.kind === "cents") {
    return (field.value / 100).toFixed(2);
  }
  return String(field.value);
}

function fieldFromDisplay(field: PricingField, raw: string): PricingField {
  const parsed = parseFloat(raw);
  if (isNaN(parsed)) return field;
  if (field.kind === "cents") {
    return { ...field, value: Math.round(parsed * 100) };
  }
  return { ...field, value: Math.round(parsed) };
}

// ---------------------------------------------------------------------------
// Pricing fields grid
// ---------------------------------------------------------------------------

interface PricingFieldsGridProps {
  serviceId: string;
  pricingType: PricingType;
  fields: PricingField[];
  onChange: (updated: PricingField[]) => void;
}

function PricingFieldsGrid({
  serviceId,
  pricingType,
  fields,
  onChange,
}: PricingFieldsGridProps) {
  if (pricingType === "meet_greet") {
    return (
      <p className="text-muted-foreground text-sm italic">
        Free — no priced fields.
      </p>
    );
  }

  function handleChange(index: number, raw: string) {
    const updated = fields.map((f, i) =>
      i === index ? fieldFromDisplay(f, raw) : f,
    );
    onChange(updated);
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map((field, i) => {
        const inputId = `field-${serviceId}-${field.key}`;
        if (field.kind === "cents") {
          return (
            <UnitField
              key={field.key}
              id={inputId}
              label={field.label}
              leadingUnit="$"
              value={fieldDisplayValue(field)}
              onChange={(raw) => handleChange(i, raw)}
            />
          );
        }
        if (field.kind === "pct") {
          return (
            <UnitField
              key={field.key}
              id={inputId}
              label={field.label}
              trailingUnit="%"
              value={fieldDisplayValue(field)}
              onChange={(raw) => handleChange(i, raw)}
            />
          );
        }
        // int
        return (
          <UnitField
            key={field.key}
            id={inputId}
            label={field.label}
            value={fieldDisplayValue(field)}
            onChange={(raw) => handleChange(i, raw)}
          />
        );
      })}
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
  fields: PricingField[];
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
      fields: pricingFields(
        svc.pricing_type as PricingType,
        svc.pricing_config as Parameters<typeof pricingFields>[1],
      ),
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

    const config = fieldsToConfig(
      svc.pricing_type as PricingType,
      editState.fields,
      svc.pricing_config as Parameters<typeof fieldsToConfig>[2],
    );

    startTransition(async () => {
      const result = await updateService({
        serviceId: svc.id,
        name: editState.name,
        description: editState.description || null,
        pricing_config: config as Record<string, unknown>,
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

                {/* Pricing fields */}
                <div className="space-y-2">
                  <p className="text-brand-strong text-xs font-semibold tracking-widest uppercase">
                    Pricing
                  </p>
                  <PricingFieldsGrid
                    serviceId={svc.id}
                    pricingType={svc.pricing_type as PricingType}
                    fields={editState.fields}
                    onChange={(fields) =>
                      setEditState((s) => (s ? { ...s, fields } : s))
                    }
                  />
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
