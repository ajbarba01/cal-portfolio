"use client";

import * as React from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CardShimmer } from "@/components/effects/card-shimmer";
import {
  dialogBackdropClass,
  dialogPanelClass,
} from "@/components/feedback/dialog-shell";

type ConfirmOptions = {
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /**
   * Optional async handler. When provided, clicking Confirm sets a busy/pending
   * state, awaits this function, and only settles the dialog closed on `true`.
   * If it returns `false` (or throws), the dialog stays open.
   */
  onConfirm?: () => Promise<boolean>;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

export function useConfirm() {
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [busy, setBusy] = React.useState(false);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  const confirm = React.useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ ...opts, resolve })),
    [],
  );

  function settle(ok: boolean) {
    if (!pending) return;
    pending.resolve(ok);
    setPending(null);
    setBusy(false);
  }

  async function onConfirmClick() {
    if (!pending) return;
    if (pending.onConfirm) {
      setBusy(true);
      try {
        const ok = await pending.onConfirm();
        if (ok) {
          settle(true);
        } else {
          setBusy(false);
        }
      } catch {
        setBusy(false);
      }
      return;
    }
    settle(true);
  }

  const isDestructive = pending?.destructive ?? false;

  const dialog = (
    <AlertDialog.Root
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && !busy) settle(false);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={dialogBackdropClass} />
        <AlertDialog.Popup
          data-slot="confirm-dialog"
          data-ring-modal-surface
          initialFocus={cancelRef}
          className={cn(dialogPanelClass, "max-w-sm")}
        >
          <CardShimmer alwaysOn />
          {pending ? (
            <>
              {/* Icon badge */}
              <div
                aria-hidden="true"
                className={cn(
                  "flex size-10 items-center justify-center rounded-full",
                  isDestructive
                    ? "bg-destructive/10 text-destructive"
                    : "bg-brand/15 text-brand-strong",
                )}
              >
                <TriangleAlert className="size-5" />
              </div>

              <AlertDialog.Title className="font-heading text-lg font-semibold">
                {pending.title}
              </AlertDialog.Title>

              {pending.description ? (
                <AlertDialog.Description className="text-muted-foreground text-sm">
                  {pending.description}
                </AlertDialog.Description>
              ) : null}

              <div className="mt-2 flex justify-end gap-2">
                <Button
                  ref={cancelRef}
                  variant="outline"
                  size="lg"
                  disabled={busy}
                  onClick={() => settle(false)}
                >
                  {pending.cancelLabel ?? "Cancel"}
                </Button>
                <Button
                  variant={isDestructive ? "destructive" : "default"}
                  size="lg"
                  disabled={busy}
                  onClick={onConfirmClick}
                >
                  {busy ? "Working…" : (pending.confirmLabel ?? "Confirm")}
                </Button>
              </div>
            </>
          ) : null}
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );

  return { confirm, dialog };
}
