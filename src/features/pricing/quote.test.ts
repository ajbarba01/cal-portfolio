/**
 * Behavioral tests for the public `quote()` surface, run against the pricing
 * configuration the migrations actually seed.
 *
 * These read `SEEDED_PRICING_CONFIGS` rather than restating the rates, so a rate
 * change lands in one place and every golden number here is re-derived from it.
 * `evaluate.test.ts` covers the engine's mechanics with minimal configs; this
 * suite covers what Cal's real rate card adds up to.
 */

import { describe, it, expect } from "vitest";
import { quote } from "./quote";
import { SEEDED_PRICING_CONFIGS } from "@/test-stubs/seed-fixture";

const HS = SEEDED_PRICING_CONFIGS.house_sitting;
const WALK = SEEDED_PRICING_CONFIGS.walk;
const CHECK_IN = SEEDED_PRICING_CONFIGS.check_in;

// ---------------------------------------------------------------------------
// Behavior 1: Pet priority — the base night covers the stay's first pet
// ---------------------------------------------------------------------------

describe("quote — pet priority", () => {
  it("dog#1 absorbed into base: 1 dog, 1 night → base only (6000)", () => {
    const r = quote({ config: HS, dogs: 1, nights: 1 });
    expect(r.finalCents).toBe(6000);
    expect(
      r.lines.some((l) => l.label.toLowerCase().includes("additional dog")),
    ).toBe(false);
  });

  it("dog#2 adds a surcharge on top of the base", () => {
    // base 6000 + dog#2 tier 1500 = 7500 for 1 night
    const r = quote({ config: HS, dogs: 2, nights: 1 });
    expect(r.finalCents).toBe(7500);
  });

  it("cat#1 is base when no dogs: the cat-only toggle reduces the base", () => {
    // base 6000 − 2500 (cat-only toggle) = 3500; no cat surcharge for cat#1
    const r = quote({ config: HS, dogs: 0, cats: 1, nights: 1 });
    expect(r.finalCents).toBe(3500);
    expect(
      r.lines.some((l) => l.label.toLowerCase().includes("extra cat")),
    ).toBe(false);
  });

  it("cat#2 adds a surcharge in a cat-only home", () => {
    // base 6000 − 2500 + cat#2 surcharge 800 = 4300 for 1 night
    const r = quote({ config: HS, dogs: 0, cats: 2, nights: 2 });
    expect(r.finalCents).toBe(8600);
  });

  it("a stay for one bird is charged the nightly base, not nothing", () => {
    // The seeded config allows every species. Before the base covered pets other
    // than dogs and cats this priced at −4000: no base line at all, the no-dog
    // toggle still coming off it, and the bird billed on top as an extra.
    const r = quote({ config: HS, dogs: 0, cats: 0, others: 1, nights: 2 });
    const base = r.lines.find((l) => l.label.startsWith("House sitting base"));
    expect(base?.amountCents).toBe(12000);
    // The bird is the base pet, so it is not also billed as an extra.
    expect(r.lines.some((l) => l.label.startsWith("Extra small animal"))).toBe(
      false,
    );
    // The seeded "Cat-only home" discount is keyed on `catsOnly`, so a stay with
    // no cat in it does not take it: the total is the base line and nothing else.
    expect(r.finalCents).toBe(12000);
  });

  it("a rabbit alongside a dog bills as an extra, named not keyed", () => {
    // base 6000 + 2 × 500 = 7000, and the receipt says "small animal" rather
    // than leaking the config's `other` unit key.
    const r = quote({ config: HS, dogs: 1, others: 2, nights: 1 });
    expect(r.lines.map((l) => l.label)).toContain("Extra small animal (2)");
    expect(r.finalCents).toBe(7000);
  });
});

// ---------------------------------------------------------------------------
// Behavior 2: Premium surcharge
// ---------------------------------------------------------------------------

describe("quote — premium surcharge", () => {
  it("walk: premiumNights:1 adds +20% whole-booking surcharge", () => {
    // 1h, 1 dog = 2500 base; +20% premium = 500; total 3000
    const withPremium = quote({
      config: WALK,
      hours: 1,
      dogs: 1,
      premiumNights: 1,
    });
    const withoutPremium = quote({ config: WALK, hours: 1, dogs: 1 });
    const premiumLine = withPremium.lines.find((l) =>
      l.label.toLowerCase().includes("premium"),
    );
    expect(premiumLine).toBeDefined();
    expect(withPremium.finalCents).toBe(withoutPremium.finalCents + 500);
  });

  it("no premium line when premiumNights absent or zero", () => {
    const r = quote({ config: WALK, hours: 1, dogs: 1 });
    expect(r.lines.some((l) => l.label.toLowerCase().includes("premium"))).toBe(
      false,
    );
  });

  it("house_sitting: the surcharge is charged per premium night, not per stay", () => {
    // 1 dog, 5 nights = 30000 base. One premium night is a fifth of the stay, so
    // the +20% applies to a fifth of it (1200); five premium nights charge the
    // full 6000. That ratio is the whole point of the perPremiumNight scope.
    const oneNight = quote({
      config: HS,
      dogs: 1,
      nights: 5,
      premiumNights: 1,
    });
    const everyNight = quote({
      config: HS,
      dogs: 1,
      nights: 5,
      premiumNights: 5,
    });
    const premium = (r: typeof oneNight) =>
      r.lines.find((l) => l.label.startsWith("Premium night"))?.amountCents;
    expect(premium(oneNight)).toBe(1200);
    expect(premium(everyNight)).toBe(6000);
  });
});

// ---------------------------------------------------------------------------
// Behavior 3: Minimum charge
// ---------------------------------------------------------------------------

describe("quote — minimum charge", () => {
  it("check_in: a 15-minute visit is topped up to the 1500 floor", () => {
    // 0.25h × 2500 = 625, below the 1500 floor.
    const r = quote({ config: CHECK_IN, hours: 0.25 });
    expect(r.lines.find((l) => l.label === "Minimum charge")?.amountCents).toBe(
      875,
    );
    expect(r.finalCents).toBe(1500);
  });

  it("check_in: a visit already over the floor is left alone", () => {
    const r = quote({ config: CHECK_IN, hours: 1 });
    expect(r.lines.some((l) => l.label === "Minimum charge")).toBe(false);
    expect(r.finalCents).toBe(2500);
  });
});

// ---------------------------------------------------------------------------
// Behavior 4: Travel appended last and never discounted
// ---------------------------------------------------------------------------

describe("quote — travel appended last, never discounted", () => {
  it("travel line appears even when recurring discount applied", () => {
    // recurring reduces the base but travel is phase-7 (post-discount)
    const r = quote({
      config: WALK,
      hours: 1,
      dogs: 1,
      billableMiles: 10,
      recurringSeries: true,
    });
    const travelLine = r.lines.find((l) => l.label === "Travel");
    // (10 − 5 free) × 200 = 1000, untouched by −5% recurring
    expect(travelLine?.amountCents).toBe(1000);
  });

  it("travel is the last line in the array", () => {
    const r = quote({
      config: WALK,
      hours: 1,
      dogs: 1,
      billableMiles: 10,
      recurringSeries: true,
    });
    const lastLine = r.lines[r.lines.length - 1];
    expect(lastLine?.label).toBe("Travel");
  });

  it("no travel line when billableMiles within free allowance", () => {
    const r = quote({ config: WALK, hours: 1, dogs: 1, billableMiles: 3 });
    expect(r.lines.some((l) => l.label === "Travel")).toBe(false);
  });

  it("a complimentary booking drops the travel line and comes out at zero", () => {
    // Travel is quoted after every discount, so a −100% discount cannot reach
    // it. The engine leaves the mileage out instead (DECISIONS 4).
    const r = quote({
      config: WALK,
      hours: 1,
      dogs: 1,
      billableMiles: 10,
      enabledManualIds: ["complimentary"],
    });
    expect(r.lines.some((l) => l.label === "Travel")).toBe(false);
    expect(r.finalCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Behavior 5: Recurring auto-discount
// ---------------------------------------------------------------------------

describe("quote — recurring auto-discount", () => {
  it("walk: recurringSeries applies −5% discount automatically", () => {
    // 1h 1 dog = 2500 base; −5% = 125; final 2375
    const r = quote({
      config: WALK,
      hours: 1,
      dogs: 1,
      recurringSeries: true,
    });
    const discountLine = r.lines.find((l) =>
      l.label.toLowerCase().includes("recurring"),
    );
    expect(discountLine?.amountCents).toBe(-125);
    expect(r.finalCents).toBe(2375);
  });

  it("no recurring line when recurringSeries is false/absent", () => {
    const r = quote({ config: WALK, hours: 1, dogs: 1 });
    expect(
      r.lines.some((l) => l.label.toLowerCase().includes("recurring")),
    ).toBe(false);
  });

  it("house_sitting: a recurring stay costs the same — the config offers no such discount", () => {
    const r = quote({
      config: HS,
      dogs: 1,
      nights: 1,
      recurringSeries: true,
    });
    expect(
      r.lines.some((l) => l.label.toLowerCase().includes("recurring")),
    ).toBe(false);
    expect(r.finalCents).toBe(6000);
  });
});

// ---------------------------------------------------------------------------
// Behavior 6: Manual discounts — only when enabledManualIds names them
// ---------------------------------------------------------------------------

describe("quote — manual discounts", () => {
  it("kiche discount applied only when enabledManualIds includes 'kiche'", () => {
    // walk: 1h 1 dog = 2500 base; kiche −15% = 375; final 2125
    const r = quote({
      config: WALK,
      hours: 1,
      dogs: 1,
      enabledManualIds: ["kiche"],
    });
    const kicheLine = r.lines.find((l) =>
      l.label.toLowerCase().includes("kiche"),
    );
    expect(kicheLine?.amountCents).toBe(-375);
    expect(r.finalCents).toBe(2125);
  });

  it("kiche discount absent when enabledManualIds is empty", () => {
    const r = quote({
      config: WALK,
      hours: 1,
      dogs: 1,
      enabledManualIds: [],
    });
    expect(r.lines.some((l) => l.label.toLowerCase().includes("kiche"))).toBe(
      false,
    );
  });

  it("kiche discount absent when enabledManualIds is not provided", () => {
    const r = quote({ config: WALK, hours: 1, dogs: 1 });
    expect(r.lines.some((l) => l.label.toLowerCase().includes("kiche"))).toBe(
      false,
    );
  });

  it("house_sitting: kiche −15% applied when enabled", () => {
    // 1 dog 1 night = 6000; kiche −15% = 900; final 5100
    const r = quote({
      config: HS,
      dogs: 1,
      nights: 1,
      enabledManualIds: ["kiche"],
    });
    expect(
      r.lines.find((l) => l.label.toLowerCase().includes("kiche"))?.amountCents,
    ).toBe(-900);
    expect(r.finalCents).toBe(5100);
  });

  it("two manual discounts compound in config order", () => {
    // walk 1h 1 dog = 2500; kiche −15% = 375 → 2125; friends & family −50% of
    // 2125 = 1063 (rounded up from 1062.5) → 1062.
    const r = quote({
      config: WALK,
      hours: 1,
      dogs: 1,
      enabledManualIds: ["friends_family", "kiche"],
    });
    expect(r.lines.map((l) => l.amountCents)).toEqual([2500, -375, -1063]);
    expect(r.finalCents).toBe(1062);
  });
});

// ---------------------------------------------------------------------------
// Behavior 7: Stacking order — every phase on one booking
// ---------------------------------------------------------------------------

describe("quote — stacking order", () => {
  it("house_sitting: base → add-ons → premium → auto discounts → manual → travel", () => {
    // 7 nights, 2 dogs (one a puppy), 1 cat, needy tier 2, 60 min exercise/day,
    // 2 premium nights, 10 travel miles, Kiche applied.
    //   base            6000 × 7            = 42000
    //   puppy household −1000 × 7           =  −7000
    //   dog #2           1500 × 7           = +10500
    //   cat #1            800 × 7           =  +5600
    //   needy tier 2      500 × 2 × 7       =  +7000
    //   exercise 1 block  500 × 7           =  +3500   → 61600
    //   premium         20% × 61600 × 2/7   =  +3520   → 65120
    //   long stay        −5% × 65120        =  −3256   → 61864
    //   extended stay    −5% × 61864        =  −3093   → 58771
    //   kiche           −15% × 58771        =  −8816   → 49955
    //   travel          (10 − 5) × 250      =  +1250   → 51205
    const r = quote({
      config: HS,
      dogs: 2,
      cats: 1,
      nights: 7,
      anyDogUnder6mo: true,
      needyTier: 2,
      exerciseMinutesPerDay: 60,
      premiumNights: 2,
      billableMiles: 10,
      enabledManualIds: ["kiche"],
    });

    expect(r.lines.map((l) => l.label)).toEqual([
      "House sitting base (7 nights)",
      "Puppy household",
      "Additional dog",
      "Extra cat (1)",
      "Needy pet care",
      "Extra exercise",
      "Premium night (+20%)",
      "Long stay (-5%)",
      "Extended stay (-5%)",
      "Kiche discount (-15%)",
      "Travel",
    ]);
    expect(r.lines.map((l) => l.amountCents)).toEqual([
      42000, -7000, 10500, 5600, 7000, 3500, 3520, -3256, -3093, -8816, 1250,
    ]);
    expect(r.finalCents).toBe(51205);
  });
});

// ---------------------------------------------------------------------------
// Behavior 8: Sum invariant — finalCents === Σ line amounts
// ---------------------------------------------------------------------------

describe("quote — sum invariant", () => {
  it("house_sitting with all modifiers: finalCents === sum(lines)", () => {
    const r = quote({
      config: HS,
      dogs: 2,
      cats: 1,
      others: 1,
      nights: 3,
      premiumNights: 1,
      enabledManualIds: ["kiche"],
      billableMiles: 10,
    });
    const summed = r.lines.reduce((acc, l) => acc + l.amountCents, 0);
    expect(r.finalCents).toBe(summed);
  });

  it("walk with all modifiers: finalCents === sum(lines)", () => {
    const r = quote({
      config: WALK,
      hours: 1,
      dogs: 2,
      leashManners: true,
      billableMiles: 8,
      premiumNights: 1,
      recurringSeries: true,
      enabledManualIds: ["kiche"],
    });
    const summed = r.lines.reduce((acc, l) => acc + l.amountCents, 0);
    expect(r.finalCents).toBe(summed);
  });
});

// ---------------------------------------------------------------------------
// Behavior 9: the free service quotes to nothing
// ---------------------------------------------------------------------------

describe("quote — the seeded free service", () => {
  it("meet_greet carries no modifiers, so it produces no lines and no charge", () => {
    const r = quote({ config: SEEDED_PRICING_CONFIGS.meet_greet, dogs: 1 });
    expect(r.finalCents).toBe(0);
    expect(r.lines).toHaveLength(0);
  });
});
