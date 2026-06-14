"use client";
import * as React from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CardShimmer } from "@/components/effects/card-shimmer";
import {
  dialogBackdropClass,
  dialogPanelClass,
} from "@/components/feedback/dialog-shell";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={dialogBackdropClass} />
        <BaseDialog.Popup
          data-ring-modal-surface
          className={cn(dialogPanelClass, className)}
        >
          <CardShimmer alwaysOn />
          <div className="flex items-start justify-between gap-4">
            <BaseDialog.Title className="font-heading text-lg font-semibold">
              {title}
            </BaseDialog.Title>
            <BaseDialog.Close
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground -m-1 rounded-md p-1"
            >
              <X className="size-4" />
            </BaseDialog.Close>
          </div>
          {description ? (
            <BaseDialog.Description className="text-muted-foreground text-sm">
              {description}
            </BaseDialog.Description>
          ) : null}
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
