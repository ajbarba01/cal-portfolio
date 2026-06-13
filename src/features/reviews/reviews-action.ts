"use server";

/**
 * Server action for submitting a client review.
 *
 * SECURITY: Uses the SESSION client only. The DB INSERT policy enforces
 * `status = 'published'` via WITH CHECK — auto-publish on submit; admins
 * moderate reactively. Identity comes from getUser(), never from payload.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { submitReviewSchema, type SubmitReviewInput } from "./reviews-schema";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Result type ─────────────────────────────────────────────────────────────

export type ReviewSubmitResult = { ok: true } | { ok: false; error: string };

// ─── Core (DI-testable, no hard imports) ─────────────────────────────────────

/**
 * Pure-ish core: validates input, asserts identity via session, inserts
 * with status='published' (auto-publish). Returns a discriminated-union result;
 * never throws across the action boundary.
 */
export async function runSubmitReview(
  supabase: SupabaseClient,
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

  // Identity always from the session — never trust payload.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "You must be signed in to leave a review." };
  }

  // author_name defaults to empty string if profile hasn't been filled in yet.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const authorName =
    typeof profile?.full_name === "string" && profile.full_name.length > 0
      ? profile.full_name
      : (user.email ?? "Anonymous");

  const { error } = await supabase.from("reviews").insert({
    client_id: user.id,
    author_name: authorName,
    rating,
    body,
    status: "published" as const,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

// ─── Thin "use server" wrapper ────────────────────────────────────────────────

export async function submitReview(
  input: SubmitReviewInput,
): Promise<ReviewSubmitResult> {
  const supabase = await createClient();
  const result = await runSubmitReview(supabase, input);
  // Reviews auto-publish and the form says "your review is live" — refresh the
  // static public reviews page so the new review appears.
  if (result.ok) revalidatePath("/reviews");
  return result;
}
