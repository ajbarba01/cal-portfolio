"use client";

import Link from "next/link";
import { useState } from "react";

import { useToast } from "@/components/feedback/toast";
import { buttonVariants } from "@/components/ui/button";
import {
  InquiryList,
  markInquiryResolved,
  stampInquiryReplied,
  mailtoUrl,
  replyBody,
  replySubject,
  smsUrl,
  type InquiryRow,
} from "@/features/inquiries";

export function InquiriesClient({
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
    const result = await markInquiryResolved(id);
    if (result.kind === "success") {
      patch(id, { status: "resolved", resolved_at: new Date().toISOString() });
      toast.add({ type: "success", title: "Marked resolved" });
      return true;
    }
    toast.add({ type: "error", title: "Could not update the inquiry." });
    return false;
  }

  function onReply(inquiry: InquiryRow) {
    if (inquiry.replied_at) return;
    // Best-effort stamp; the mailto/sms anchor has already opened, so failures
    // here are non-blocking and simply leave the inquiry un-stamped.
    void stampInquiryReplied(inquiry.id)
      .then((result) => {
        if (result.kind === "success") {
          patch(inquiry.id, { replied_at: new Date().toISOString() });
        }
      })
      .catch(() => {});
  }

  function renderIdentity(inquiry: InquiryRow) {
    return (
      <>
        <span className="text-foreground font-semibold">{inquiry.name}</span>
        {" · "}
        {inquiry.email}
      </>
    );
  }

  function renderExtraActions(inquiry: InquiryRow) {
    const subject = replySubject(inquiry);
    const body = replyBody(inquiry);
    return (
      <>
        <a
          href={mailtoUrl(inquiry.email, subject, body)}
          className={buttonVariants({ variant: "brand", size: "sm" })}
          onClick={() => onReply(inquiry)}
        >
          Email
        </a>
        {inquiry.phone ? (
          <a
            href={smsUrl(inquiry.phone, body)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
            onClick={() => onReply(inquiry)}
          >
            Text
          </a>
        ) : null}
        {inquiry.client_id ? (
          <Link
            href={`/admin/clients/${inquiry.client_id}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            View client
          </Link>
        ) : null}
      </>
    );
  }

  return (
    <InquiryList
      inquiries={inquiries}
      editable={false}
      newLabel="New"
      searchPlaceholder="Search by name, email, or text…"
      emptyTitle="No inquiries yet."
      resolveTitle="Mark this inquiry resolved?"
      resolveDescription="This clears it from your open queue. You can still find it under the Resolved filter. This can't be undone."
      renderIdentity={renderIdentity}
      renderExtraActions={renderExtraActions}
      onResolve={onResolve}
    />
  );
}
