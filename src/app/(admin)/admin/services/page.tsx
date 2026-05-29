/**
 * Admin services editor — server component.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { listServicesCore } from "@/features/admin/services-actions";
import { ServicesClient } from "./_components/services-client";

export default async function AdminServicesPage() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  const serviceClient = createServiceClient();
  const result = await listServicesCore({
    serviceClient,
    actorUserId: user!.id,
  });

  if (result.kind === "forbidden") {
    return <p className="text-destructive p-8">Access denied.</p>;
  }

  if (result.kind === "error") {
    return (
      <p className="text-destructive p-8">
        Failed to load services: {result.message}
      </p>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Services Editor</h1>
      <ServicesClient services={result.services} />
    </main>
  );
}
