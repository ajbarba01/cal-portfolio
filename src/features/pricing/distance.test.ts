import { describe, it, expect } from "vitest";
import { estimateDrivingMinutes, deriveApproval } from "./distance";

const cfg = { roadFactor: 1.3, avgSpeedMph: 40 };
const approvalCfg = { autoApproveMin: 60, hardCutoffMin: 120 };

describe("estimateDrivingMinutes", () => {
  it("returns ~46.8 minutes for 24 miles with road factor 1.3 @ 40 mph", () => {
    // 24 * 1.3 / 40 * 60 = 46.8
    expect(estimateDrivingMinutes(24, cfg)).toBeCloseTo(46.8, 1);
  });

  it("returns 0 for 0 miles", () => {
    expect(estimateDrivingMinutes(0, cfg)).toBe(0);
  });
});

describe("deriveApproval", () => {
  it("returns 'auto' when well under the threshold", () => {
    expect(deriveApproval(46.8, approvalCfg)).toBe("auto");
  });

  it("returns 'auto' at exactly autoApproveMin (boundary: > not >=)", () => {
    expect(deriveApproval(60, approvalCfg)).toBe("auto");
  });

  it("returns 'manual' just above autoApproveMin", () => {
    expect(deriveApproval(60.001, approvalCfg)).toBe("manual");
  });

  it("returns 'manual' for 90 minutes", () => {
    expect(deriveApproval(90, approvalCfg)).toBe("manual");
  });

  it("returns 'manual' at exactly hardCutoffMin (boundary: > not >=)", () => {
    expect(deriveApproval(120, approvalCfg)).toBe("manual");
  });

  it("returns 'refuse' just above hardCutoffMin", () => {
    expect(deriveApproval(120.001, approvalCfg)).toBe("refuse");
  });

  it("returns 'refuse' for 130 minutes", () => {
    expect(deriveApproval(130, approvalCfg)).toBe("refuse");
  });
});
