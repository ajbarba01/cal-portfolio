/**
 * Tests for the argument-recording Supabase double.
 *
 * The double exists so that deleting a production predicate breaks a test, so
 * most of these cases are about what ends up in `_calls` and with which
 * arguments. The rest pin the canned-response behavior the suites rely on.
 */

import { describe, it, expect } from "vitest";

import { createFakeSupabase } from "./fake-supabase";

describe("createFakeSupabase — recording", () => {
  it("records every chained predicate with its arguments, in call order", async () => {
    const client = createFakeSupabase();

    await client
      .from("overnight_nights")
      .select("night")
      .in("night", ["2026-07-01", "2026-07-02"])
      .gte("night", "2026-07-01")
      .order("night")
      .limit(10);

    expect(client._calls).toEqual([
      { table: "overnight_nights", method: "select", args: ["night"] },
      {
        table: "overnight_nights",
        method: "in",
        args: ["night", ["2026-07-01", "2026-07-02"]],
      },
      {
        table: "overnight_nights",
        method: "gte",
        args: ["night", "2026-07-01"],
      },
      { table: "overnight_nights", method: "order", args: ["night"] },
      { table: "overnight_nights", method: "limit", args: [10] },
    ]);
  });

  it("records write payloads and keeps the chain awaitable", async () => {
    const client = createFakeSupabase({
      tables: { pets: { data: { id: "pet-1" }, error: null } },
    });

    const { data } = await client
      .from("pets")
      .insert({ name: "Biscuit", client_id: "client-1" })
      .select("id")
      .single();

    expect(data).toEqual({ id: "pet-1" });
    expect(client._calls).toEqual([
      {
        table: "pets",
        method: "insert",
        args: [{ name: "Biscuit", client_id: "client-1" }],
      },
      { table: "pets", method: "select", args: ["id"] },
      { table: "pets", method: "single", args: [] },
    ]);
  });

  it("filters recorded calls by table and by method", async () => {
    const client = createFakeSupabase();

    await client.from("bookings").select("id").eq("status", "confirmed");
    await client.from("pets").select("id").eq("client_id", "client-1");

    expect(client.calls({ table: "pets" })).toEqual([
      { table: "pets", method: "select", args: ["id"] },
      { table: "pets", method: "eq", args: ["client_id", "client-1"] },
    ]);
    expect(client.calls({ method: "eq" }).map((call) => call.args)).toEqual([
      ["status", "confirmed"],
      ["client_id", "client-1"],
    ]);
  });

  it("groups calls per chain so repeated reads of one table stay distinguishable", async () => {
    const client = createFakeSupabase();

    await client.from("settings").select("id").single();
    await client.from("settings").update({ holiday_dates: [] }).eq("id", "s1");

    expect(client._queries).toHaveLength(2);
    expect(client._queries[0]?._calls.map((call) => call.method)).toEqual([
      "select",
      "single",
    ]);
    expect(client._queries[1]?._calls.map((call) => call.method)).toEqual([
      "update",
      "eq",
    ]);
  });
});

describe("createFakeSupabase — responses", () => {
  it("resolves the response configured for the table", async () => {
    const client = createFakeSupabase({
      tables: { pets: { data: [{ id: "pet-1" }], error: null } },
    });

    const { data, error } = await client.from("pets").select("id");

    expect(data).toEqual([{ id: "pet-1" }]);
    expect(error).toBeNull();
  });

  it("resolves an empty result for a table with no configured response", async () => {
    const client = createFakeSupabase();

    const { data, error } = await client.from("pets").select("id");

    expect(data).toEqual([]);
    expect(error).toBeNull();
  });

  it("consumes a per-table queue in order, then falls back to an empty result", async () => {
    const client = createFakeSupabase({
      tables: {
        bookings: [
          { data: [{ id: "b1" }], error: null },
          { data: null, error: { message: "db error" } },
        ],
      },
    });

    expect((await client.from("bookings").select("id")).data).toEqual([
      { id: "b1" },
    ]);
    expect((await client.from("bookings").select("id")).error).toEqual({
      message: "db error",
    });
    expect((await client.from("bookings").select("id")).data).toEqual([]);
  });

  it("takes one queue entry per chain however many times that chain is awaited", async () => {
    const client = createFakeSupabase({
      tables: {
        settings: [
          { data: { id: "s1" }, error: null },
          { data: { id: "s2" }, error: null },
        ],
      },
    });

    const chain = client.from("settings").select("id");

    expect((await chain.single()).data).toEqual({ id: "s1" });
    expect((await chain).data).toEqual({ id: "s1" });
  });

  it("returns the configured error from maybeSingle", async () => {
    const client = createFakeSupabase({
      tables: {
        form_responses: { data: null, error: { message: "read failed" } },
      },
    });

    const { data, error } = await client
      .from("form_responses")
      .select("id")
      .eq("client_id", "client-1")
      .maybeSingle();

    expect(data).toBeNull();
    expect(error).toEqual({ message: "read failed" });
  });
});

describe("createFakeSupabase — rpc and storage", () => {
  it("records the rpc function name", async () => {
    const client = createFakeSupabase({
      tables: { is_admin: { data: true, error: null } },
    });

    const { data } = await client.rpc("is_admin");

    expect(data).toBe(true);
    expect(client._calls).toEqual([
      { table: "is_admin", method: "rpc", args: ["is_admin"] },
    ]);
  });

  it("signs one path and records the bucket, path and ttl", async () => {
    const client = createFakeSupabase();

    const { data } = await client.storage
      .from("pet-photos")
      .createSignedUrl("client-1/pet.jpg", 60);

    expect(data?.signedUrl).toBe("https://signed.test/client-1/pet.jpg");
    expect(client._calls).toEqual([
      {
        table: "pet-photos",
        method: "createSignedUrl",
        args: ["client-1/pet.jpg", 60],
      },
    ]);
  });

  it("signs a batch in a single call, one entry per path", async () => {
    const client = createFakeSupabase();

    const { data } = await client.storage
      .from("pet-photos")
      .createSignedUrls(["a.jpg", "b.jpg"], 60);

    expect(data).toEqual([
      { path: "a.jpg", signedUrl: "https://signed.test/a.jpg", error: null },
      { path: "b.jpg", signedUrl: "https://signed.test/b.jpg", error: null },
    ]);
    expect(client.calls({ method: "createSignedUrls" })).toHaveLength(1);
  });

  it("fails signing with the configured storage error instead of returning urls", async () => {
    const client = createFakeSupabase({
      storage: { error: { message: "no such bucket" } },
    });

    const single = await client.storage
      .from("pet-photos")
      .createSignedUrl("a.jpg", 60);
    const batch = await client.storage
      .from("pet-photos")
      .createSignedUrls(["a.jpg"], 60);

    expect(single.data).toBeNull();
    expect(single.error).toEqual({ message: "no such bucket" });
    expect(batch.data).toBeNull();
    expect(batch.error).toEqual({ message: "no such bucket" });
  });

  it("uses the configured signed-url builder", async () => {
    const client = createFakeSupabase({
      storage: { signedUrl: (path) => `https://cdn.test/${path}?token=x` },
    });

    const { data } = await client.storage
      .from("pet-photos")
      .createSignedUrl("a.jpg", 60);

    expect(data?.signedUrl).toBe("https://cdn.test/a.jpg?token=x");
  });
});
