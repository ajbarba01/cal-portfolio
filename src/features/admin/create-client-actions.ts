"use server";

/**
 * Admin "pre-create client" + "generate claim link" actions.
 *
 * createUnclaimedClient mints a real auth.users row with NO password (a shadow
 * account), then flags its profile `unclaimed = true`. The client can be
 * approved / form-filled / booked-for via the existing on-behalf flows. Later,
 * Cal generates a one-time claim link the client uses to set a password.
 *
 * SECURITY: assertActorIsAdmin fires before any read/write; the service client
 * (RLS bypass) is used only after that check. Identity from the session.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "@/lib/admin-guard";
import { getActorOrRedirect } from "@/lib/admin-session";
import { defaultGeocoder, type Geocoder } from "@/features/pricing";
import { onboardingStatusSchema } from "@/features/booking";
import { FIELD_LIMITS } from "@/lib/field-limits";

// Private (a "use server" file may export only async functions — schemas stay
// module-local; mirror onbehalf-actions.ts).
const createClientInputSchema = z.object({
  email: z.string().email("A valid email is required").max(FIELD_LIMITS.email),
  fullName: z.string().min(1, "Name is required").max(FIELD_LIMITS.name),
  phone: z
    .string()
    .max(FIELD_LIMITS.phone)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  address: z
    .string()
    .max(FIELD_LIMITS.addressLine)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  zip: z
    .string()
    .max(FIELD_LIMITS.zip)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  onboardingStatus: onboardingStatusSchema,
});

export type CreateClientInput = z.infer<typeof createClientInputSchema>;

export type CreateClientResult =
  | { kind: "success"; clientId: string }
  | { kind: "forbidden" }
  | { kind: "validation_error"; message: string }
  | { kind: "email_exists"; clientId: string | null }
  | { kind: "error"; message: string };

export interface CreateClientDeps {
  serviceClient: SupabaseClient;
  actorUserId: string;
  geocoder?: Geocoder;
}

/** True if a Supabase admin createUser error means the email is already taken. */
function isDuplicateEmailError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("already been registered") ||
    m.includes("already registered") ||
    m.includes("duplicate")
  );
}

export async function createUnclaimedClientCore(
  deps: CreateClientDeps,
  rawInput: CreateClientInput,
): Promise<CreateClientResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }

  const parsed = createClientInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      kind: "validation_error",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  const input = parsed.data;
  const { serviceClient, geocoder = defaultGeocoder } = deps;

  // 1. Mint the auth user with NO password (email pre-confirmed). The
  //    handle_new_user trigger creates the profile row.
  const { data: created, error: createErr } =
    await serviceClient.auth.admin.createUser({
      email: input.email,
      email_confirm: true,
    });

  if (createErr || !created.user) {
    const msg = createErr?.message ?? "Could not create the account.";
    if (createErr && isDuplicateEmailError(msg)) {
      // Surface the existing client so the UI can link to them.
      const { data: existing } = await serviceClient
        .from("profiles")
        .select("id")
        .eq("email", input.email)
        .maybeSingle();
      return {
        kind: "email_exists",
        clientId: (existing?.id as string | undefined) ?? null,
      };
    }
    return { kind: "error", message: msg };
  }

  const clientId = created.user.id;

  // 2. Geocode the ZIP once (best-effort — unknown ZIP must not block).
  const latLng = input.zip ? await geocoder.geocode(input.zip) : null;

  // 3. Fill the profile + flag unclaimed (service role bypasses the column grant).
  const { error: profileErr } = await serviceClient
    .from("profiles")
    .update({
      full_name: input.fullName,
      phone: input.phone ?? null,
      address: input.address ?? null,
      zip: input.zip ?? null,
      lat: latLng?.lat ?? null,
      lng: latLng?.lng ?? null,
      onboarding_status: input.onboardingStatus,
      unclaimed: true,
    })
    .eq("id", clientId);

  if (profileErr) {
    return { kind: "error", message: profileErr.message };
  }

  return { kind: "success", clientId };
}

export async function createUnclaimedClient(
  input: CreateClientInput,
): Promise<CreateClientResult> {
  const actorUserId = await getActorOrRedirect();
  const result = await createUnclaimedClientCore(
    { serviceClient: createServiceClient(), actorUserId },
    input,
  );
  if (result.kind === "success") revalidatePath("/admin/clients");
  return result;
}

export type GenerateClaimLinkResult =
  | { kind: "success"; url: string }
  | { kind: "forbidden" }
  | { kind: "not_unclaimed" }
  | { kind: "error"; message: string };

export interface GenerateClaimLinkDeps {
  serviceClient: SupabaseClient;
  actorUserId: string;
  /** Site origin (e.g. https://calbarba.com) used to build the redirect target. */
  origin: string;
}

export async function generateClaimLinkCore(
  deps: GenerateClaimLinkDeps,
  clientId: string,
): Promise<GenerateClaimLinkResult> {
  const { serviceClient, actorUserId, origin } = deps;
  if (!(await assertActorIsAdmin(serviceClient, actorUserId))) {
    return { kind: "forbidden" };
  }

  const { data: profile, error: readErr } = await serviceClient
    .from("profiles")
    .select("email, unclaimed")
    .eq("id", clientId)
    .maybeSingle();
  if (readErr) return { kind: "error", message: readErr.message };
  if (!profile?.email)
    return { kind: "error", message: "Client has no email." };
  if (profile.unclaimed !== true) return { kind: "not_unclaimed" };

  // Invite link → set-password landing. redirectTo routes through the existing
  // /auth/callback (code exchange) with next=/claim so the claim page runs with
  // an authenticated session.
  const redirectTo = `${origin}/auth/callback?next=/claim`;
  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: "invite",
    email: profile.email as string,
    options: { redirectTo },
  });
  if (error || !data.properties?.action_link) {
    return {
      kind: "error",
      message: error?.message ?? "Could not generate a link.",
    };
  }

  await serviceClient
    .from("profiles")
    .update({ invited_at: new Date().toISOString() })
    .eq("id", clientId);

  return { kind: "success", url: data.properties.action_link };
}

export async function generateClaimLink(
  clientId: string,
): Promise<GenerateClaimLinkResult> {
  const actorUserId = await getActorOrRedirect();
  const hdrs = await headers();
  const origin =
    hdrs.get("origin") ??
    (hdrs.get("host") ? `https://${hdrs.get("host")}` : "");
  const result = await generateClaimLinkCore(
    { serviceClient: createServiceClient(), actorUserId, origin },
    clientId,
  );
  if (result.kind === "success") revalidatePath(`/admin/clients/${clientId}`);
  return result;
}
