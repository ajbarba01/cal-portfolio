import { describe, it, expect, vi } from "vitest";
import { claimAccountCore } from "./claim-actions";

function makeDeps(opts: {
  userId?: string | null;
  updateUserError?: { message: string } | null;
  profileError?: { message: string } | null;
}) {
  const {
    userId = "user-1",
    updateUserError = null,
    profileError = null,
  } = opts;
  const sessionClient = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: null,
      }),
      updateUser: vi.fn().mockResolvedValue({ error: updateUserError }),
    },
  };
  const profileUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: profileError }),
  });
  const serviceClient = { from: vi.fn(() => ({ update: profileUpdate })) };
  return {
    sessionClient: sessionClient as never,
    serviceClient: serviceClient as never,
    profileUpdate,
  };
}

describe("claimAccountCore", () => {
  it("rejects when not authenticated", async () => {
    const d = makeDeps({ userId: null });
    const r = await claimAccountCore(
      { sessionClient: d.sessionClient, serviceClient: d.serviceClient },
      "longenoughpw",
    );
    expect(r.kind).toBe("unauthenticated");
  });
  it("rejects a too-short password", async () => {
    const d = makeDeps({});
    const r = await claimAccountCore(
      { sessionClient: d.sessionClient, serviceClient: d.serviceClient },
      "short",
    );
    expect(r.kind).toBe("validation_error");
  });
  it("sets the password and stamps unclaimed=false + claimed_at", async () => {
    const d = makeDeps({});
    const r = await claimAccountCore(
      { sessionClient: d.sessionClient, serviceClient: d.serviceClient },
      "longenoughpw",
    );
    expect(r.kind).toBe("success");
    expect(d.profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        unclaimed: false,
        claimed_at: expect.any(String),
      }),
    );
  });
});
