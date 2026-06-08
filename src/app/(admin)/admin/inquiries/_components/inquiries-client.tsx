"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { useToast } from "@/components/feedback/toast";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  markInquiryResolved,
  stampInquiryReplied,
  type InquiryRow,
} from "@/features/inquiries/inquiry-actions";
import {
  mailtoUrl,
  replyBody,
  replySubject,
  smsUrl,
} from "@/features/inquiries/reply-draft";

function denver(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/Denver" });
}

export function InquiriesClient({
  initialInquiries,
}: {
  initialInquiries: InquiryRow[];
}) {
  const toast = useToast();
  const [inquiries, setInquiries] = useState(initialInquiries);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function patch(id: string, fields: Partial<InquiryRow>) {
    setInquiries((previous) =>
      previous.map((inquiry) =>
        inquiry.id === id ? { ...inquiry, ...fields } : inquiry,
      ),
    );
  }

  function onReply(inquiry: InquiryRow) {
    if (inquiry.replied_at) return;
    startTransition(async () => {
      const result = await stampInquiryReplied(inquiry.id);
      if (result.kind === "success") {
        patch(inquiry.id, { replied_at: new Date().toISOString() });
      }
    });
  }

  function replyHref(inquiry: InquiryRow, channel: "email" | "sms") {
    const subject = replySubject(inquiry);
    const body = replyBody(inquiry);
    return channel === "email"
      ? mailtoUrl(inquiry.email, subject, body)
      : smsUrl(inquiry.phone ?? "", body);
  }

  function onResolve(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await markInquiryResolved(id);
      if (result.kind === "success") {
        patch(id, {
          status: "resolved",
          resolved_at: new Date().toISOString(),
        });
        toast.add({ title: "Marked resolved" });
      } else {
        setError("Could not update the inquiry.");
      }
    });
  }

  if (inquiries.length === 0) {
    return <EmptyState title="No inquiries yet." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {inquiries.map((inquiry) => (
          <li
            key={inquiry.id}
            className="bg-card border-border flex flex-col gap-2 rounded-xl border p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-foreground font-semibold">
                {inquiry.name}
              </span>
              <Badge
                variant={inquiry.status === "new" ? "pending" : "unavailable"}
              >
                {inquiry.status}
              </Badge>
              {inquiry.replied_at ? (
                <span className="text-muted-foreground text-xs">replied</span>
              ) : null}
              <span className="text-muted-foreground ml-auto text-xs">
                {denver(inquiry.created_at)}
              </span>
            </div>
            {inquiry.subject ? (
              <p className="text-foreground text-sm font-medium">
                {inquiry.subject}
              </p>
            ) : null}
            <p className="text-foreground text-sm whitespace-pre-wrap">
              {inquiry.message}
            </p>
            <p className="text-muted-foreground text-xs">
              {inquiry.email}
              {inquiry.phone ? ` · ${inquiry.phone}` : ""}
              {inquiry.client_id ? (
                <>
                  {" · "}
                  <Link
                    href={`/admin/clients/${inquiry.client_id}`}
                    className="underline"
                  >
                    view client
                  </Link>
                </>
              ) : null}
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={replyHref(inquiry, "email")}
                className={buttonVariants({ size: "sm" })}
                onClick={() => onReply(inquiry)}
              >
                Email
              </a>
              {inquiry.phone ? (
                <a
                  href={replyHref(inquiry, "sms")}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  onClick={() => onReply(inquiry)}
                >
                  Text
                </a>
              ) : null}
              {inquiry.status === "new" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => onResolve(inquiry.id)}
                >
                  Mark resolved
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
