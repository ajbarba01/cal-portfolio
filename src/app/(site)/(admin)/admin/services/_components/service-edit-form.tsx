"use client";

import { useMemo, useState, useTransition } from "react";
import { ZodError } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FIELD_LIMITS } from "@/lib/field-limits";
import {
  updateService,
  validateEditableFields,
  type ServiceAdminRow,
} from "@/features/admin";
import { parsePricingConfig } from "@/features/pricing";
import type { ServicePricingConfig } from "@/features/pricing";
import { PricingFieldsEditor } from "./pricing-fields-editor";

/** Maps a ZodError from parsePricingConfig back onto field paths (backstop). */
function zodToFieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const p = issue.path;
    if (p[0] === "constraints" && typeof p[1] === "string") {
      out[`c.${String(p[1])}`] = issue.message;
    } else if (p[0] === "modifiers" && typeof p[1] === "number") {
      out[
        p[2] === "tiers"
          ? `m.${String(p[1])}.tiers.${String(p[3])}.${String(p[4])}`
          : `m.${String(p[1])}.${String(p[2])}`
      ] = issue.message;
    } else {
      out._form = issue.message;
    }
  }
  return out;
}

export function ServiceEditForm({
  service,
  onCancel,
  onSaved,
}: {
  service: ServiceAdminRow;
  onCancel: () => void;
  onSaved: (serviceId: string) => void;
}) {
  // Parse the seeded config once. An unparseable (legacy) row → pricing is
  // read-only; name/description/toggles stay editable.
  const initialConfig = useMemo<ServicePricingConfig | null>(() => {
    try {
      return parsePricingConfig(service.pricing_config);
    } catch {
      return null;
    }
  }, [service.pricing_config]);

  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? "");
  const [requiresApproval, setRequiresApproval] = useState(
    service.requires_approval,
  );
  const [active, setActive] = useState(service.active);
  const [config, setConfig] = useState<ServicePricingConfig | null>(
    initialConfig,
  );
  const [defaultDurationMin, setDefaultDurationMin] = useState<number | null>(
    service.default_duration_min,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setErrors({});

    // Pricing is only sent when the config parsed (editable). Validate + send.
    let pricingConfig: ServicePricingConfig | undefined;
    if (config) {
      const fieldErrors = validateEditableFields(config, defaultDurationMin);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
        return;
      }
      try {
        parsePricingConfig(config);
      } catch (e) {
        if (e instanceof ZodError) {
          setErrors(zodToFieldErrors(e));
          return;
        }
        setErrors({ _form: "Invalid pricing configuration." });
        return;
      }
      pricingConfig = config;
    }

    startTransition(async () => {
      const result = await updateService({
        serviceId: service.id,
        name,
        description: description || null,
        requires_approval: requiresApproval,
        active,
        ...(pricingConfig
          ? {
              pricing_config: pricingConfig as unknown as Record<
                string,
                unknown
              >,
              default_duration_min: defaultDurationMin ?? undefined,
            }
          : {}),
      });
      if (result.kind === "success") {
        onSaved(service.id);
      } else {
        setErrors({
          _form:
            "message" in result
              ? result.message
              : `Couldn't save: ${result.kind}`,
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="font-medium">{service.name}</span>
        <span className="text-muted-foreground bg-muted rounded px-2 py-0.5 text-xs tracking-wide lowercase">
          type: {service.pricing_type}
        </span>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`name-${service.id}`}>Name</Label>
        <Input
          id={`name-${service.id}`}
          maxLength={FIELD_LIMITS.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`desc-${service.id}`}>Description</Label>
        <Input
          id={`desc-${service.id}`}
          maxLength={FIELD_LIMITS.note}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <p className="text-brand-strong text-xs font-semibold tracking-widest uppercase">
          Pricing
        </p>
        {config ? (
          <PricingFieldsEditor
            config={config}
            defaultDurationMin={defaultDurationMin}
            onConfigChange={setConfig}
            onDefaultDurationChange={setDefaultDurationMin}
            errors={errors}
          />
        ) : (
          <p className="text-muted-foreground text-sm italic">
            This service&apos;s pricing is in an older format and can&apos;t be
            edited here. (Type: {service.pricing_type})
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-3">
          <Switch
            checked={requiresApproval}
            onCheckedChange={setRequiresApproval}
            disabled={isPending}
            aria-label="Requires approval"
          />
          <span className="text-sm font-medium">Requires approval</span>
        </label>
        <label className="flex items-center gap-3">
          <Switch
            checked={active}
            onCheckedChange={setActive}
            disabled={isPending}
            aria-label="Active"
          />
          <span className="text-sm font-medium">Active</span>
        </label>
      </div>

      {errors._form && (
        <p role="alert" className="text-destructive text-sm">
          {errors._form}
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
