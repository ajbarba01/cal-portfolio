"use server";

/**
 * Inquiry server actions. Public submission uses service role for rate-limit
 * reads; admin queue actions require an authoritative admin-role check.
 */

import type { DbClient } from "@/lib/supabase/db-client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { notifyAdmin } from "@/features/notifications";
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

/** One message per email address per minute — the burst guard. */
const EMAIL_WINDOW_MS = 60_000;

/**
 * A signed-in sender may vary the email field freely, so their submissions are
 * also capped by account. Deliberately keyed to the session: an unkeyed window
 * would let one spammer lock every other sender out of the contact form.
 */
const SESSION_WINDOW_MS = 60 * 60 * 1000;
const SESSION_WINDOW_MAX = 5;

/** Static failure text; raw database messages never reach a caller. */
const GENERIC_ERROR = "Something went wrong. Please try again.";

export type InquirySubmitResult = { ok: true } | { ok: false; error: string };

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

/**
 * One inquiry as the admin queue and the client's own list read it. Derived
 * from the schema that parses the row, so the two cannot drift.
 */
export type InquiryRow = z.infer<typeof inquiryRowSchema>;

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
  serviceClient: DbClient;
  actorUserId: string;
}

export interface ClientDeps {
  serviceClient: DbClient;
  /** The authenticated client's user id; ownership is enforced against this. */
  actorUserId: string;
}

const inquiryGuardSchema = z.object({
  client_id: z.string().nullable(),
  status: z.enum(["new", "resolved"]),
  replied_at: z.string().nullable(),
});

/**
 * Inquiries this sender has filed since `windowMs` ago, or null when the count
 * itself failed (the caller must refuse rather than assume zero).
 */
async function recentInquiryCount(
  serviceClient: DbClient,
  column: "email" | "client_id",
  value: string,
  windowMs: number,
): Promise<number | null> {
  const cutoff = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await serviceClient
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .gte("created_at", cutoff);
  if (error) {
    console.error(
      `submitInquiryCore: ${column} rate-limit count failed`,
      error,
    );
    return null;
  }
  return count ?? 0;
}

export async function submitInquiryCore(
  serviceClient: DbClient,
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

  const emailCount = await recentInquiryCount(
    serviceClient,
    "email",
    input.email,
    EMAIL_WINDOW_MS,
  );
  const sessionCount =
    userId === null
      ? 0
      : await recentInquiryCount(
          serviceClient,
          "client_id",
          userId,
          SESSION_WINDOW_MS,
        );
  if (emailCount === null || sessionCount === null) {
    return { ok: false, error: GENERIC_ERROR };
  }
  if (emailCount > 0 || sessionCount >= SESSION_WINDOW_MAX) {
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
  if (error) {
    console.error("submitInquiryCore: insert failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }

  // Cal hears about the message once it is stored, so a honeypot hit — which
  // returns success without inserting — never reaches him. The alert is gated
  // on `ADMIN_NOTIFICATION_EMAIL` and never throws, so a sender's submission
  // does not depend on Cal's copy going out.
  await notifyAdmin({
    type: "inquiry_received",
    payload: {
      name: input.name,
      email: input.email,
      phone: input.phone ? input.phone : null,
      subject: input.subject ? input.subject : null,
      message: input.message,
    },
  });

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

  // window = newest 1000; client search/pager operate on the window.
  const { data, error } = await deps.serviceClient
    .from("inquiries")
    .select(
      "id, client_id, name, email, phone, subject, message, status, replied_at, resolved_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) {
    console.error("listInquiriesCore: query failed", error);
    return { kind: "error", message: GENERIC_ERROR };
  }

  const inquiries: InquiryRow[] = [];
  for (const row of data ?? []) {
    const parsed = inquiryRowSchema.safeParse(row);
    if (!parsed.success) {
      console.error("listInquiriesCore: bad inquiry row", parsed.error.issues);
      return { kind: "error", message: "Bad inquiry row." };
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
  if (error) {
    console.error("markInquiryResolvedCore: update failed", error);
    return { kind: "error", message: GENERIC_ERROR };
  }
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
  if (error) {
    console.error("stampInquiryRepliedCore: update failed", error);
    return { kind: "error", message: GENERIC_ERROR };
  }
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
  if (error) {
    console.error("resolveMyInquiryCore: read failed", error);
    return { kind: "error", message: GENERIC_ERROR };
  }
  if (!data) return { kind: "not_found" };

  const guard = inquiryGuardSchema.safeParse(data);
  if (!guard.success) return { kind: "error", message: "Bad inquiry row." };
  if (guard.data.client_id !== deps.actorUserId) return { kind: "forbidden" };

  const { error: updateError } = await deps.serviceClient
    .from("inquiries")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", inquiryId)
    .eq("client_id", deps.actorUserId);
  if (updateError) {
    console.error("resolveMyInquiryCore: update failed", updateError);
    return { kind: "error", message: GENERIC_ERROR };
  }
  return { kind: "success" };
}

export async function editMyInquiryCore(
  deps: ClientDeps,
  inquiryId: string,
  rawInput: EditInquiryInput,
): Promise<InquiryMutationResult> {
  const parsed = editInquirySchema.safeParse(rawInput);
  if (!parsed.success) {
    console.error(
      "editMyInquiryCore: input validation failed",
      parsed.error.issues,
    );
    return {
      kind: "error",
      message: "Please check your entries and try again.",
    };
  }
  const input = parsed.data;

  const { data, error } = await deps.serviceClient
    .from("inquiries")
    .select("client_id, status, replied_at")
    .eq("id", inquiryId)
    .maybeSingle();
  if (error) {
    console.error("editMyInquiryCore: read failed", error);
    return { kind: "error", message: GENERIC_ERROR };
  }
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
  if (updateError) {
    console.error("editMyInquiryCore: update failed", updateError);
    return { kind: "error", message: GENERIC_ERROR };
  }
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
