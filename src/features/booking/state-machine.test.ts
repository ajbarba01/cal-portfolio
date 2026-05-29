import { describe, it, expect } from "vitest";
import { transition } from "./state-machine";
import type {
  BookingState,
  BookingEvent,
  BookingStatus,
} from "./state-machine";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Context that triggers auto-approval (requiresApproval = false). */
const AUTO_APPROVE = { requiresApproval: false } as const;
/** Context that requires manual approval. */
const NEEDS_APPROVAL = { requiresApproval: true } as const;

// ---------------------------------------------------------------------------
// Valid transitions (happy paths)
// ---------------------------------------------------------------------------

describe("transition: submit from draft", () => {
  it("draft + submit + requiresApproval=true → pending_approval", () => {
    const result = transition("draft", "submit", NEEDS_APPROVAL);
    expect("state" in result).toBe(true);
    if ("state" in result) {
      expect(result.state).toBe("pending_approval");
    }
  });

  it("draft + submit + requiresApproval=false → confirmed", () => {
    const result = transition("draft", "submit", AUTO_APPROVE);
    expect("state" in result).toBe(true);
    if ("state" in result) {
      expect(result.state).toBe("confirmed");
    }
  });
});

describe("transition: pending_approval", () => {
  it("pending_approval + approve → confirmed", () => {
    const result = transition("pending_approval", "approve", AUTO_APPROVE);
    expect("state" in result).toBe(true);
    if ("state" in result) {
      expect(result.state).toBe("confirmed");
    }
  });

  it("pending_approval + decline → declined", () => {
    const result = transition("pending_approval", "decline", AUTO_APPROVE);
    expect("state" in result).toBe(true);
    if ("state" in result) {
      expect(result.state).toBe("declined");
    }
  });

  it("pending_approval + cancel → cancelled", () => {
    const result = transition("pending_approval", "cancel", AUTO_APPROVE);
    expect("state" in result).toBe(true);
    if ("state" in result) {
      expect(result.state).toBe("cancelled");
    }
  });
});

describe("transition: confirmed", () => {
  it("confirmed + complete → completed", () => {
    const result = transition("confirmed", "complete", AUTO_APPROVE);
    expect("state" in result).toBe(true);
    if ("state" in result) {
      expect(result.state).toBe("completed");
    }
  });

  it("confirmed + cancel → cancelled", () => {
    const result = transition("confirmed", "cancel", AUTO_APPROVE);
    expect("state" in result).toBe(true);
    if ("state" in result) {
      expect(result.state).toBe("cancelled");
    }
  });
});

// ---------------------------------------------------------------------------
// Terminal states: every event must return {error}, never throw
// ---------------------------------------------------------------------------

describe("transition: terminal states reject all events", () => {
  const TERMINAL_STATES: BookingStatus[] = [
    "completed",
    "declined",
    "cancelled",
  ];
  const ALL_EVENTS: BookingEvent[] = [
    "submit",
    "approve",
    "decline",
    "complete",
    "cancel",
  ];

  for (const state of TERMINAL_STATES) {
    for (const event of ALL_EVENTS) {
      it(`${state} + ${event} → {error} (never throws)`, () => {
        let result: ReturnType<typeof transition>;
        expect(() => {
          result = transition(state, event, AUTO_APPROVE);
        }).not.toThrow();
        expect("error" in result!).toBe(true);
        if ("error" in result!) {
          expect(typeof result.error).toBe("string");
          expect(result.error.length).toBeGreaterThan(0);
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Invalid (state, event) pairs — not listed in the spec
// ---------------------------------------------------------------------------

describe("transition: invalid pairs return {error} without throwing", () => {
  const INVALID_PAIRS: Array<[BookingState, BookingEvent]> = [
    // draft: only submit is valid
    ["draft", "approve"],
    ["draft", "decline"],
    ["draft", "complete"],
    ["draft", "cancel"],
    // confirmed: approve and decline are not valid
    ["confirmed", "approve"],
    ["confirmed", "decline"],
    ["confirmed", "submit"],
    // pending_approval: complete and submit are not valid
    ["pending_approval", "complete"],
    ["pending_approval", "submit"],
  ];

  for (const [state, event] of INVALID_PAIRS) {
    it(`${state} + ${event} → {error} (never throws)`, () => {
      let result: ReturnType<typeof transition>;
      expect(() => {
        result = transition(state, event, AUTO_APPROVE);
      }).not.toThrow();
      expect("error" in result!).toBe(true);
      if ("error" in result!) {
        expect(typeof result.error).toBe("string");
        expect(result.error.length).toBeGreaterThan(0);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Result shape invariants
// ---------------------------------------------------------------------------

describe("transition: result shape invariants", () => {
  it("success result has 'state' key with a BookingStatus value (never 'draft')", () => {
    const result = transition("draft", "submit", AUTO_APPROVE);
    expect("state" in result).toBe(true);
    if ("state" in result) {
      // 'draft' must never appear in a success result
      expect(result.state).not.toBe("draft");
    }
  });

  it("error result has non-empty 'error' string", () => {
    const result = transition("draft", "approve", AUTO_APPROVE);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBeTruthy();
    }
  });

  it("success result does NOT have 'error' key", () => {
    const result = transition("draft", "submit", AUTO_APPROVE);
    expect("error" in result).toBe(false);
  });

  it("error result does NOT have 'state' key", () => {
    const result = transition("draft", "approve", AUTO_APPROVE);
    expect("state" in result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Full transition matrix (data-driven exhaustive coverage)
// ---------------------------------------------------------------------------

describe("transition: exhaustive matrix", () => {
  type MatrixRow = {
    state: BookingState;
    event: BookingEvent;
    ctx: { requiresApproval: boolean };
    expected: { state: BookingStatus } | { error: true };
  };

  const matrix: MatrixRow[] = [
    // draft
    {
      state: "draft",
      event: "submit",
      ctx: NEEDS_APPROVAL,
      expected: { state: "pending_approval" },
    },
    {
      state: "draft",
      event: "submit",
      ctx: AUTO_APPROVE,
      expected: { state: "confirmed" },
    },
    {
      state: "draft",
      event: "approve",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },
    {
      state: "draft",
      event: "decline",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },
    {
      state: "draft",
      event: "complete",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },
    {
      state: "draft",
      event: "cancel",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },

    // pending_approval
    {
      state: "pending_approval",
      event: "approve",
      ctx: AUTO_APPROVE,
      expected: { state: "confirmed" },
    },
    {
      state: "pending_approval",
      event: "decline",
      ctx: AUTO_APPROVE,
      expected: { state: "declined" },
    },
    {
      state: "pending_approval",
      event: "cancel",
      ctx: AUTO_APPROVE,
      expected: { state: "cancelled" },
    },
    {
      state: "pending_approval",
      event: "complete",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },
    {
      state: "pending_approval",
      event: "submit",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },

    // confirmed
    {
      state: "confirmed",
      event: "complete",
      ctx: AUTO_APPROVE,
      expected: { state: "completed" },
    },
    {
      state: "confirmed",
      event: "cancel",
      ctx: AUTO_APPROVE,
      expected: { state: "cancelled" },
    },
    {
      state: "confirmed",
      event: "approve",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },
    {
      state: "confirmed",
      event: "decline",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },
    {
      state: "confirmed",
      event: "submit",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },

    // completed (terminal)
    {
      state: "completed",
      event: "submit",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },
    {
      state: "completed",
      event: "approve",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },
    {
      state: "completed",
      event: "decline",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },
    {
      state: "completed",
      event: "complete",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },
    {
      state: "completed",
      event: "cancel",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },

    // declined (terminal)
    {
      state: "declined",
      event: "submit",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },
    {
      state: "declined",
      event: "approve",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },
    {
      state: "declined",
      event: "decline",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },
    {
      state: "declined",
      event: "complete",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },
    {
      state: "declined",
      event: "cancel",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },

    // cancelled (terminal)
    {
      state: "cancelled",
      event: "submit",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },
    {
      state: "cancelled",
      event: "approve",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },
    {
      state: "cancelled",
      event: "decline",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },
    {
      state: "cancelled",
      event: "complete",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },
    {
      state: "cancelled",
      event: "cancel",
      ctx: AUTO_APPROVE,
      expected: { error: true },
    },
  ];

  for (const { state, event, ctx, expected } of matrix) {
    const label = `${state} + ${event} (requiresApproval=${ctx.requiresApproval})`;

    if ("state" in expected) {
      it(`${label} → state:${expected.state}`, () => {
        const result = transition(state, event, ctx);
        expect("state" in result).toBe(true);
        if ("state" in result) {
          expect(result.state).toBe(expected.state);
        }
      });
    } else {
      it(`${label} → {error}`, () => {
        let result: ReturnType<typeof transition>;
        expect(() => {
          result = transition(state, event, ctx);
        }).not.toThrow();
        expect("error" in result!).toBe(true);
        if ("error" in result!) {
          expect(typeof result.error).toBe("string");
          expect(result.error.length).toBeGreaterThan(0);
        }
      });
    }
  }
});
