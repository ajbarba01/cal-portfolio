"use server";

/**
 * Inquiry server actions. Public submission uses service role for rate-limit
 * reads; admin queue actions require an authoritative admin-role check.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertActorIsAdmin } from "@/lib/admin-guard";
import { getActorOrRedirect } from "@/lib/admin-session";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

import { canEditInquiry } from "./inquiry-list";
import {
  editInquirySchema,
  submitInquirySchema,
  type EditInquiryInput,
  type SubmitInquiryInput,
} from "./inquiry-schema";

const RATE_LIMIT_WINDOW_MS = 60_000;

export type InquirySubmitResult = { ok: true } | { ok: false; error: string };

export interface InquiryRow {
  id: string;
  client_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: "new" | "resolved";
  replied_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

const inquiryRowSchema = z.object({
  id: z.string(),
  client_id: z.string().nullable(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  subject: z.string().nullable(),
  message: z.string(),
  status: z.enum(["new", "resolved"]),
  replied_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
  created_at: z.string(),
});

export type ListInquiriesResult =
  | { kind: "success"; inquiries: InquiryRow[] }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

export type InquiryMutationResult =
  | { kind: "success" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

export interface AdminDeps {
  serviceClient: SupabaseClient;
  actorUserId: string;
}

export interface ClientDeps {
  serviceClient: SupabaseClient;
  /** The authenticated client's user id; ownership is enforced against this. */
  actorUserId: string;
}

const inquiryGuardSchema = z.object({
  client_id: z.string().nullable(),
  status: z.enum(["new", "resolved"]),
  replied_at: z.string().nullable(),
});

export async function submitInquiryCore(
  serviceClient: SupabaseClient,
  userId: string | null,
  rawInput: SubmitInquiryInput,
): Promise<InquirySubmitResult> {
  const parsed = submitInquirySchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((issue) => issue.message).join("; "),
    };
  }
  const input = parsed.data;

  if (input.company && input.company.length > 0) return { ok: true };

  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error: countError } = await serviceClient
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq("email", input.email)
    .gte("created_at", cutoff);
  if (countError) return { ok: false, error: countError.message };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error:
        "You just sent a message - please wait a moment before sending another.",
    };
  }

  const { error } = await serviceClient.from("inquiries").insert({
    client_id: userId,
    name: input.name,
    email: input.email,
    phone: input.phone ? input.phone : null,
    subject: input.subject ? input.subject : null,
    message: input.message,
    status: "new" as const,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function submitInquiry(
  input: SubmitInquiryInput,
): Promise<InquirySubmitResult> {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  return submitInquiryCore(createServiceClient(), user?.id ?? null, input);
}

export async function listInquiriesCore(
  deps: AdminDeps,
): Promise<ListInquiriesResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }

  const { data, error } = await deps.serviceClient
    .from("inquiries")
    .select(
      "id, client_id, name, email, phone, subject, message, status, replied_at, resolved_at, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) return { kind: "error", message: error.message };

  const inquiries: InquiryRow[] = [];
  for (const row of data ?? []) {
    const parsed = inquiryRowSchema.safeParse(row);
    if (!parsed.success) {
      return {
        kind: "error",
        message: `Bad inquiry row: ${parsed.error.message}`,
      };
    }
    inquiries.push(parsed.data);
  }

  inquiries.sort((first, second) => {
    if (first.status !== second.status) return first.status === "new" ? -1 : 1;
    return second.created_at.localeCompare(first.created_at);
  });
  return { kind: "success", inquiries };
}

export async function markInquiryResolvedCore(
  deps: AdminDeps,
  inquiryId: string,
): Promise<InquiryMutationResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }
  const { error } = await deps.serviceClient
    .from("inquiries")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", inquiryId);
  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

export async function stampInquiryRepliedCore(
  deps: AdminDeps,
  inquiryId: string,
): Promise<InquiryMutationResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }
  const { error } = await deps.serviceClient
    .from("inquiries")
    .update({ replied_at: new Date().toISOString() })
    .eq("id", inquiryId);
  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

export async function resolveMyInquiryCore(
  deps: ClientDeps,
  inquiryId: string,
): Promise<InquiryMutationResult> {
  const { data, error } = await deps.serviceClient
    .from("inquiries")
    .select("client_id, status, replied_at")
    .eq("id", inquiryId)
    .maybeSingle();
  if (error) return { kind: "error", message: error.message };
  if (!data) return { kind: "not_found" };

  const guard = inquiryGuardSchema.safeParse(data);
  if (!guard.success) return { kind: "error", message: "Bad inquiry row." };
  if (guard.data.client_id !== deps.actorUserId) return { kind: "forbidden" };

  const { error: updateError } = await deps.serviceClient
    .from("inquiries")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", inquiryId)
    .eq("client_id", deps.actorUserId);
  if (updateError) return { kind: "error", message: updateError.message };
  return { kind: "success" };
}

export async function editMyInquiryCore(
  deps: ClientDeps,
  inquiryId: string,
  rawInput: EditInquiryInput,
): Promise<InquiryMutationResult> {
  const parsed = editInquirySchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      kind: "error",
      message: parsed.error.issues.map((issue) => issue.message).join("; "),
    };
  }
  const input = parsed.data;

  const { data, error } = await deps.serviceClient
    .from("inquiries")
    .select("client_id, status, replied_at")
    .eq("id", inquiryId)
    .maybeSingle();
  if (error) return { kind: "error", message: error.message };
  if (!data) return { kind: "not_found" };

  const guard = inquiryGuardSchema.safeParse(data);
  if (!guard.success) return { kind: "error", message: "Bad inquiry row." };
  if (guard.data.client_id !== deps.actorUserId) return { kind: "forbidden" };
  if (!canEditInquiry(guard.data)) {
    return { kind: "error", message: "This inquiry can no longer be edited." };
  }

  const { error: updateError } = await deps.serviceClient
    .from("inquiries")
    .update({
      subject: input.subject ? input.subject : null,
      message: input.message,
    })
    .eq("id", inquiryId)
    .eq("client_id", deps.actorUserId);
  if (updateError) return { kind: "error", message: updateError.message };
  return { kind: "success" };
}

export async function listInquiries(): Promise<ListInquiriesResult> {
  const actorUserId = await getActorOrRedirect();
  return listInquiriesCore({
    serviceClient: createServiceClient(),
    actorUserId,
  });
}

export async function markInquiryResolved(
  inquiryId: string,
): Promise<InquiryMutationResult> {
  const actorUserId = await getActorOrRedirect();
  const result = await markInquiryResolvedCore(
    { serviceClient: createServiceClient(), actorUserId },
    inquiryId,
  );
  if (result.kind === "success") revalidatePath("/admin/inquiries");
  return result;
}

export async function stampInquiryReplied(
  inquiryId: string,
): Promise<InquiryMutationResult> {
  const actorUserId = await getActorOrRedirect();
  const result = await stampInquiryRepliedCore(
    { serviceClient: createServiceClient(), actorUserId },
    inquiryId,
  );
  if (result.kind === "success") revalidatePath("/admin/inquiries");
  return result;
}

async function currentUserId(): Promise<string | null> {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  return user?.id ?? null;
}

export async function resolveMyInquiry(
  inquiryId: string,
): Promise<InquiryMutationResult> {
  const actorUserId = await currentUserId();
  if (!actorUserId) return { kind: "forbidden" };
  const result = await resolveMyInquiryCore(
    { serviceClient: createServiceClient(), actorUserId },
    inquiryId,
  );
  if (result.kind === "success") revalidatePath("/account/inquiries");
  return result;
}

export async function editMyInquiry(
  inquiryId: string,
  input: EditInquiryInput,
): Promise<InquiryMutationResult> {
  const actorUserId = await currentUserId();
  if (!actorUserId) return { kind: "forbidden" };
  const result = await editMyInquiryCore(
    { serviceClient: createServiceClient(), actorUserId },
    inquiryId,
    input,
  );
  if (result.kind === "success") revalidatePath("/account/inquiries");
  return result;
}
