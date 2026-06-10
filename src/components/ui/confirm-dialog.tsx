// src/components/ui/confirm-dialog.tsx
"use client";

import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Generic confirmation modal over base-ui Dialog. Controlled via `open` +
 * `onOpenChange`. The confirm button is disabled while `pending`.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "brand",
  pending = false,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "brand" | "destructive" | "default";
  pending?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[#1c1813]/60 backdrop-blur-[2px]" />
        <Dialog.Popup className="bg-popover text-popover-foreground border-border fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-6 shadow-2xl outline-none">
          <div className="bg-brand/15 text-brand-strong mb-4 flex size-10 items-center justify-center rounded-full">
            <TriangleAlert className="size-5" aria-hidden="true" />
          </div>
          <Dialog.Title className="font-heading text-xl font-semibold">
            {title}
          </Dialog.Title>
          <Dialog.Description className="text-muted-foreground mt-2 text-sm">
            {description}
          </Dialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close
              render={<Button variant="outline" />}
              disabled={pending}
            >
              {cancelLabel}
            </Dialog.Close>
            <Button
              variant={confirmVariant}
              onClick={onConfirm}
              disabled={pending}
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
