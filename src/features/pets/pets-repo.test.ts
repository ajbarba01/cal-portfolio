import { describe, it, expect, vi } from "vitest";
import type { DbClient } from "@/lib/supabase/db-client";

import {
  listClientPets,
  PET_COLUMNS,
  SIGNED_URL_TTL_SECONDS,
} from "./pets-repo";

// ─── Recording double ─────────────────────────────────────────────────────────

/** One `createSignedUrls` invocation, recorded verbatim. */
interface SignRequest {
  bucket: string;
  paths: string[];
  ttl: number;
}

/** Every predicate the repository sent, so a test can assert what was asked for. */
interface Recording {
  select: string[];
  eq: [string, string][];
  order: [string, { ascending: boolean }][];
  signRequests: SignRequest[];
}

interface FakeOptions {
  rows?: Record<string, unknown>[];
  queryError?: { message: string } | null;
  signError?: { message: string } | null;
}

/**
 * Hand-rolled Supabase double. Unlike a fake that only replays canned rows,
 * this one records its arguments — a dropped filter or an unbatched signing
 * loop has to fail a test rather than pass silently.
 */
function fakeClient(options: FakeOptions): {
  client: DbClient;
  recording: Recording;
} {
  const recording: Recording = {
    select: [],
    eq: [],
    order: [],
    signRequests: [],
  };

  const query: Record<string, unknown> = {};
  query.select = (columns: string) => {
    recording.select.push(columns);
    return query;
  };
  query.eq = (column: string, value: string) => {
    recording.eq.push([column, value]);
    return query;
  };
  query.order = (column: string, opts: { ascending: boolean }) => {
    recording.order.push([column, opts]);
    return Promise.resolve({
      data: options.rows ?? [],
      error: options.queryError ?? null,
    });
  };

  const client = {
    from: () => query,
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: (paths: string[], ttl: number) => {
          recording.signRequests.push({ bucket, paths, ttl });
          if (options.signError) {
            return Promise.resolve({ data: null, error: options.signError });
          }
          return Promise.resolve({
            data: paths.map((path) => ({
              path,
              signedUrl: `signed:${path}`,
              error: null,
            })),
            error: null,
          });
        },
      }),
    },
  } as unknown as DbClient;

  return { client, recording };
}

function petRow(id: string, photoPath: string | null) {
  return {
    id,
    name: `Pet ${id}`,
    species: "dog",
    breed: null,
    notes: null,
    birthdate: "2020-01-01",
    photo_url: photoPath,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PET_COLUMNS", () => {
  it("includes birthdate, the column the hand-rolled copies dropped", () => {
    expect(PET_COLUMNS.split(", ")).toContain("birthdate");
  });
});

describe("listClientPets", () => {
  it("reads one client's pets in creation order with the canonical columns", async () => {
    const { client, recording } = fakeClient({ rows: [] });

    await listClientPets(client, "client-1");

    expect(recording.select).toEqual([PET_COLUMNS]);
    expect(recording.eq).toEqual([["client_id", "client-1"]]);
    expect(recording.order).toEqual([["created_at", { ascending: true }]]);
  });

  it("signs every photo in a single request, whatever the pet count", async () => {
    const { client, recording } = fakeClient({
      rows: [petRow("a", "a.jpg"), petRow("b", "b.jpg"), petRow("c", "c.jpg")],
    });

    const { data } = await listClientPets(client, "client-1");

    expect(recording.signRequests).toEqual([
      {
        bucket: "pet-photos",
        paths: ["a.jpg", "b.jpg", "c.jpg"],
        ttl: SIGNED_URL_TTL_SECONDS,
      },
    ]);
    expect(data.map((pet) => pet.photoUrl)).toEqual([
      "signed:a.jpg",
      "signed:b.jpg",
      "signed:c.jpg",
    ]);
  });

  it("keeps the stored row alongside the signed URL", async () => {
    const { client } = fakeClient({ rows: [petRow("a", "a.jpg")] });

    const { data } = await listClientPets(client, "client-1");

    expect(data).toEqual([
      {
        id: "a",
        name: "Pet a",
        species: "dog",
        breed: null,
        notes: null,
        birthdate: "2020-01-01",
        photo_url: "a.jpg",
        photoUrl: "signed:a.jpg",
      },
    ]);
  });

  it("leaves a photoless pet null and never asks storage for it", async () => {
    const { client, recording } = fakeClient({
      rows: [petRow("a", null), petRow("b", "b.jpg")],
    });

    const { data } = await listClientPets(client, "client-1");

    expect(recording.signRequests[0]?.paths).toEqual(["b.jpg"]);
    expect(data.map((pet) => pet.photoUrl)).toEqual([null, "signed:b.jpg"]);
  });

  it("skips storage entirely when no pet has a photo", async () => {
    const { client, recording } = fakeClient({
      rows: [petRow("a", null), petRow("b", null)],
    });

    await listClientPets(client, "client-1");

    expect(recording.signRequests).toEqual([]);
  });

  it("returns the query error instead of an empty list of pets", async () => {
    const { client, recording } = fakeClient({
      queryError: { message: "connection reset" },
    });

    const { data, error } = await listClientPets(client, "client-1");

    expect(error?.message).toBe("connection reset");
    expect(data).toEqual([]);
    expect(recording.signRequests).toEqual([]);
  });

  it("falls back to no photo when signing fails, rather than failing the read", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient({
      rows: [petRow("a", "a.jpg")],
      signError: { message: "bucket unavailable" },
    });

    const { data, error } = await listClientPets(client, "client-1");

    expect(error).toBeNull();
    expect(data[0]?.photoUrl).toBeNull();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
