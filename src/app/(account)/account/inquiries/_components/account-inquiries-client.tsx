"use client";

import { useState } from "react";

import { useToast } from "@/components/feedback/toast";
import { InquiryList } from "@/features/inquiries/components/inquiry-list";
import {
  editMyInquiry,
  resolveMyInquiry,
  type InquiryRow,
} from "@/features/inquiries/inquiry-actions";

export function AccountInquiriesClient({
  initialInquiries,
}: {
  initialInquiries: InquiryRow[];
}) {
  const toast = useToast();
  const [inquiries, setInquiries] = useState(initialInquiries);

  function patch(id: string, fields: Partial<InquiryRow>) {
    setInquiries((prev) =>
      prev.map((inquiry) =>
        inquiry.id === id ? { ...inquiry, ...fields } : inquiry,
      ),
    );
  }

  async function onResolve(id: string): Promise<boolean> {
    const result = await resolveMyInquiry(id);
    if (result.kind === "success") {
      patch(id, { status: "resolved", resolved_at: new Date().toISOString() });
      toast.add({ title: "Marked resolved" });
      return true;
    }
    toast.add({ title: "Could not update the inquiry." });
    return false;
  }

  async function onSaveEdit(
    id: string,
    next: { subject: string | null; message: string },
  ): Promise<boolean> {
    const result = await editMyInquiry(id, {
      subject: next.subject ?? "",
      message: next.message,
    });
    if (result.kind === "success") {
      patch(id, { subject: next.subject, message: next.message });
      toast.add({ title: "Inquiry updated" });
      return true;
    }
    toast.add({
      title:
        result.kind === "error" ? result.message : "Could not save changes.",
    });
    return false;
  }

  return (
    <InquiryList
      inquiries={inquiries}
      editable
      newLabel="Open"
      searchPlaceholder="Search your inquiries…"
      emptyTitle="No inquiries yet."
      resolveTitle="Mark this inquiry resolved?"
      resolveDescription="This tells Cal you no longer need a reply. This can't be undone."
      onResolve={onResolve}
      onSaveEdit={onSaveEdit}
    />
  );
}
