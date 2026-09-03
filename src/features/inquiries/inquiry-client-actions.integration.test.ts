/**
 * Integration tests for the inquiry submission and client-owned cores.
 * Prerequisites: local Supabase stack running; .env.test present (gitignored).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

import {
  editMyInquiryCore,
  resolveMyInquiryCore,
  submitInquiryCore,
} from "./inquiry-actions";

const url = process.env.SUPABASE_TEST_URL!;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!;
if (!url || !serviceKey) {
  throw new Error("Missing SUPABASE_TEST_* env vars — is .env.test present?");
}

const serviceClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const TEST_PASS = "Test1234!";
let ownerId: string;
let otherId: string;
/** Starts at the session ceiling; kept apart so test order cannot shift it. */
let cappedId: string;
/** Has sent nothing, whatever the other suites do. */
let freshId: string;
const inquiryIds: string[] = [];

/** Matches SESSION_WINDOW_MAX in inquiry-actions.ts. */
const SESSION_CEILING = 5;

async function makeUser(email: string): Promise<string> {
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password: TEST_PASS,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(`createUser failed: ${error?.message}`);
  return data.user.id;
}

async function makeInquiry(opts: {
  clientId: string;
  status?: "new" | "resolved";
  repliedAt?: string | null;
}): Promise<string> {
  const { data, error } = await serviceClient
    .from("inquiries")
    .insert({
      client_id: opts.clientId,
      name: "Owner Test",
      email: `owner-${ts}-${inquiryIds.length}@example.invalid`,
      message: "Original message",
      status: opts.status ?? "new",
      replied_at: opts.repliedAt ?? null,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(`inquiry insert failed: ${error?.message}`);
  inquiryIds.push(data.id);
  return data.id;
}

beforeAll(async () => {
  [ownerId, otherId, cappedId, freshId] = await Promise.all([
    makeUser(`inq-owner-${ts}@example.invalid`),
    makeUser(`inq-other-${ts}@example.invalid`),
    makeUser(`inq-capped-${ts}@example.invalid`),
    makeUser(`inq-fresh-${ts}@example.invalid`),
  ]);
});

afterAll(async () => {
  if (inquiryIds.length > 0) {
    await serviceClient.from("inquiries").delete().in("id", inquiryIds);
  }
  await Promise.all(
    [ownerId, otherId, cappedId, freshId]
      .filter(Boolean)
      .map((id) => serviceClient.auth.admin.deleteUser(id)),
  );
});

describe("resolveMyInquiryCore", () => {
  it("owner resolves their own inquiry", async () => {
    const id = await makeInquiry({ clientId: ownerId });
    const result = await resolveMyInquiryCore(
      { serviceClient, actorUserId: ownerId },
      id,
    );
    expect(result.kind).toBe("success");
    const { data } = await serviceClient
      .from("inquiries")
      .select("status")
      .eq("id", id)
      .single();
    expect(data?.status).toBe("resolved");
  });

  it("non-owner is forbidden and status is unchanged", async () => {
    const id = await makeInquiry({ clientId: ownerId });
    const result = await resolveMyInquiryCore(
      { serviceClient, actorUserId: otherId },
      id,
    );
    expect(result.kind).toBe("forbidden");
    const { data } = await serviceClient
      .from("inquiries")
      .select("status")
      .eq("id", id)
      .single();
    expect(data?.status).toBe("new");
  });

  it("missing inquiry → not_found", async () => {
    const result = await resolveMyInquiryCore(
      { serviceClient, actorUserId: ownerId },
      "00000000-0000-0000-0000-000000000000",
    );
    expect(result.kind).toBe("not_found");
  });
});

describe("editMyInquiryCore", () => {
  it("owner edits an unanswered new inquiry", async () => {
    const id = await makeInquiry({ clientId: ownerId });
    const result = await editMyInquiryCore(
      { serviceClient, actorUserId: ownerId },
      id,
      { subject: "Updated subject", message: "Updated message" },
    );
    expect(result.kind).toBe("success");
    const { data } = await serviceClient
      .from("inquiries")
      .select("subject, message")
      .eq("id", id)
      .single();
    expect(data?.subject).toBe("Updated subject");
    expect(data?.message).toBe("Updated message");
  });

  it("rejects edits once Cal has replied", async () => {
    const id = await makeInquiry({
      clientId: ownerId,
      repliedAt: new Date().toISOString(),
    });
    const result = await editMyInquiryCore(
      { serviceClient, actorUserId: ownerId },
      id,
      { subject: "", message: "Should not save" },
    );
    expect(result.kind).toBe("error");
  });

  it("non-owner is forbidden", async () => {
    const id = await makeInquiry({ clientId: ownerId });
    const result = await editMyInquiryCore(
      { serviceClient, actorUserId: otherId },
      id,
      { subject: "", message: "Hijack" },
    );
    expect(result.kind).toBe("forbidden");
  });
});

describe("submitInquiryCore rate limits", () => {
  const TOO_SOON =
    "You just sent a message - please wait a moment before sending another.";

  function submission(email: string) {
    return {
      name: "Rate Limit Test",
      email,
      phone: "555-0100",
      message: "Hello Cal, I would like to ask about a walk.",
    };
  }

  it("caps a signed-in sender even when they change the email field", async () => {
    for (let i = 0; i < SESSION_CEILING; i += 1) {
      await makeInquiry({ clientId: cappedId });
    }

    const result = await submitInquiryCore(
      serviceClient,
      cappedId,
      submission(`inq-capped-fresh-${ts}@example.invalid`),
    );

    expect(result).toEqual({ ok: false, error: TOO_SOON });
  });

  it("keys the cap to the sender, so another account is unaffected", async () => {
    const email = `inq-fresh-send-${ts}@example.invalid`;

    const result = await submitInquiryCore(
      serviceClient,
      freshId,
      submission(email),
    );

    expect(result).toEqual({ ok: true });
    const { data } = await serviceClient
      .from("inquiries")
      .select("id")
      .eq("email", email)
      .single();
    if (data) inquiryIds.push(data.id);
  });

  it("still refuses a repeat from the same email address", async () => {
    const email = `inq-fresh-repeat-${ts}@example.invalid`;
    const first = await submitInquiryCore(
      serviceClient,
      null,
      submission(email),
    );
    expect(first).toEqual({ ok: true });
    const { data } = await serviceClient
      .from("inquiries")
      .select("id")
      .eq("email", email)
      .single();
    if (data) inquiryIds.push(data.id);

    const second = await submitInquiryCore(
      serviceClient,
      null,
      submission(email),
    );

    expect(second).toEqual({ ok: false, error: TOO_SOON });
  });
});
