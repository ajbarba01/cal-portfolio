import { describe, expect, it } from "vitest";

import { paginate } from "./pagination";

const items = Array.from({ length: 25 }, (_, i) => i + 1); // 1..25

describe("paginate", () => {
  it("returns the first page slice and a correct page count", () => {
    const page = paginate(items, 1, 10);
    expect(page.items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(page.page).toBe(1);
    expect(page.pageCount).toBe(3);
  });

  it("returns the requested middle page slice", () => {
    expect(paginate(items, 2, 10).items).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
  });

  it("returns a short final page", () => {
    const page = paginate(items, 3, 10);
    expect(page.items).toEqual([21, 22, 23, 24, 25]);
    expect(page.page).toBe(3);
  });

  it("clamps a page above pageCount down to the last page", () => {
    const page = paginate(items, 99, 10);
    expect(page.page).toBe(3);
    expect(page.items).toEqual([21, 22, 23, 24, 25]);
  });

  it("clamps a page below 1 up to page 1", () => {
    const page = paginate(items, 0, 10);
    expect(page.page).toBe(1);
    expect(page.items[0]).toBe(1);
  });

  it("reports pageCount 1 and empty items for an empty list", () => {
    const page = paginate<number>([], 1, 10);
    expect(page.items).toEqual([]);
    expect(page.page).toBe(1);
    expect(page.pageCount).toBe(1);
  });

  it("does not mutate the input array", () => {
    const input = [...items];
    paginate(input, 2, 10);
    expect(input).toEqual(items);
  });
});
