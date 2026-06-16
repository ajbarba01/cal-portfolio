"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle, Clock, Send } from "lucide-react";

import { useToast } from "@/components/feedback/toast";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { ShimmerCard } from "@/components/ui/shimmer-card";
import { TextLink } from "@/components/ui/text-link";
import { submitInquiry } from "@/features/inquiries";

export function ContactForm({
  defaultName,
  defaultEmail,
  defaultPhone,
  heading,
  intro,
  replyNote,
}: {
  defaultName: string;
  defaultEmail: string;
  defaultPhone: string;
  /** Registry copy nodes — rendered server-side, see contact/page.tsx. */
  heading: React.ReactNode;
  intro: React.ReactNode;
  replyNote: React.ReactNode;
}) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (isDone) {
      successHeadingRef.current?.focus();
    }
  }, [isDone]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await submitInquiry({
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        subject: String(formData.get("subject") ?? ""),
        message: String(formData.get("message") ?? ""),
        company: String(formData.get("company") ?? ""),
      });
      if (result.ok) {
        setIsDone(true);
        form.reset();
        toast.add({
          type: "success",
          title: "Message sent",
          description: "Thanks - Cal will get back to you.",
        });
      } else {
        setError(result.error);
      }
    });
  }

  if (isDone) {
    return (
      <ShimmerCard className="p-6 sm:p-8">
        <div className="flex gap-4">
          <CheckCircle
            className="text-status-available-foreground mt-0.5 size-5 shrink-0"
            aria-hidden
          />
          <div className="flex flex-col gap-3">
            <h2
              ref={successHeadingRef}
              tabIndex={-1}
              className="font-heading text-foreground text-xl font-semibold outline-none"
            >
              Message sent.
            </h2>
            <p className="text-muted-foreground text-sm">
              Thanks — Cal will get back to you within a day. In the meantime
              you can <TextLink href="/book">check availability</TextLink>.
            </p>
          </div>
        </div>
      </ShimmerCard>
    );
  }

  return (
    <ShimmerCard className="p-6 sm:p-8">
      {/* Heading */}
      <h1 className="font-heading text-foreground text-2xl font-bold tracking-tight sm:text-[1.625rem]">
        {heading}
      </h1>
      <p className="text-muted-foreground mt-1.5 text-sm">{intro}</p>

      {/* Reply-time note */}
      <div className="border-border text-muted-foreground mt-4 flex items-center gap-2 border-b pb-4 text-xs">
        <Clock className="size-3.5 shrink-0" aria-hidden />
        <span>{replyNote}</span>
      </div>

      {/* Form */}
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}

        <FormField
          label="Name"
          name="name"
          defaultValue={defaultName}
          required
        />

        <FormField
          label="Email"
          name="email"
          type="email"
          defaultValue={defaultEmail}
          required
        />

        <FormField
          label="Phone"
          name="phone"
          type="tel"
          defaultValue={defaultPhone}
          required
        />

        <FormField
          label={
            <>
              Subject{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </>
          }
          name="subject"
        />

        <FormField label="Message" name="message">
          <Textarea name="message" required rows={5} />
        </FormField>

        {/* Honeypot */}
        <div
          aria-hidden
          className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
        >
          <label htmlFor="company">Company</label>
          <input
            id="company"
            name="company"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <Button
          type="submit"
          variant="brand"
          size="default"
          disabled={isPending}
          className="mt-1 w-full self-start sm:w-auto sm:self-start"
        >
          <Send className="size-4" aria-hidden />
          {isPending ? "Sending…" : "Send message"}
        </Button>
      </form>
    </ShimmerCard>
  );
}
