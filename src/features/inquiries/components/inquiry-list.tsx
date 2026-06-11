// src/features/inquiries/components/inquiry-list.tsx
"use client";

import * as React from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { useConfirm } from "@/components/feedback/confirm-dialog";
import { Multiswitch } from "@/components/ui/multiswitch";
import { Pagination } from "@/components/ui/pagination";
import { ResultCount } from "@/components/ui/result-count";
import { SearchField } from "@/components/ui/search-field";
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
  resolveTitle,
  resolveDescription,
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
  /** Copy for the irreversible resolve confirm — differs per consumer. */
  resolveTitle: string;
  resolveDescription: string;
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
  const [saving, setSaving] = React.useState(false);

  const { confirm, dialog } = useConfirm();

  // Edit is only truly available when the consumer both permits it and provides
  // a save handler — otherwise the Edit affordance would silently no-op.
  const canEdit = editable && Boolean(onSaveEdit);

  const filtered = filterInquiries(sortByRecency(inquiries), query, status);
  const view = paginate(filtered, page, PAGE_SIZE);

  const openInquiry = openId
    ? (inquiries.find((i) => i.id === openId) ?? null)
    : null;

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "new", label: newLabel },
    { value: "resolved", label: "Resolved" },
  ];

  function changeQuery(value: string) {
    setQuery(value);
    setPage(1);
  }
  function changeStatus(next: StatusFilter) {
    setStatus(next);
    setPage(1);
  }

  async function requestResolve(inquiry: InquiryRow) {
    setOpenId(null);
    setEditing(false);
    await confirm({
      title: resolveTitle,
      description: resolveDescription,
      confirmLabel: "Yes, mark resolved",
      onConfirm: () => onResolve(inquiry.id),
    });
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
      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          value={query}
          onValueChange={changeQuery}
          placeholder={searchPlaceholder}
          ariaLabel="Search inquiries"
        />
        <Multiswitch
          options={statusOptions}
          value={status}
          onValueChange={changeStatus}
          ariaLabel="Filter by status"
        />
        <ResultCount
          count={filtered.length}
          noun="inquiry"
          pluralNoun="inquiries"
        />
      </div>

      {view.items.length === 0 ? (
        <EmptyState title="No inquiries match your search." />
      ) : (
        <ul className="flex flex-col gap-2">
          {view.items.map((inquiry) => (
            <li key={inquiry.id}>
              <InquiryCard
                inquiry={inquiry}
                editable={canEdit}
                newLabel={newLabel}
                renderIdentity={renderIdentity}
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

      <Pagination
        page={view.page}
        pageCount={view.pageCount}
        onPageChange={setPage}
      />

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

      {dialog}
    </div>
  );
}
