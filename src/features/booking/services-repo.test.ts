import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { listActiveServices } from "./services-repo";

/** Minimal fake: records the chained query and returns canned rows. */
function fakeClient(rows: unknown[], capture: { neq?: [string, string] }) {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.neq = (col: string, val: string) => {
    capture.neq = [col, val];
    return builder;
  };
  builder.order = () => Promise.resolve({ data: rows, error: null });
  return { from: () => builder } as unknown as SupabaseClient;
}

const walkRow = {
  slug: "walk",
  name: "Dog Walk",
  description: "A walk",
  pricing_type: "walk",
  pricing_config: { perVisitCents: 2000 },
  concurrency: "exclusive",
  default_duration_min: 30,
  max_pets: 1,
};

describe("listActiveServices", () => {
  it("filters out the meet_greet pricing type at the query level", async () => {
    const capture: { neq?: [string, string] } = {};
    await listActiveServices(fakeClient([walkRow], capture));
    expect(capture.neq).toEqual(["pricing_type", "meet_greet"]);
  });
});
