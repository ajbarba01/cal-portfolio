// src/features/inquiries/components/inquiry-detail-dialog.tsx
"use client";

import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Check, Pencil, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardShimmer } from "@/components/effects/card-shimmer";
import type { InquiryRow } from "@/features/inquiries/inquiry-actions";
import {
  canEditInquiry,
  formatInquiryDate,
} from "@/features/inquiries/inquiry-list";

/**
 * Controlled edit fields. Seeded once from the inquiry on mount — the parent
 * remounts this via `key={inquiry.id}`, so state resets per inquiry without a
 * set-state-in-effect. Controlled (not defaultValue) so base-ui's FieldControl
 * never warns about a changing uncontrolled default after an optimistic patch.
 */
function InquiryEditFields({
  inquiry,
  pending,
  onCancelEdit,
  onSave,
}: {
  inquiry: InquiryRow;
  pending: boolean;
  onCancelEdit: () => void;
  onSave: (patch: { subject: string | null; message: string }) => void;
}) {
  const [subject, setSubject] = React.useState(inquiry.subject ?? "");
  const [message, setMessage] = React.useState(inquiry.message);
  const canSave = message.trim().length > 0 && !pending;

  return (
    <>
      <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inquiry-edit-subject">Subject</Label>
          <Input
            id="inquiry-edit-subject"
            name="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inquiry-edit-message">Message</Label>
          <textarea
            id="inquiry-edit-message"
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={4000}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 min-h-32 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-3"
          />
        </div>
      </div>

      <div className="border-border bg-background/60 flex flex-col gap-2 border-t px-6 py-4 sm:flex-row sm:items-center">
        <Button
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={onCancelEdit}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          className="w-full sm:ml-auto sm:w-auto"
          disabled={!canSave}
          onClick={() =>
            onSave({
              subject: subject.trim() ? subject.trim() : null,
              message,
            })
          }
        >
          <Save className="size-3.5" /> {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </>
  );
}

export function InquiryDetailDialog({
  inquiry,
  editing,
  editable,
  pending,
  renderExtraActions,
  onOpenChange,
  onResolveClick,
  onStartEdit,
  onCancelEdit,
  onSave,
}: {
  /** null = closed. */
  inquiry: InquiryRow | null;
  editing: boolean;
  editable: boolean;
  pending: boolean;
  renderExtraActions?: (inquiry: InquiryRow) => React.ReactNode;
  onOpenChange: (open: boolean) => void;
  onResolveClick: (inquiry: InquiryRow) => void;
  /** Enter edit mode (one-way; leaving edit mode is onCancelEdit/onSave). */
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: { subject: string | null; message: string }) => void;
}) {
  const open = inquiry !== null;

  const showEdit = inquiry !== null && editable && canEditInquiry(inquiry);
  const showResolve = inquiry !== null && inquiry.status === "new";
  // Read-mode footer is only rendered when it would carry an action.
  const hasReadActions = Boolean(renderExtraActions) || showEdit || showResolve;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="bg-foreground/60 fixed inset-0 z-50 backdrop-blur-[2px]" />
        <Dialog.Popup
          data-ring-modal-surface
          className="group bg-popover text-popover-foreground border-border fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col rounded-t-2xl border shadow-2xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[80vh] sm:w-[min(32rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        >
          <CardShimmer alwaysOn />
          {/* Inner clip layer: rounds the full-bleed footer's corners to the
              panel edge. overflow-hidden can't live on the panel itself — it
              would clip the bleeding ring. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit]">
            {inquiry ? (
              <>
                <div className="flex items-start gap-3 px-6 pt-6 pb-3">
                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <Dialog.Title className="text-muted-foreground text-sm font-semibold">
                        Editing inquiry
                      </Dialog.Title>
                    ) : (
                      <Dialog.Title className="font-heading truncate text-xl font-semibold">
                        {inquiry.subject ?? "No subject"}
                      </Dialog.Title>
                    )}
                    <p className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span>Sent {formatInquiryDate(inquiry.created_at)}</span>
                      {inquiry.replied_at ? (
                        <span className="text-status-available-foreground inline-flex items-center gap-1 font-medium">
                          <Check className="size-3" aria-hidden="true" /> Cal
                          replied
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <Dialog.Close
                    aria-label="Close"
                    className="bg-muted text-muted-foreground hover:bg-accent hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-full"
                  >
                    <X className="size-4" />
                  </Dialog.Close>
                </div>

                {editing ? (
                  <InquiryEditFields
                    key={inquiry.id}
                    inquiry={inquiry}
                    pending={pending}
                    onCancelEdit={onCancelEdit}
                    onSave={onSave}
                  />
                ) : (
                  <>
                    <div className="text-foreground/85 overflow-y-auto px-6 pb-5 text-sm leading-relaxed whitespace-pre-wrap">
                      {inquiry.message}
                    </div>

                    {hasReadActions ? (
                      <div className="border-border bg-background/60 flex flex-wrap items-center gap-2 border-t px-6 py-4">
                        {renderExtraActions
                          ? renderExtraActions(inquiry)
                          : null}
                        {showEdit ? (
                          <Button variant="ghost" onClick={onStartEdit}>
                            <Pencil className="size-3.5" /> Edit
                          </Button>
                        ) : null}
                        {showResolve ? (
                          <Button
                            variant="brand"
                            className="ml-auto"
                            onClick={() => onResolveClick(inquiry)}
                          >
                            Mark resolved
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </>
            ) : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
