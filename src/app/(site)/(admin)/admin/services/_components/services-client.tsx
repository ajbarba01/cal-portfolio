"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/feedback/toast";
import { type ServiceAdminRow } from "@/features/admin/index.client";
import { ServiceEditForm } from "./service-edit-form";

export function ServicesClient({ services }: { services: ServiceAdminRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const toast = useToast();

  return (
    <ul className="space-y-6">
      {services.map((svc) => (
        <li key={svc.id} className="rounded-md border p-4">
          {editingId === svc.id ? (
            <ServiceEditForm
              service={svc}
              onCancel={() => setEditingId(null)}
              onSaved={() => {
                // The edit form closes on save, so the confirmation has to
                // outlive it — an announced toast rather than inline text.
                setEditingId(null);
                toast.add({ type: "success", title: "Saved!" });
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
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingId(svc.id)}
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
