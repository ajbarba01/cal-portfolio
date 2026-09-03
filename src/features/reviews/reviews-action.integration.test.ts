/**
 * Integration tests for review submission and visibility.
 *
 * Prerequisites: local Supabase running (`npx supabase start`).
 * Credentials from .env.test (gitignored).
 *
 * Follows the pattern in src/features/accounts/account-actions.integration.test.ts:
 *   - Service-role client: the action's own writer, plus fixture setup
 *   - Anon client (publishable key): public read assertions
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

/** Service-role client — the reviews writer, and fixture setup/verification. */
const serviceClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Anon client — used to verify public read behaviour (published only). */
const anonClient = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_PASSWORD = "Test1234!";
const ts = Date.now();

let userId: string;
let otherUserId: string;
let createdReviewId: string;

async function makeUser(email: string): Promise<string> {
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Create review fixture user failed: ${error?.message}`);
  }
  return data.user.id;
}

beforeAll(async () => {
  userId = await makeUser(`test-review-${ts}@example.invalid`);
  otherUserId = await makeUser(`test-review-other-${ts}@example.invalid`);
});

afterAll(async () => {
  // Remove created review rows first, then the users.
  await serviceClient
    .from("reviews")
    .delete()
    .in("client_id", [userId, otherUserId]);
  await Promise.all(
    [userId, otherUserId]
      .filter(Boolean)
      .map((id) => serviceClient.auth.admin.deleteUser(id)),
  );
});

// ---------------------------------------------------------------------------
// 1. Signed-in submission
// ---------------------------------------------------------------------------

describe("runSubmitReview", () => {
  it("returns { ok: true } for a valid submission from a signed-in user", async () => {
    const result = await runSubmitReview(serviceClient, userId, {
      rating: 5,
      body: "Excellent care — my dog was happy and healthy.",
    });

    expect(result.ok).toBe(true);
  });

  it("inserted row is published and never carries the reviewer's email", async () => {
    const { data: rows, error } = await serviceClient
      .from("reviews")
      .select("id, status, author_name")
      .eq("client_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);

    expect(error).toBeNull();
    expect(rows).toHaveLength(1);

    const [review] = rows ?? [];
    if (!review) throw new Error("expected the submitted review to be stored");
    expect(review.status).toBe("published");
    // The fixture user has no profile name, so the fallback applies.
    expect(review.author_name).toBe("Anonymous");

    createdReviewId = review.id as string;
  });

  it("refuses a second review from the same client inside the window", async () => {
    const result = await runSubmitReview(serviceClient, userId, {
      rating: 4,
      body: "A second review from the same account.",
    });

    expect(result).toEqual({
      ok: false,
      error: "Too many submissions. Please try again later.",
    });
  });

  it("caps each client separately — another client may still post", async () => {
    const result = await runSubmitReview(serviceClient, otherUserId, {
      rating: 5,
      body: "A first review from a different account.",
    });

    expect(result.ok).toBe(true);
  });

  it("refuses an anonymous submitter", async () => {
    const result = await runSubmitReview(serviceClient, null, {
      rating: 5,
      body: "No session behind this one.",
    });

    expect(result).toEqual({
      ok: false,
      error: "You must be signed in to leave a review.",
    });
  });

  it("returns { ok: false } for invalid input (rating out of range)", async () => {
    const result = await runSubmitReview(serviceClient, userId, {
      rating: 6 as never,
      body: "Invalid rating test",
    });

    expect(result.ok).toBe(false);
    expect(result).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// 2. Public write path is closed
// ---------------------------------------------------------------------------

describe("reviews table grants", () => {
  it("rejects a signed-in insert made straight at PostgREST", async () => {
    // The submission cap only binds while this action is the sole writer: a
    // signed-in caller holding the publishable key must not be able to skip it.
    const sessionClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await sessionClient.auth.signInWithPassword({
      email: `test-review-${ts}@example.invalid`,
      password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();

    const { error } = await sessionClient.from("reviews").insert({
      client_id: userId,
      author_name: "Forged",
      rating: 5,
      body: "Posted straight at PostgREST.",
      status: "published",
    });

    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Anon visibility — published vs rejected
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
