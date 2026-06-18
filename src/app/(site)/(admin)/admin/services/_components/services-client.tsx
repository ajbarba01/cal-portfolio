"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type ServiceAdminRow } from "@/features/admin";
import { ServiceEditForm } from "./service-edit-form";

export function ServicesClient({ services }: { services: ServiceAdminRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  return (
    <ul className="space-y-6">
      {services.map((svc) => (
        <li key={svc.id} className="rounded-md border p-4">
          {editingId === svc.id ? (
            <ServiceEditForm
              service={svc}
              onCancel={() => setEditingId(null)}
              onSaved={(id) => {
                setEditingId(null);
                setSavedId(id);
              }}
            />
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
                {savedId === svc.id && (
                  <p className="text-muted-foreground text-sm">Saved!</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingId(svc.id);
                  setSavedId(null);
                }}
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
