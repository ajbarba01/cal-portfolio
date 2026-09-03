import { describe, it, expect } from "vitest";
import {
  createFakeSupabase,
  type FakeResponse,
} from "@/test-stubs/fake-supabase";
import { runSubmitReview } from "./reviews-action";

const USER_ID = "11111111-1111-1111-1111-111111111111";

const VALID_INPUT = {
  rating: 5,
  body: "Cal took great care of my dog.",
};

/**
 * A head+count response. The double's `FakeResponse` describes the data/error
 * pair only, so the count rides along through an assertion.
 */
const countOf = (count: number) =>
  ({ data: null, error: null, count }) as FakeResponse;

const noProfile: FakeResponse = { data: null, error: null };

describe("runSubmitReview", () => {
  it("refuses an anonymous submitter without touching the table", async () => {
    const supabase = createFakeSupabase();

    const result = await runSubmitReview(supabase, null, VALID_INPUT);

    expect(result).toEqual({
      ok: false,
      error: "You must be signed in to leave a review.",
    });
    expect(supabase.calls({ table: "reviews" })).toHaveLength(0);
  });

  it("counts only the submitter's own recent reviews", async () => {
    const supabase = createFakeSupabase({
      tables: { reviews: [countOf(0)], profiles: noProfile },
    });

    await runSubmitReview(supabase, USER_ID, VALID_INPUT);

    const [countQuery] = supabase._queries;
    expect(countQuery?.table).toBe("reviews");
    expect(countQuery?._calls.map((call) => call.method)).toEqual([
      "select",
      "eq",
      "gte",
    ]);
    expect(countQuery?._calls[1]?.args).toEqual(["client_id", USER_ID]);
    expect(countQuery?._calls[2]?.args[0]).toBe("created_at");
  });

  it("refuses once the submitter has a review inside the window", async () => {
    const supabase = createFakeSupabase({
      tables: { reviews: [countOf(1)], profiles: noProfile },
    });

    const result = await runSubmitReview(supabase, USER_ID, VALID_INPUT);

    expect(result).toEqual({
      ok: false,
      error: "Too many submissions. Please try again later.",
    });
    expect(supabase.calls({ table: "reviews", method: "insert" })).toHaveLength(
      0,
    );
  });

  it("falls back to Anonymous when the profile carries no name", async () => {
    const supabase = createFakeSupabase({
      tables: { reviews: [countOf(0)], profiles: noProfile },
    });

    const result = await runSubmitReview(supabase, USER_ID, VALID_INPUT);

    expect(result).toEqual({ ok: true });
    const [insert] = supabase.calls({ table: "reviews", method: "insert" });
    expect(insert?.args[0]).toEqual({
      client_id: USER_ID,
      author_name: "Anonymous",
      rating: 5,
      body: VALID_INPUT.body,
      status: "published",
    });
  });

  it("returns static text when the insert fails", async () => {
    const supabase = createFakeSupabase({
      tables: {
        reviews: [countOf(0), { data: null, error: { message: "23514 boom" } }],
        profiles: noProfile,
      },
    });

    const result = await runSubmitReview(supabase, USER_ID, VALID_INPUT);

    expect(result).toEqual({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
  });
});
