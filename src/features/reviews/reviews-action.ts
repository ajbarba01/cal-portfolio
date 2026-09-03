"use server";

/**
 * Server action for submitting a client review.
 *
 * SECURITY: writes with the SERVICE ROLE. The database grants `insert` on
 * `reviews` to no public role, so every published review passes through this
 * action's validation, identity check and submission cap — a signed-in caller
 * cannot post rows straight at PostgREST with the publishable key. Identity
 * comes from getUser(), never from the payload; rows insert as
 * `status = 'published'` (auto-publish) and admins moderate reactively.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { submitReviewSchema, type SubmitReviewInput } from "./reviews-schema";
import type { DbClient } from "@/lib/supabase/db-client";

// ─── Result type ─────────────────────────────────────────────────────────────

export type ReviewSubmitResult = { ok: true } | { ok: false; error: string };

// ─── Core (DI-testable, no hard imports) ─────────────────────────────────────

/**
 * How long one client must wait between reviews. Reviews are public and
 * auto-published, so an unbounded account could flood the wall.
 */
const SUBMISSION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Validates input, caps how often one client may post, and inserts the review.
 * Returns a discriminated-union result; never throws across the action boundary.
 *
 * @param serviceClient - service-role client; the only writer of this table.
 * @param userId - the session's user id, or null when nobody is signed in.
 */
export async function runSubmitReview(
  serviceClient: DbClient,
  userId: string | null,
  rawInput: SubmitReviewInput,
): Promise<ReviewSubmitResult> {
  const parsed = submitReviewSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const { rating, body } = parsed.data;

  if (!userId) {
    return { ok: false, error: "You must be signed in to leave a review." };
  }

  const cutoff = new Date(Date.now() - SUBMISSION_WINDOW_MS).toISOString();
  const { count, error: countError } = await serviceClient
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("client_id", userId)
    .gte("created_at", cutoff);
  if (countError) {
    console.error("submitReview: submission-cap count failed", countError);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: "Too many submissions. Please try again later.",
    };
  }

  // The reviewer's own name, or "Anonymous" when the profile has none — never
  // their email, which the public wall would publish.
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  const authorName =
    typeof profile?.full_name === "string" && profile.full_name.length > 0
      ? profile.full_name
      : "Anonymous";

  const { error } = await serviceClient.from("reviews").insert({
    client_id: userId,
    author_name: authorName,
    rating,
    body,
    status: "published" as const,
  });

  if (error) {
    console.error("submitReview: insert failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  return { ok: true };
}

// ─── Thin "use server" wrapper ────────────────────────────────────────────────

export async function submitReview(
  input: SubmitReviewInput,
): Promise<ReviewSubmitResult> {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  const result = await runSubmitReview(
    createServiceClient(),
    user?.id ?? null,
    input,
  );
  // Reviews auto-publish and the form says "your review is live" — refresh the
  // static public reviews page so the new review appears.
  if (result.ok) revalidatePath("/reviews");
  return result;
}
