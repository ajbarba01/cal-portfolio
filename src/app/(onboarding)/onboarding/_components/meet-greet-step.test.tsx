// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { BookingRuleSettings } from "@/features/booking/index.client";
import { MeetGreetStep } from "./meet-greet-step";

// The booked card mounts the realtime approval subscription. The status wording
// under test has nothing to do with it and should not need a Supabase channel.
vi.mock("./approval-watcher", () => ({ ApprovalWatcher: () => null }));

const RULES: BookingRuleSettings = {
  bookingOpenMinute: 480,
  bookingCloseMinute: 1080,
  minLeadTimeHours: 2,
  hardMaxAdvanceDays: 90,
};

type StepProps = Parameters<typeof MeetGreetStep>[0];

function renderStep(bookingStatus: StepProps["bookingStatus"]) {
  return render(
    <MeetGreetStep
      userId="user-1"
      rules={RULES}
      initialBusy={[]}
      bookingId="booking-1"
      bookingStartsAt="2026-06-07T15:00:00.000Z"
      bookingStatus={bookingStatus}
    />,
  );
}

describe("MeetGreetStep status card", () => {
  // REQUIRED_PROFILES.meet_greet is empty, so every self-serve request lands in
  // pending_approval and waits for Cal. The card must not read as booked-and-done.
  it("shows the pending label until Cal confirms the slot", () => {
    renderStep("pending_approval");
    expect(screen.getByText("Pending approval")).toBeInTheDocument();
    expect(screen.queryByText("Meet & greet confirmed")).toBeNull();
  });

  it("shows the confirmed wording once the booking is confirmed", () => {
    renderStep("confirmed");
    expect(screen.getByText("Meet & greet confirmed")).toBeInTheDocument();
  });

  // A missing status has to fail closed: claiming a confirmation Cal never gave
  // is the failure this card shipped with.
  it("does not claim a confirmation when the status is missing", () => {
    renderStep(null);
    expect(screen.getByText("Pending approval")).toBeInTheDocument();
    expect(screen.queryByText("Meet & greet confirmed")).toBeNull();
  });
});
