import { describe, it, expect } from "vitest";
import { getGalleryImages, listGalleryFiles } from "./gallery-images";

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

describe("gallery alt text", () => {
  it("keeps the photo wall decorative", async () => {
    // Owner decision: no per-photo descriptions and no default sentence. The
    // grid button and the lightbox carry the accessible names instead, so a
    // filler alt here would be read once per photo for no information.
    const images = await getGalleryImages();
    expect(images.length).toBeGreaterThan(0);
    expect(images.every((img) => img.alt === "")).toBe(true);
  });
});
