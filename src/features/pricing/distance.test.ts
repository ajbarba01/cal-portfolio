import { describe, it, expect } from "vitest";
import {
  estimateDrivingMinutes,
  deriveApproval,
  deriveApprovalWithReasons,
} from "./distance";

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

  describe("useRoadMiles (deriveApproval)", () => {
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

// ---------------------------------------------------------------------------
// deriveApprovalWithReasons
// ---------------------------------------------------------------------------

const base = {
  autoApproveMiles: 10,
  hardCutoffMiles: 30,
  useRoadMiles: true,
  roadFactor: 1.3,
};

describe("deriveApprovalWithReasons", () => {
  it("house-sit always manual with service_manual_only reason", () => {
    const r = deriveApprovalWithReasons({
      miles: 1,
      ...base,
      requiresApproval: true,
      locationKnown: true,
    });
    expect(r.decision).toBe("manual");
    expect(r.reasons.some((x) => x.code === "service_manual_only")).toBe(true);
  });

  it("unknown location → manual + location_unknown", () => {
    const r = deriveApprovalWithReasons({
      miles: 0,
      ...base,
      requiresApproval: false,
      locationKnown: false,
    });
    expect(r.decision).toBe("manual");
    expect(r.reasons[0].code).toBe("location_unknown");
  });

  it("far → refuse with distance_refuse block", () => {
    const r = deriveApprovalWithReasons({
      miles: 40,
      ...base,
      requiresApproval: false,
      locationKnown: true,
    });
    expect(r.decision).toBe("refuse");
    expect(
      r.reasons.some(
        (x) => x.code === "distance_refuse" && x.severity === "block",
      ),
    ).toBe(true);
  });

  it("soft-warn for housesit beyond softDistanceWarnMiles (warn, not block)", () => {
    const r = deriveApprovalWithReasons({
      miles: 16,
      ...base,
      requiresApproval: true,
      locationKnown: true,
      softDistanceWarnMiles: 15,
    });
    expect(
      r.reasons.some(
        (x) => x.code === "distance_unlikely" && x.severity === "warn",
      ),
    ).toBe(true);
  });

  it("auto when near, no flags, location known", () => {
    const r = deriveApprovalWithReasons({
      miles: 2,
      ...base,
      requiresApproval: false,
      locationKnown: true,
    });
    expect(r.decision).toBe("auto");
    expect(r.reasons).toHaveLength(0);
  });

  it("refuse takes precedence over manual (service + far)", () => {
    const r = deriveApprovalWithReasons({
      miles: 40,
      ...base,
      requiresApproval: true,
      locationKnown: true,
    });
    expect(r.decision).toBe("refuse");
  });

  it("distance_manual reason when gatedMiles > autoApproveMiles but under hard cutoff", () => {
    // 10 mi * 1.3 = 13 gatedMiles → above autoApproveMiles(10), under hardCutoffMiles(30)
    const r = deriveApprovalWithReasons({
      miles: 10,
      ...base,
      requiresApproval: false,
      locationKnown: true,
    });
    expect(r.decision).toBe("manual");
    expect(r.reasons.some((x) => x.code === "distance_manual")).toBe(true);
  });

  it("message contains the rounded gatedMiles", () => {
    // 10 mi * 1.3 = 13 gatedMiles
    const r = deriveApprovalWithReasons({
      miles: 10,
      ...base,
      requiresApproval: false,
      locationKnown: true,
    });
    const msg =
      r.reasons.find((x) => x.code === "distance_manual")?.message ?? "";
    expect(msg).toMatch(/13/);
  });

  it("distance_unlikely warn alone does not refuse (co-exists with manual)", () => {
    // 16 * 1.3 = 20.8 gatedMiles → above autoApproveMiles(10) AND above softDistanceWarnMiles(15)
    const r = deriveApprovalWithReasons({
      miles: 16,
      ...base,
      requiresApproval: false,
      locationKnown: true,
      softDistanceWarnMiles: 15,
    });
    expect(r.decision).toBe("manual");
    expect(r.reasons.some((x) => x.code === "distance_unlikely")).toBe(true);
    expect(r.reasons.some((x) => x.code === "distance_manual")).toBe(true);
  });
});
