"use server";

/**
 * Admin server actions for reviews moderation.
 *
 * SECURITY: service-role after admin check.
 * Flips review status between published and rejected (or from pending).
 */

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "./admin-guard";
import type { SupabaseClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type ReviewStatus = "pending" | "published" | "rejected";

export interface ReviewRow {
  id: string;
  client_id: string;
  author_name: string;
  rating: number;
  body: string;
  status: ReviewStatus;
  created_at: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Result types
// ──────────────────────────────────────────────────────────────────────────────

export type ReviewResult =
  | { kind: "success" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

export type ListReviewsResult =
  | { kind: "success"; reviews: ReviewRow[] }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

// ──────────────────────────────────────────────────────────────────────────────
// Deps
// ──────────────────────────────────────────────────────────────────────────────

export interface ReviewsDeps {
  serviceClient: SupabaseClient;
  actorUserId: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Core functions
// ──────────────────────────────────────────────────────────────────────────────

export async function listReviewsCore(
  deps: ReviewsDeps,
): Promise<ListReviewsResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const { data, error } = await deps.serviceClient
    .from("reviews")
    .select("id, client_id, author_name, rating, body, status, created_at")
    .order("created_at", { ascending: false });

  if (error) return { kind: "error", message: error.message };

  return { kind: "success", reviews: (data ?? []) as ReviewRow[] };
}

const moderateInputSchema = z.object({
  reviewId: z.string().uuid(),
  status: z.enum(["published", "rejected"]),
});

/**
 * Core: set a review's status to published or rejected.
 */
export async function moderateReviewCore(
  deps: ReviewsDeps,
  rawInput: { reviewId: string; status: ReviewStatus },
): Promise<ReviewResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const parsed = moderateInputSchema.safeParse(rawInput);
  if (!parsed.success)
    return { kind: "validation_error", message: parsed.error.message };

  const { reviewId, status } = parsed.data;

  // Verify review exists.
  const { data: review, error: reviewErr } = await deps.serviceClient
    .from("reviews")
    .select("id")
    .eq("id", reviewId)
    .single();

  if (reviewErr || !review) return { kind: "not_found" };

  const { error } = await deps.serviceClient
    .from("reviews")
    .update({ status })
    .eq("id", reviewId);

  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

// ──────────────────────────────────────────────────────────────────────────────
// "use server" wrappers
// ──────────────────────────────────────────────────────────────────────────────

async function getActorOrRedirect() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

export async function listReviews(): Promise<ListReviewsResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  return listReviewsCore({ serviceClient, actorUserId });
}

export async function moderateReview(input: {
  reviewId: string;
  status: ReviewStatus;
}): Promise<ReviewResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const result = await moderateReviewCore(
    { serviceClient, actorUserId },
    input,
  );
  if (result.kind === "success") revalidatePath("/admin/reviews");
  return result;
}
