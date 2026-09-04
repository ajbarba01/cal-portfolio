// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Reference } from "@/content/references";
import { ReferenceList } from "./reference-list";

// The island reads the registry module directly, so the fixture is the same
// array object the component sees — tests refill it rather than re-mocking.
const { registry } = vi.hoisted(() => ({ registry: [] as Reference[] }));
vi.mock("@/content/references", () => ({ references: registry }));

beforeEach(() => {
  registry.length = 0;
});

describe("ReferenceList", () => {
  it("renders nothing while Cal has supplied no references", () => {
    const { container } = render(<ReferenceList />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sends a reference with no published contact to the contact form", () => {
    registry.push({ name: "Ginna, Bill and Niko", contact: null });
    render(<ReferenceList />);
    expect(screen.getByRole("link", { name: "Ginna" })).toHaveAttribute(
      "href",
      "/contact?ref=Ginna",
    );
  });

  // The number is fictional (the reserved 555-01xx range). Cal holds real
  // numbers for the named references, and none of them is published.
  it("reveals a published contact in a dialog", async () => {
    registry.push({
      name: "Abby and Sloane",
      contact: { phone: "303 555 0142" },
    });
    const user = userEvent.setup();
    render(<ReferenceList />);
    // The chip reads as the name alone until the visitor asks for the rest.
    expect(screen.queryByText("303 555 0142")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Abby" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Abby and Sloane");
    expect(screen.getByRole("link", { name: /303 555 0142/ })).toHaveAttribute(
      "href",
      "tel:3035550142",
    );
  });
});

describe("chip face", () => {
  it("draws the fallback bubble until Cal supplies a photo", () => {
    registry.push({ name: "Carol", contact: null });
    const { container } = render(<ReferenceList />);
    expect(container.querySelector("img")).toBeNull();
    // The bubble itself still occupies the chip, so a photo landing later
    // changes no geometry.
    expect(container.querySelector(".lucide-paw-print")).not.toBeNull();
  });

  it("draws the photo once it exists", () => {
    registry.push({ name: "Carol", contact: null, photo: "millie.jpg" });
    const { container } = render(<ReferenceList />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("src")).toContain("millie.jpg");
  });
});
