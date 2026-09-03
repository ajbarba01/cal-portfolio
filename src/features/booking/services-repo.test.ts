import { describe, it, expect, vi } from "vitest";
import { createFakeSupabase } from "@/test-stubs/fake-supabase";

import { listActiveServices } from "./services-repo";

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
    const client = createFakeSupabase({
      tables: { services: { data: [walkRow], error: null } },
    });

    await listActiveServices(client);

    expect(client.calls({ table: "services", method: "neq" })[0]?.args).toEqual(
      ["pricing_type", "meet_greet"],
    );
  });

  it("logs the failure instead of passing an empty list off as no services", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = createFakeSupabase({
      tables: {
        services: { data: null, error: { message: "connection reset" } },
      },
    });

    expect(await listActiveServices(client)).toEqual([]);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("logs the service it skips for an unparseable pricing_config", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = createFakeSupabase({
      tables: {
        services: {
          data: [
            { ...walkRow, slug: "broken", pricing_config: { nope: true } },
          ],
          error: null,
        },
      },
    });

    expect(await listActiveServices(client)).toEqual([]);
    expect(logged.mock.calls[0]).toContain("broken");
    logged.mockRestore();
  });
});
