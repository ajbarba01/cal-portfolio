"use client";

import * as React from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ConfirmOptions = {
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

export function useConfirm() {
  const [pending, setPending] = React.useState<Pending | null>(null);

  const confirm = React.useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ ...opts, resolve })),
    [],
  );

  function settle(ok: boolean) {
    if (!pending) return;
    pending.resolve(ok);
    setPending(null);
  }

  const dialog = (
    <AlertDialog.Root
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="bg-foreground/20 fixed inset-0 z-50 backdrop-blur-[1px]" />
        <AlertDialog.Popup
          className={cn(
            "bg-popover text-popover-foreground border-border fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-sm flex-col gap-3 rounded-t-xl border p-5 shadow-xl",
            "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl",
          )}
        >
          {pending ? (
            <>
              <AlertDialog.Title className="text-lg font-semibold">
                {pending.title}
              </AlertDialog.Title>
              {pending.description ? (
                <AlertDialog.Description className="text-muted-foreground text-sm">
                  {pending.description}
                </AlertDialog.Description>
              ) : null}
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => settle(false)}
                >
                  {pending.cancelLabel ?? "Cancel"}
                </Button>
                <Button
                  variant={pending.destructive ? "destructive" : "default"}
                  size="lg"
                  onClick={() => settle(true)}
                >
                  {pending.confirmLabel ?? "Confirm"}
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
