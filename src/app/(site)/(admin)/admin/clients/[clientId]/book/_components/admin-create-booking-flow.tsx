"use client";

import { useState } from "react";
import { ServicePick, type PickableService } from "./service-pick";
import { AdminCreateBookingClient } from "./admin-create-booking-client";
import type {
  AssignablePet,
  BookingRuleSettings,
  ServiceDetail,
} from "@/features/booking/index.client";
import type { PricingType } from "@/features/pricing";

interface FlowService extends PickableService {
  pricingType: PricingType;
  defaultDurationMin: number | null;
}

export function AdminCreateBookingFlow({
  clientId,
  clientName,
  services,
  pets,
  rules,
}: {
  clientId: string;
  clientName: string;
  services: FlowService[];
  pets: AssignablePet[];
  rules: BookingRuleSettings;
}) {
  const [picked, setPicked] = useState<FlowService | null>(null);

  if (!picked) {
    return (
      <ServicePick
        services={services}
        onPick={(slug) =>
          setPicked(services.find((s) => s.slug === slug) ?? null)
        }
      />
    );
  }

  const service: ServiceDetail = {
    slug: picked.slug,
    name: picked.name,
    description: picked.description,
    pricingType: picked.pricingType,
    defaultDurationMin: picked.defaultDurationMin,
  };

  return (
    <AdminCreateBookingClient
      clientId={clientId}
      clientName={clientName}
      service={service}
      rules={rules}
      initialBusy={[]}
      pets={pets}
    />
  );
}
