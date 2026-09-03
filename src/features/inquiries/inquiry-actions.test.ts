/**
 * The admin alert on a new inquiry.
 *
 * The contact form answers a honeypot hit with the same success the real form
 * gets, and deliberately stores nothing. So the alert has to hang off the
 * insert rather than off the result: dispatching on success alone would mail
 * Cal every bot submission the honeypot exists to swallow.
 */

import { describe, it, expect, vi } from "vitest";
import { createFakeSupabase } from "@/test-stubs/fake-supabase";

const { notifyAdmin } = vi.hoisted(() => ({ notifyAdmin: vi.fn() }));

vi.mock("@/features/notifications", () => ({ notifyAdmin }));

import { submitInquiryCore } from "./inquiry-actions";
import type { SubmitInquiryInput } from "./inquiry-schema";

const INPUT: SubmitInquiryInput = {
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "555-0100",
  subject: "",
  message: "Do you have a Tuesday walk free?",
};

describe("submitInquiryCore admin alert", () => {
  it("alerts Cal with the stored message once the inquiry is inserted", async () => {
    const supabase = createFakeSupabase();

    const result = await submitInquiryCore(supabase, null, INPUT);

    expect(result).toEqual({ ok: true });
    expect(
      supabase.calls({ table: "inquiries", method: "insert" }),
    ).toHaveLength(1);
    expect(notifyAdmin).toHaveBeenCalledWith({
      type: "inquiry_received",
      payload: {
        name: "Jane Doe",
        email: "jane@example.com",
        phone: "555-0100",
        // The form's optional subject arrives as an empty string; the alert
        // carries the same null the row stores.
        subject: null,
        message: "Do you have a Tuesday walk free?",
      },
    });
  });

  it("stays silent on a honeypot submission, which stores nothing", async () => {
    const supabase = createFakeSupabase();

    const result = await submitInquiryCore(supabase, null, {
      ...INPUT,
      company: "Acme Bots",
    });

    expect(result).toEqual({ ok: true });
    expect(supabase.calls({ method: "insert" })).toHaveLength(0);
    expect(notifyAdmin).not.toHaveBeenCalled();
  });
});
