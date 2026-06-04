import { describe, it, expect } from "vitest";
import { runEdges, runFillRounding, runOutlineClasses } from "./grid-runs";
import type { RunEdge, RunAxis } from "./grid-runs";

// ---------------------------------------------------------------------------
// runEdges
// ---------------------------------------------------------------------------

describe("runEdges", () => {
  it("empty input → empty map", () => {
    const result = runEdges([], () => null);
    expect(result.size).toBe(0);
  });

  it("single isolated member → {start:true, end:true}", () => {
    const result = runEdges(["a"], (id) => (id === "a" ? "sel" : null));
    expect(result.get("a")).toEqual({ start: true, end: true });
    expect(result.size).toBe(1);
  });

  it("non-members excluded from map", () => {
    const result = runEdges(["a", "b", "c"], (id) =>
      id === "b" ? "sel" : null,
    );
    expect(result.has("a")).toBe(false);
    expect(result.has("c")).toBe(false);
    expect(result.get("b")).toEqual({ start: true, end: true });
  });

  it("contiguous run of 3 same group → first cap, middle no-cap, last cap", () => {
    const result = runEdges(["a", "b", "c"], () => "sel");
    expect(result.get("a")).toEqual({ start: true, end: false });
    expect(result.get("b")).toEqual({ start: false, end: false });
    expect(result.get("c")).toEqual({ start: false, end: true });
  });

  it("gap (member, non-member, member) → two singletons each {true,true}", () => {
    const result = runEdges(["a", "b", "c"], (id) =>
      id === "b" ? null : "sel",
    );
    expect(result.get("a")).toEqual({ start: true, end: true });
    expect(result.get("c")).toEqual({ start: true, end: true });
    expect(result.has("b")).toBe(false);
  });

  it("two adjacent members of different groups → each capped on touching side", () => {
    const result = runEdges(["a", "b"], (id) => id); // groupOf("a")="a", groupOf("b")="b"
    expect(result.get("a")).toEqual({ start: true, end: true });
    expect(result.get("b")).toEqual({ start: true, end: true });
  });

  it("order respected as given (no sorting): list b,a,c where b and a share a group, c differs", () => {
    // pass in non-alpha order: b, a, c
    // b→group "x", a→group "x", c→group "y"
    // expected: b={start:true,end:false}, a={start:false,end:true}, c={start:true,end:true}
    const groups: Record<string, string> = { b: "x", a: "x", c: "y" };
    const result = runEdges(["b", "a", "c"], (id) => groups[id] ?? null);
    expect(result.get("b")).toEqual({ start: true, end: false });
    expect(result.get("a")).toEqual({ start: false, end: true });
    expect(result.get("c")).toEqual({ start: true, end: true });
  });

  it("long run: 5 same group → only first and last are caps", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const result = runEdges(ids, () => "grp");
    expect(result.get("a")).toEqual({ start: true, end: false });
    expect(result.get("b")).toEqual({ start: false, end: false });
    expect(result.get("c")).toEqual({ start: false, end: false });
    expect(result.get("d")).toEqual({ start: false, end: false });
    expect(result.get("e")).toEqual({ start: false, end: true });
  });

  it("interleaved groups: A B A — each A is isolated", () => {
    const grps: Record<string, string> = { a1: "A", b: "B", a2: "A" };
    const result = runEdges(["a1", "b", "a2"], (id) => grps[id] ?? null);
    expect(result.get("a1")).toEqual({ start: true, end: true });
    expect(result.get("b")).toEqual({ start: true, end: true });
    expect(result.get("a2")).toEqual({ start: true, end: true });
  });

  it("empty-string group key is a non-member (excluded)", () => {
    const result = runEdges(["a", "b"], (id) => (id === "a" ? "" : "grp"));
    expect(result.has("a")).toBe(false);
    expect(result.get("b")).toEqual({ start: true, end: true });
  });
});

// ---------------------------------------------------------------------------
// runFillRounding
// ---------------------------------------------------------------------------

describe("runFillRounding", () => {
  it("single cell horizontal → both rounded-l-md and rounded-r-md", () => {
    const cls = runFillRounding({ start: true, end: true }, "horizontal");
    expect(cls).toContain("rounded-l-md");
    expect(cls).toContain("rounded-r-md");
  });

  it("middle cell horizontal → neither rounded-l-md nor rounded-r-md", () => {
    const cls = runFillRounding({ start: false, end: false }, "horizontal");
    expect(cls).not.toContain("rounded-l-md");
    expect(cls).not.toContain("rounded-r-md");
  });

  it("start-only cell horizontal → rounded-l-md, no rounded-r-md", () => {
    const cls = runFillRounding({ start: true, end: false }, "horizontal");
    expect(cls).toContain("rounded-l-md");
    expect(cls).not.toContain("rounded-r-md");
  });

  it("single cell vertical → both rounded-t-md and rounded-b-md", () => {
    const cls = runFillRounding({ start: true, end: true }, "vertical");
    expect(cls).toContain("rounded-t-md");
    expect(cls).toContain("rounded-b-md");
  });

  it("middle cell vertical → neither rounded-t-md nor rounded-b-md", () => {
    const cls = runFillRounding({ start: false, end: false }, "vertical");
    expect(cls).not.toContain("rounded-t-md");
    expect(cls).not.toContain("rounded-b-md");
  });

  it("end-only cell horizontal → rounded-r-md, no rounded-l-md", () => {
    const cls = runFillRounding({ start: false, end: true }, "horizontal");
    expect(cls).toContain("rounded-r-md");
    expect(cls).not.toContain("rounded-l-md");
  });

  it("end-only cell vertical → rounded-b-md, no rounded-t-md", () => {
    const cls = runFillRounding({ start: false, end: true }, "vertical");
    expect(cls).toContain("rounded-b-md");
    expect(cls).not.toContain("rounded-t-md");
  });
});

// ---------------------------------------------------------------------------
// runOutlineClasses
// ---------------------------------------------------------------------------

describe("runOutlineClasses", () => {
  it("single cell horizontal → full border on all four sides + both rounding classes", () => {
    const cls = runOutlineClasses({ start: true, end: true }, "horizontal");
    expect(cls).toContain("border-t");
    expect(cls).toContain("border-b");
    expect(cls).toContain("border-l");
    expect(cls).toContain("border-r");
    expect(cls).toContain("rounded-l-md");
    expect(cls).toContain("rounded-r-md");
  });

  it("middle cell horizontal → top+bottom border only, no rounding", () => {
    const cls = runOutlineClasses({ start: false, end: false }, "horizontal");
    expect(cls).toContain("border-t");
    expect(cls).toContain("border-b");
    expect(cls).not.toContain("border-l");
    expect(cls).not.toContain("border-r");
    expect(cls).not.toContain("rounded-l-md");
    expect(cls).not.toContain("rounded-r-md");
  });

  it("single cell vertical → full border + both rounding classes", () => {
    const cls = runOutlineClasses({ start: true, end: true }, "vertical");
    expect(cls).toContain("border-t");
    expect(cls).toContain("border-b");
    expect(cls).toContain("border-l");
    expect(cls).toContain("border-r");
    expect(cls).toContain("rounded-t-md");
    expect(cls).toContain("rounded-b-md");
  });

  it("middle cell vertical → left+right border only, no rounding", () => {
    const cls = runOutlineClasses({ start: false, end: false }, "vertical");
    expect(cls).toContain("border-l");
    expect(cls).toContain("border-r");
    expect(cls).not.toContain("border-t");
    expect(cls).not.toContain("border-b");
    expect(cls).not.toContain("rounded-t-md");
    expect(cls).not.toContain("rounded-b-md");
  });
});
