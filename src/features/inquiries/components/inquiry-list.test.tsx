// @vitest-environment jsdom

/**
 * The list renders inquiries in the order it is handed them. The admin queue is
 * sorted status-first (new before resolved, then newest) by the server action,
 * so a re-sort here would silently discard that ordering and bury the messages
 * Cal has not answered yet.
 */

import { beforeAll, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { InquiryRow } from "../inquiry-actions";
import { InquiryList } from "./inquiry-list";

// The Multiswitch measures its indicator through a ResizeObserver, which jsdom
// does not implement.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function row(overrides: Partial<InquiryRow>): InquiryRow {
  return {
    id: "1",
    client_id: null,
    name: "Jamie Rivera",
    email: "jamie@example.com",
    phone: null,
    subject: "Weekend walks",
    message: "Do you cover weekends?",
    status: "new",
    replied_at: null,
    resolved_at: null,
    created_at: "2026-06-01T12:00:00.000Z",
    ...overrides,
  };
}

/** The server's order: unanswered first, even when a resolved one is newer. */
const SERVER_ORDER = [
  row({ id: "older-new", subject: "Older but unanswered", status: "new" }),
  row({
    id: "newer-resolved",
    subject: "Newer but resolved",
    status: "resolved",
    created_at: "2026-06-09T12:00:00.000Z",
    resolved_at: "2026-06-09T13:00:00.000Z",
  }),
];

describe("InquiryList", () => {
  it("renders inquiries in the order it was given", () => {
    render(
      <InquiryList
        inquiries={SERVER_ORDER}
        editable={false}
        newLabel="New"
        searchPlaceholder="Search inquiries"
        emptyTitle="No inquiries yet."
        resolveTitle="Mark this inquiry resolved?"
        resolveDescription="This cannot be undone."
        onResolve={vi.fn().mockResolvedValue(true)}
      />,
    );

    const openButtons = screen.getAllByRole("button", {
      name: /^Open inquiry/,
    });
    expect(
      openButtons.map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Open inquiry: Older but unanswered",
      "Open inquiry: Newer but resolved",
    ]);
  });
});
