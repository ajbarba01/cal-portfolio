"use client";

import * as React from "react";
import { Check, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { InquiryRow } from "@/features/inquiries/inquiry-actions";
import {
  canEditInquiry,
  formatInquiryDate,
} from "@/features/inquiries/inquiry-list";

export function InquiryCard({
  inquiry,
  editable,
  newLabel,
  renderIdentity,
  onOpen,
  onEditClick,
  onResolveClick,
}: {
  inquiry: InquiryRow;
  /** Capability: this consumer permits client edits at all (account = true). */
  editable: boolean;
  /** Label for the "new" status badge ("Open" for account, "New" for admin). */
  newLabel: string;
  renderIdentity?: (inquiry: InquiryRow) => React.ReactNode;
  onOpen: (inquiry: InquiryRow) => void;
  onEditClick: (inquiry: InquiryRow) => void;
  onResolveClick: (inquiry: InquiryRow) => void;
}) {
  const isNew = inquiry.status === "new";
  const showEdit = editable && canEditInquiry(inquiry);
  // Resolve is available to any consumer (account + admin); only edit is account-gated.
  const showResolve = isNew;

  return (
    // Stacking: this card establishes its own context (hover translate creates one).
    // The z-order of the overlay (z-0), content (z-[1]) and footer actions (z-10)
    // is resolved *within* this card, so it survives ancestor stacking changes.
    <div className="bg-card border-border hover:border-brand/40 relative flex h-47 flex-col rounded-xl border p-4 transition-all hover:-translate-y-px hover:shadow-lg">
      {/* Stretched overlay button: opens the popup; sits below the content. */}
      <button
        type="button"
        onClick={() => onOpen(inquiry)}
        aria-label={`Open inquiry${inquiry.subject ? `: ${inquiry.subject}` : ""}`}
        className="focus-visible:ring-ring/50 absolute inset-0 z-0 rounded-xl focus-visible:ring-3 focus-visible:outline-none"
      />

      {/* Content layer — pointer-events-none so clicks reach the overlay. */}
      <div className="pointer-events-none relative z-[1] flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex items-start gap-2">
          {inquiry.subject ? (
            <span className="font-heading flex-1 truncate text-base font-semibold">
              {inquiry.subject}
            </span>
          ) : (
            <span className="text-muted-foreground flex-1 truncate text-base font-medium italic">
              No subject
            </span>
          )}
          <Badge variant={isNew ? "pending" : "available"}>
            {isNew ? newLabel : "Resolved"}
          </Badge>
        </div>

        {renderIdentity ? (
          <div className="text-muted-foreground -mt-1 mb-2 truncate text-xs font-medium">
            {renderIdentity(inquiry)}
          </div>
        ) : null}

        <p className="text-foreground/80 line-clamp-3 min-h-0 flex-1 text-sm">
          {inquiry.message}
        </p>
      </div>

      {/* Footer: meta always; Edit/Resolve desktop-only (mobile + reply/view
          actions all live in the popup). Date truncates so the row never
          overflows a narrow tile. */}
      <div className="border-border/60 relative z-10 mt-3 flex items-center gap-2 border-t pt-3">
        <span className="text-muted-foreground pointer-events-none mr-auto min-w-0 truncate text-xs">
          {formatInquiryDate(inquiry.created_at)}
        </span>
        {inquiry.replied_at ? (
          <span className="text-status-available-foreground pointer-events-none inline-flex shrink-0 items-center gap-1 text-xs font-medium">
            <Check className="size-3" aria-hidden="true" /> replied
          </span>
        ) : null}
        <div className="pointer-events-auto hidden shrink-0 items-center gap-1.5 sm:flex">
          {showEdit ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEditClick(inquiry)}
            >
              <Pencil className="size-3.5" /> Edit
            </Button>
          ) : null}
          {showResolve ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onResolveClick(inquiry)}
            >
              Resolve
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
