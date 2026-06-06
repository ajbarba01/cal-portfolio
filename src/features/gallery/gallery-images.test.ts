import { describe, it, expect } from "vitest";
import { listGalleryFiles } from "./gallery-images";

describe("listGalleryFiles", () => {
  it("keeps only image files, case-insensitive", () => {
    expect(
      listGalleryFiles(["a.JPG", "b.jpeg", "c.png", "notes.txt", ".DS_Store"]),
    ).toEqual(["a.JPG", "b.jpeg", "c.png"]);
  });
  it("sorts stably and case-insensitively", () => {
    expect(listGalleryFiles(["B.JPG", "a.jpg", "C.JPG"])).toEqual([
      "a.jpg",
      "B.JPG",
      "C.JPG",
    ]);
  });
});
