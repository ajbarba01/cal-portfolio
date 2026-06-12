/**
 * Integration tests for review submission and visibility.
 *
 * Prerequisites: local Supabase running (`npx supabase start`).
 * Credentials from .env.test (gitignored).
 *
 * Follows the pattern in src/features/accounts/account-actions.test.ts:
 *   - Service-role client: fixture setup + verification (bypasses RLS)
 *   - Session client (anon key + signInWithPassword): RLS assertions
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { runSubmitReview } from "./reviews-action";
import { listPublishedReviews } from "./reviews-repo";

const url = process.env.SUPABASE_TEST_URL!;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY!;

if (!url || !serviceKey || !anonKey) {
  throw new Error("Missing SUPABASE_TEST_* env vars — is .env.test present?");
}

/** Service-role client — bypasses RLS, used for fixture setup and verification. */
const serviceClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Anon client — used to verify public read behaviour (published only). */
const anonClient = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Session client — signs in with a real user to submit reviews. */
const sessionClient = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_PASSWORD = "Test1234!";
const userEmail = `test-review-${Date.now()}@example.invalid`;

let userId: string;
let createdReviewId: string;

beforeAll(async () => {
  const { data, error } = await serviceClient.auth.admin.createUser({
    email: userEmail,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Create review fixture user failed: ${error?.message}`);
  }
  userId = data.user.id;

  await sessionClient.auth.signInWithPassword({
    email: userEmail,
    password: TEST_PASSWORD,
  });
});

afterAll(async () => {
  // Remove created review rows first, then the user.
  if (createdReviewId) {
    await serviceClient.from("reviews").delete().eq("id", createdReviewId);
  }
  await serviceClient.auth.admin.deleteUser(userId);
});

// ---------------------------------------------------------------------------
// 1. Signed-in submission
// ---------------------------------------------------------------------------

describe("runSubmitReview", () => {
  it("returns { ok: true } for a valid submission from a signed-in user", async () => {
    const result = await runSubmitReview(sessionClient, {
      rating: 5,
      body: "Excellent care — my dog was happy and healthy.",
    });

    expect(result.ok).toBe(true);
  });

  it("inserted row has status='published' (auto-publish on submit)", async () => {
    // Fetch the most-recent review for this user via service client.
    const { data: rows, error } = await serviceClient
      .from("reviews")
      .select("id, status, rating, body")
      .eq("client_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);

    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows?.[0].status).toBe("published");

    createdReviewId = rows![0].id as string;
  });

  it("returns { ok: false } for invalid input (rating out of range)", async () => {
    const result = await runSubmitReview(sessionClient, {
      rating: 6 as never,
      body: "Invalid rating test",
    });

    expect(result.ok).toBe(false);
    expect(result).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// 2. Anon visibility — published vs pending
// ---------------------------------------------------------------------------

describe("listPublishedReviews visibility", () => {
  it("anon client DOES see the review immediately after submission (auto-published)", async () => {
    const reviews = await listPublishedReviews(anonClient);
    const found = reviews.some((r) => r.id === createdReviewId);
    expect(found).toBe(true);
  });

  it("anon client does NOT see the review after admin rejects (unpublish via reject)", async () => {
    // Reject the review via service role (simulates admin unpublish).
    const { error } = await serviceClient
      .from("reviews")
      .update({ status: "rejected" })
      .eq("id", createdReviewId);

    expect(error).toBeNull();

    const reviews = await listPublishedReviews(anonClient);
    const found = reviews.some((r) => r.id === createdReviewId);
    expect(found).toBe(false);
  });
});
