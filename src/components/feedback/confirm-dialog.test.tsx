// @vitest-environment jsdom

import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";

import { useConfirm } from "./confirm-dialog";

// ── Harness helpers ───────────────────────────────────────────────────────────

/**
 * A single React tree that owns both the trigger button and `{dialog}`.
 * We capture the returned promise in a closure so we can assert its resolution
 * without splitting state across two React trees.
 */
function makeHarness(
  opts: Parameters<ReturnType<typeof useConfirm>["confirm"]>[0],
) {
  let capturedOutcome: Promise<boolean> | undefined;

  function Harness() {
    const { confirm, dialog } = useConfirm();
    return (
      <>
        <button
          onClick={() => {
            capturedOutcome = confirm(opts);
          }}
        >
          open
        </button>
        {dialog}
      </>
    );
  }

  return {
    Harness,
    getOutcome: () => capturedOutcome,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useConfirm", () => {
  it("renders alertdialog with title when confirm() is called", async () => {
    const { Harness } = makeHarness({ title: "Delete?", destructive: true });
    render(<Harness />);

    fireEvent.click(screen.getByText("open"));

    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeTruthy();
    });
    expect(screen.getByText("Delete?")).toBeTruthy();
  });

  it("async path: shows pending label while onConfirm resolves and settles true", async () => {
    let resolveFn!: (v: boolean) => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<boolean>((res) => {
          resolveFn = res;
        }),
    );

    let capturedOutcome: Promise<boolean> | undefined;

    function Harness() {
      const { confirm, dialog } = useConfirm();
      return (
        <>
          <button
            onClick={() => {
              capturedOutcome = confirm({
                title: "Async action?",
                confirmLabel: "Go",
                onConfirm,
              });
            }}
          >
            open
          </button>
          {dialog}
        </>
      );
    }

    render(<Harness />);

    fireEvent.click(screen.getByText("open"));

    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeTruthy();
    });

    // Click Confirm — this triggers the async onConfirm
    const confirmBtn = screen.getByRole("button", { name: "Go" });
    fireEvent.click(confirmBtn);

    // Pending label should appear while promise is in flight
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Working…" })).toBeTruthy();
    });

    // Dialog should still be open
    expect(screen.getByRole("alertdialog")).toBeTruthy();

    // Resolve the promise
    await act(async () => {
      resolveFn(true);
    });

    // The outer confirm() promise should resolve true
    expect(await capturedOutcome).toBe(true);
  });
});
