/**
 * The shared contract of the three cron route handlers: the bearer gate rejects
 * before any database work, and a failure inside the handler becomes a 500
 * rather than an unhandled exception.
 *
 * The service client is mocked to throw, so "the gate held" is provable — a
 * request that reaches the handler body fails loudly instead of silently
 * looking like a pass.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { GET as completeGet } from "./complete/route";
import { GET as remindersGet } from "./reminders/route";
import { GET as seriesRollGet } from "./series-roll/route";

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => {
    throw new Error("service client unavailable");
  }),
}));

const CRON_SECRET = "test-cron-secret";

const routes = [
  { name: "complete", GET: completeGet },
  { name: "reminders", GET: remindersGet },
  { name: "series-roll", GET: seriesRollGet },
] as const;

function request(name: string, authorization?: string): NextRequest {
  return new NextRequest(`https://example.invalid/api/cron/${name}`, {
    headers: authorization === undefined ? {} : { authorization },
  });
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(routes)("GET /api/cron/$name", ({ name, GET }) => {
  it("rejects a request with no Authorization header without touching the database", async () => {
    const response = await GET(request(name));

    expect(response.status).toBe(401);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer token without touching the database", async () => {
    const response = await GET(request(name, "Bearer not-the-secret"));

    expect(response.status).toBe(401);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("rejects the raw secret sent without the Bearer scheme", async () => {
    const response = await GET(request(name, CRON_SECRET));

    expect(response.status).toBe(401);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("answers 500 when the correct bearer reaches a handler that throws", async () => {
    const response = await GET(request(name, `Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(500);
    expect(createServiceClient).toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });
});
