import { describe, it, expect } from "vitest";
import {
  authErrorMessage,
  GENERIC_FAILURE,
  SIGN_IN_FAILED,
  SIGN_IN_LINK_EXPIRED,
} from "./auth-errors";

describe("authErrorMessage", () => {
  it("tells a visitor whose claim link is gone to request a new one", () => {
    expect(authErrorMessage("claim_expired", SIGN_IN_FAILED)).toBe(
      SIGN_IN_LINK_EXPIRED,
    );
  });

  it("names the expired link for Supabase's own expiry codes", () => {
    for (const code of [
      "flow_state_expired",
      "flow_state_not_found",
      "invite_not_found",
      "otp_expired",
    ]) {
      expect(authErrorMessage(code, SIGN_IN_FAILED)).toBe(SIGN_IN_LINK_EXPIRED);
    }
  });

  it("reads a failed auth callback as a plain sign-in failure", () => {
    expect(authErrorMessage("auth_callback_failed", SIGN_IN_FAILED)).toBe(
      SIGN_IN_FAILED,
    );
  });

  it("does not disclose which half of the credentials was wrong", () => {
    expect(authErrorMessage("invalid_credentials", SIGN_IN_FAILED)).toBe(
      SIGN_IN_FAILED,
    );
    expect(authErrorMessage("email_not_confirmed", SIGN_IN_FAILED)).toBe(
      SIGN_IN_FAILED,
    );
  });

  it("falls back for unknown, missing and absent codes", () => {
    expect(authErrorMessage("not_a_real_code", SIGN_IN_FAILED)).toBe(
      SIGN_IN_FAILED,
    );
    expect(authErrorMessage(undefined, GENERIC_FAILURE)).toBe(GENERIC_FAILURE);
    expect(authErrorMessage(null, GENERIC_FAILURE)).toBe(GENERIC_FAILURE);
    expect(authErrorMessage("", GENERIC_FAILURE)).toBe(GENERIC_FAILURE);
  });
});
