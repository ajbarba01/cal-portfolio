import { describe, it, expect } from "vitest";
import { segmentCopy } from "./linkify";

describe("segmentCopy", () => {
  it("returns one prose segment when there are no markers", () => {
    expect(segmentCopy("plain prose")).toEqual([{ text: "plain prose" }]);
  });

  it("parses a link at the end of the string", () => {
    expect(segmentCopy("read reviews [here](/reviews)")).toEqual([
      { text: "read reviews " },
      { text: "here", href: "/reviews" },
    ]);
  });

  it("parses a link mid-sentence with prose on both sides", () => {
    expect(
      segmentCopy("through the [resources](/resources) available"),
    ).toEqual([
      { text: "through the " },
      { text: "resources", href: "/resources" },
      { text: " available" },
    ]);
  });

  it("parses a link at the very start", () => {
    expect(segmentCopy("[resources](/resources) are great")).toEqual([
      { text: "resources", href: "/resources" },
      { text: " are great" },
    ]);
  });

  it("disambiguates duplicate labels by position", () => {
    expect(segmentCopy("[home](/a) and [home](/b)")).toEqual([
      { text: "home", href: "/a" },
      { text: " and " },
      { text: "home", href: "/b" },
    ]);
  });

  it("links only the marked occurrence, leaving a bare repeat as prose", () => {
    expect(segmentCopy("[here](/x) and here")).toEqual([
      { text: "here", href: "/x" },
      { text: " and here" },
    ]);
  });

  it("does not collide with [[ ... ]] placeholder markers", () => {
    const placeholder = "[[BODY: pointer to references and the reviews page]]";
    expect(segmentCopy(placeholder)).toEqual([{ text: placeholder }]);
  });

  it("ignores parentheses that are not part of a link", () => {
    const text = "as an EMT, Wilderness First Responder (WFR), and shadow";
    expect(segmentCopy(text)).toEqual([{ text }]);
  });

  it("handles multiple links in one body", () => {
    expect(
      segmentCopy("see [resources](/resources) or [reviews](/reviews) now"),
    ).toEqual([
      { text: "see " },
      { text: "resources", href: "/resources" },
      { text: " or " },
      { text: "reviews", href: "/reviews" },
      { text: " now" },
    ]);
  });
});
