import { describe, it, expect } from "vitest";
import { estimateDrivingMinutes, deriveApproval } from "./distance";

const cfg = { roadFactor: 1.3, avgSpeedMph: 40 };
// Cal's seed thresholds: auto under 8 mi, refuse beyond 50 mi.
const milesCfg = {
  autoApproveMiles: 8,
  hardCutoffMiles: 50,
  useRoadMiles: false,
  roadFactor: 1.3,
};

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
  it("returns 'auto' well under the auto threshold", () => {
    expect(deriveApproval(3, milesCfg)).toBe("auto");
  });

  it("returns 'auto' at exactly autoApproveMiles (boundary: > not >=)", () => {
    expect(deriveApproval(8, milesCfg)).toBe("auto");
  });

  it("returns 'manual' just above autoApproveMiles", () => {
    expect(deriveApproval(8.001, milesCfg)).toBe("manual");
  });

  it("returns 'manual' in the mid band (8–50 mi)", () => {
    expect(deriveApproval(25, milesCfg)).toBe("manual");
  });

  it("returns 'manual' at exactly hardCutoffMiles (boundary: > not >=)", () => {
    expect(deriveApproval(50, milesCfg)).toBe("manual");
  });

  it("returns 'refuse' just above hardCutoffMiles", () => {
    expect(deriveApproval(50.001, milesCfg)).toBe("refuse");
  });

  it("returns 'refuse' well beyond the hard cutoff", () => {
    expect(deriveApproval(120, milesCfg)).toBe("refuse");
  });

  describe("useRoadMiles", () => {
    const roadCfg = { ...milesCfg, useRoadMiles: true, roadFactor: 1.3 };

    it("scales straight-line miles by roadFactor before gating", () => {
      // 7 mi straight-line × 1.3 = 9.1 road mi → above the 8 mi auto threshold
      expect(deriveApproval(7, roadCfg)).toBe("manual");
      // same 7 mi straight-line auto-approves when the road switch is off
      expect(deriveApproval(7, milesCfg)).toBe("auto");
    });

    it("can push a mid-band distance over the hard cutoff", () => {
      // 40 mi × 1.3 = 52 road mi → refuse
      expect(deriveApproval(40, roadCfg)).toBe("refuse");
    });
  });
});
