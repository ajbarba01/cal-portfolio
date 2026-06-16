/**
 * Regression tests for the booking input schema's id validation.
 *
 * The session userId (and DB-issued pet ids) are server-trusted, not free-form
 * user input. They must accept any canonical 8-4-4-4-12 hex uuid — including
 * ones whose version/variant nibbles fall outside RFC 9562, which strict
 * `z.uuid()` rejects. A too-strict check here surfaced as a "userId Invalid
 * UUID" error that pre-empted the booking quote/requirements gate.
 */

import { describe, it, expect } from "vitest";
import { createBookingInputSchema } from "./booking-service-shared";

// Variant nibble 'c' (not in the RFC set 8/9/a/b) → rejected by strict z.uuid(),
// but a perfectly valid 8-4-4-4-12 uuid shape that Postgres can store.
const NON_RFC_UUID = "12345678-1234-1234-c234-123456789abc";

const baseInput = {
  serviceSlug: "walk",
  startsAt: "2026-07-01T10:00:00.000Z",
  endsAt: "2026-07-01T11:00:00.000Z",
  quantities: {},
  recurringRule: null,
};

describe("createBookingInputSchema id validation", () => {
  it("accepts a canonical-shape uuid whose variant is outside the RFC set", () => {
    const result = createBookingInputSchema.safeParse({
      ...baseInput,
      userId: NON_RFC_UUID,
      petIds: [NON_RFC_UUID],
    });
    expect(result.success).toBe(true);
  });

  it("still rejects a userId that is not a uuid shape at all", () => {
    const result = createBookingInputSchema.safeParse({
      ...baseInput,
      userId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "userId")).toBe(
        true,
      );
    }
  });
});
