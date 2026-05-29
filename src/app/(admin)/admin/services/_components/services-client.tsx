"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateService } from "@/features/admin/services-actions";
import type { ServiceAdminRow } from "@/features/admin/services-actions";

export function ServicesClient({ services }: { services: ServiceAdminRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pricingConfigRaw, setPricingConfigRaw] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEdit(svc: ServiceAdminRow) {
    setEditingId(svc.id);
    setName(svc.name);
    setDescription(svc.description ?? "");
    setPricingConfigRaw(JSON.stringify(svc.pricing_config, null, 2));
    setRequiresApproval(svc.requires_approval);
    setActive(svc.active);
    setError(null);
    setSuccessId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  async function handleSave(serviceId: string) {
    setError(null);
    let parsedConfig: Record<string, unknown> | undefined;
    try {
      parsedConfig = JSON.parse(pricingConfigRaw) as Record<string, unknown>;
    } catch {
      setError("pricing_config must be valid JSON");
      return;
    }

    startTransition(async () => {
      const result = await updateService({
        serviceId,
        name,
        description: description || null,
        pricing_config: parsedConfig,
        requires_approval: requiresApproval,
        active,
      });
      if (result.kind === "success") {
        setEditingId(null);
        setSuccessId(serviceId);
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
      {services.map((svc) => (
        <li key={svc.id} className="rounded-md border p-4">
          {editingId === svc.id ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor={`name-${svc.id}`}>Name</Label>
                <Input
                  id={`name-${svc.id}`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`desc-${svc.id}`}>Description</Label>
                <Input
                  id={`desc-${svc.id}`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`config-${svc.id}`}>
                  Pricing Config (JSON — type: {svc.pricing_type})
                </Label>
                <textarea
                  id={`config-${svc.id}`}
                  className="bg-background w-full rounded-md border px-3 py-2 font-mono text-sm focus-visible:outline-2"
                  rows={8}
                  value={pricingConfigRaw}
                  onChange={(e) => setPricingConfigRaw(e.target.value)}
                />
              </div>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={requiresApproval}
                    onChange={(e) => setRequiresApproval(e.target.checked)}
                    className="rounded"
                  />
                  Requires Approval
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="rounded"
                  />
                  Active
                </label>
              </div>
              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button onClick={() => handleSave(svc.id)} disabled={isPending}>
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
      ))}
    </ul>
  );
}
