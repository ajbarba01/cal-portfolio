/**
 * Integration tests for client-owned inquiry cores.
 * Prerequisites: local Supabase stack running; .env.test present (gitignored).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

import { editMyInquiryCore, resolveMyInquiryCore } from "./inquiry-actions";

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
const inquiryIds: string[] = [];

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
  [ownerId, otherId] = await Promise.all([
    makeUser(`inq-owner-${ts}@example.invalid`),
    makeUser(`inq-other-${ts}@example.invalid`),
  ]);
});

afterAll(async () => {
  if (inquiryIds.length > 0) {
    await serviceClient.from("inquiries").delete().in("id", inquiryIds);
  }
  await Promise.all(
    [ownerId, otherId]
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
