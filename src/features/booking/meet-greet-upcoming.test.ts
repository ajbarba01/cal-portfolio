import { describe, it, expect } from "vitest";
import { deriveMeetGreetUpcoming } from "./meet-greet-upcoming";

const now = new Date("2026-06-10T12:00:00Z");

describe("deriveMeetGreetUpcoming", () => {
  it("flags clients with a future non-terminal meet-greet booking", () => {
    const set = deriveMeetGreetUpcoming(
      [
        {
          client_id: "c1",
          starts_at: "2026-06-12T16:00:00Z",
          status: "confirmed",
        },
        {
          client_id: "c2",
          starts_at: "2026-06-01T16:00:00Z",
          status: "confirmed",
        }, // past
        {
          client_id: "c3",
          starts_at: "2026-06-20T16:00:00Z",
          status: "cancelled",
        }, // terminal
      ],
      now,
    );
    expect(set.has("c1")).toBe(true);
    expect(set.has("c2")).toBe(false);
    expect(set.has("c3")).toBe(false);
  });
});
