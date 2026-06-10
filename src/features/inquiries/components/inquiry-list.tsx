// src/features/inquiries/components/inquiry-list.tsx
"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { InquiryRow } from "@/features/inquiries/inquiry-actions";
import {
  filterInquiries,
  paginate,
  sortByRecency,
  type StatusFilter,
} from "@/features/inquiries/inquiry-list";

import { InquiryCard } from "./inquiry-card";
import { InquiryDetailDialog } from "./inquiry-detail-dialog";

const PAGE_SIZE = 8;

export function InquiryList({
  inquiries,
  editable,
  newLabel,
  searchPlaceholder,
  emptyTitle,
  renderIdentity,
  renderExtraActions,
  onResolve,
  onSaveEdit,
}: {
  inquiries: InquiryRow[];
  editable: boolean;
  newLabel: string;
  searchPlaceholder: string;
  emptyTitle: string;
  renderIdentity?: (inquiry: InquiryRow) => React.ReactNode;
  renderExtraActions?: (inquiry: InquiryRow) => React.ReactNode;
  onResolve: (id: string) => Promise<boolean>;
  onSaveEdit?: (
    id: string,
    patch: { subject: string | null; message: string },
  ) => Promise<boolean>;
}) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [page, setPage] = React.useState(1);

  const [openId, setOpenId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  // Separate in-flight flags so a save never visually disables the resolve
  // confirm (or vice versa).
  const [resolving, setResolving] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Edit is only truly available when the consumer both permits it and provides
  // a save handler — otherwise the Edit affordance would silently no-op.
  const canEdit = editable && Boolean(onSaveEdit);

  const filtered = filterInquiries(sortByRecency(inquiries), query, status);
  const view = paginate(filtered, page, PAGE_SIZE);

  const openInquiry = openId
    ? (inquiries.find((i) => i.id === openId) ?? null)
    : null;

  const statuses: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "new", label: newLabel },
    { key: "resolved", label: "Resolved" },
  ];

  function changeQuery(value: string) {
    setQuery(value);
    setPage(1);
  }
  function changeStatus(next: StatusFilter) {
    setStatus(next);
    setPage(1);
  }

  function requestResolve(inquiry: InquiryRow) {
    setOpenId(null);
    setEditing(false);
    setConfirmId(inquiry.id);
  }

  async function confirmResolve() {
    if (!confirmId) return;
    setResolving(true);
    try {
      const ok = await onResolve(confirmId);
      if (ok) setConfirmId(null);
    } finally {
      setResolving(false);
    }
  }

  function openForEdit(inquiry: InquiryRow) {
    setOpenId(inquiry.id);
    setEditing(true);
  }

  async function saveEdit(patch: { subject: string | null; message: string }) {
    if (!openId || !onSaveEdit) return;
    setSaving(true);
    try {
      const ok = await onSaveEdit(openId, patch);
      if (ok) setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (inquiries.length === 0) {
    return <EmptyState title={emptyTitle} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
            aria-label="Search inquiries"
          />
        </div>
        <div
          role="group"
          aria-label="Filter by status"
          className="bg-muted border-border inline-flex gap-1 rounded-md border p-1"
        >
          {statuses.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={status === key}
              onClick={() => changeStatus(key)}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                status === key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-muted-foreground text-sm sm:ml-auto">
          {filtered.length} {filtered.length === 1 ? "inquiry" : "inquiries"}
        </span>
      </div>

      {view.items.length === 0 ? (
        <EmptyState title="No inquiries match your search." />
      ) : (
        <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {view.items.map((inquiry) => (
            <li key={inquiry.id}>
              <InquiryCard
                inquiry={inquiry}
                editable={canEdit}
                newLabel={newLabel}
                renderIdentity={renderIdentity}
                renderExtraActions={renderExtraActions}
                onOpen={(i) => {
                  setOpenId(i.id);
                  setEditing(false);
                }}
                onEditClick={openForEdit}
                onResolveClick={requestResolve}
              />
            </li>
          ))}
        </ul>
      )}

      {view.pageCount > 1 ? (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-center gap-1.5"
        >
          <button
            type="button"
            disabled={view.page <= 1}
            onClick={() => setPage(view.page - 1)}
            className="border-border bg-card hover:bg-accent disabled:hover:bg-card h-9 rounded-md border px-3 text-sm disabled:opacity-40"
          >
            ‹ Prev
          </button>
          {Array.from({ length: view.pageCount }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-current={n === view.page ? "page" : undefined}
              onClick={() => setPage(n)}
              className={cn(
                "border-border h-9 min-w-9 rounded-md border px-2 text-sm",
                n === view.page
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-accent",
              )}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            disabled={view.page >= view.pageCount}
            onClick={() => setPage(view.page + 1)}
            className="border-border bg-card hover:bg-accent disabled:hover:bg-card h-9 rounded-md border px-3 text-sm disabled:opacity-40"
          >
            Next ›
          </button>
        </nav>
      ) : null}

      <InquiryDetailDialog
        inquiry={openInquiry}
        editing={editing}
        editable={canEdit}
        pending={saving}
        renderExtraActions={renderExtraActions}
        onOpenChange={(open) => {
          if (!open) {
            setOpenId(null);
            setEditing(false);
          }
        }}
        onResolveClick={requestResolve}
        onStartEdit={() => setEditing(true)}
        onCancelEdit={() => setEditing(false)}
        onSave={saveEdit}
      />

      <ConfirmDialog
        open={confirmId !== null}
        title="Mark this inquiry resolved?"
        description="This tells Cal you no longer need a reply. This can't be undone."
        confirmLabel="Yes, mark resolved"
        pending={resolving}
        onConfirm={confirmResolve}
        onOpenChange={(open) => {
          if (!open) setConfirmId(null);
        }}
      />
    </div>
  );
}
