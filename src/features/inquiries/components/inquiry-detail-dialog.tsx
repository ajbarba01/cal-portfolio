// src/features/inquiries/components/inquiry-detail-dialog.tsx
"use client";

import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Check, Pencil, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InquiryRow } from "@/features/inquiries/inquiry-actions";
import {
  canEditInquiry,
  formatInquiryDate,
} from "@/features/inquiries/inquiry-list";

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
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[#1c1813]/60 backdrop-blur-[2px]" />
        <Dialog.Popup className="bg-popover text-popover-foreground border-border fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col rounded-t-2xl border shadow-2xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[80vh] sm:w-[min(32rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
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
                  <p className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2 text-xs">
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
                <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-5">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="inquiry-edit-subject">Subject</Label>
                    <Input
                      id="inquiry-edit-subject"
                      name="subject"
                      defaultValue={inquiry.subject ?? ""}
                      maxLength={200}
                      key={`subject-${inquiry.id}`}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="inquiry-edit-message">Message</Label>
                    <textarea
                      id="inquiry-edit-message"
                      name="message"
                      defaultValue={inquiry.message}
                      maxLength={4000}
                      key={`message-${inquiry.id}`}
                      className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 min-h-32 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-3"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-foreground/85 overflow-y-auto px-6 pb-5 text-sm leading-relaxed whitespace-pre-wrap">
                  {inquiry.message}
                </div>
              )}

              {editing || hasReadActions ? (
                <div className="border-border bg-background/60 flex flex-col gap-2 border-t px-6 py-4 sm:flex-row sm:items-center">
                  {editing ? (
                    <>
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
                        disabled={pending}
                        onClick={() => {
                          const subjectEl = document.getElementById(
                            "inquiry-edit-subject",
                          ) as HTMLInputElement | null;
                          const messageEl = document.getElementById(
                            "inquiry-edit-message",
                          ) as HTMLTextAreaElement | null;
                          if (!messageEl) return;
                          const subject = subjectEl?.value.trim() ?? "";
                          onSave({
                            subject: subject ? subject : null,
                            message: messageEl.value,
                          });
                        }}
                      >
                        <Save className="size-3.5" />{" "}
                        {pending ? "Saving…" : "Save changes"}
                      </Button>
                    </>
                  ) : (
                    <>
                      {renderExtraActions ? (
                        <div className="flex flex-wrap gap-2">
                          {renderExtraActions(inquiry)}
                        </div>
                      ) : null}
                      {showEdit ? (
                        <Button
                          variant="ghost"
                          className="w-full sm:w-auto"
                          onClick={onStartEdit}
                        >
                          <Pencil className="size-3.5" /> Edit
                        </Button>
                      ) : null}
                      {showResolve ? (
                        <Button
                          variant="brand"
                          className="w-full sm:ml-auto sm:w-auto"
                          onClick={() => onResolveClick(inquiry)}
                        >
                          Mark resolved
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
