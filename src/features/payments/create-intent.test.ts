/**
 * The payments kill-switch on the prepay intent core.
 *
 * Hiding the Prepay button is not a gate: a server action stays callable by
 * anyone holding a session, so the refusal has to happen inside the core,
 * ahead of any session read, database query or Stripe call. Both modes run in
 * one file, so the switch is pinned in both directions rather than only in
 * whichever one the environment happens to be in.
 *
 * `NEXT_PUBLIC_PAYMENTS_ENABLED` is inlined at build time and the module reads
 * it once at load, so a getter on the mocked module is the only way to change
 * the answer between tests.
 */

import { describe, it, expect, vi } from "vitest";

const { paymentsEnabled } = vi.hoisted(() => ({
  paymentsEnabled: { value: false },
}));

vi.mock("@/lib/payments-enabled", () => ({
  get PAYMENTS_ENABLED() {
    return paymentsEnabled.value;
  },
}));

import { runCreatePrepayIntent } from "./create-intent";
import type { PaymentGateway } from "./types";
import type { DbClient } from "@/lib/supabase/db-client";

/** A stand-in that fails the test if the code under test reaches it. */
function forbidden(what: string): () => never {
  return () => {
    throw new Error(`${what} must not be reached`);
  };
}

const closedGateway: PaymentGateway = {
  createIntent: forbidden("Stripe"),
  refund: forbidden("Stripe"),
  retrieveIntent: forbidden("Stripe"),
  cancelIntent: forbidden("Stripe"),
};

/** Neither the session nor the tables may be touched while payments are off. */
const untouchableClient = {
  auth: { getUser: forbidden("the session") },
  from: forbidden("the database"),
} as unknown as DbClient;

/** A live session belonging to nobody — the first check past the kill-switch. */
const signedOutClient = {
  auth: { getUser: async () => ({ data: { user: null } }) },
  from: forbidden("the database"),
} as unknown as DbClient;

describe("runCreatePrepayIntent kill-switch", () => {
  it("refuses without reading the session, the database or Stripe while payments are off", async () => {
    paymentsEnabled.value = false;

    const result = await runCreatePrepayIntent(
      {
        sessionClient: untouchableClient,
        serviceClient: untouchableClient,
        gateway: closedGateway,
      },
      "booking-1",
    );

    expect(result.ok).toBe(false);
  });

  it("gets past the switch to the identity check while payments are on", async () => {
    paymentsEnabled.value = true;

    const result = await runCreatePrepayIntent(
      {
        sessionClient: signedOutClient,
        serviceClient: untouchableClient,
        gateway: closedGateway,
      },
      "booking-1",
    );

    expect(result).toEqual({ ok: false, error: "You must be signed in." });
  });
});
