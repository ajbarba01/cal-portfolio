"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, Clock, Send } from "lucide-react";

import { useToast } from "@/components/feedback/toast";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { CharCounter } from "@/components/ui/char-counter";
import { ShimmerCard } from "@/components/ui/shimmer-card";
import { TextLink } from "@/components/ui/text-link";
import { createClient } from "@/lib/supabase/client";
import { submitInquiry, submitInquirySchema } from "@/features/inquiries";
import { FIELD_LIMITS } from "@/lib/field-limits";
import {
  useAppForm,
  Form,
  FormRootError,
  submitAction,
} from "@/components/form";

export function ContactForm({
  heading,
  intro,
  replyNote,
}: {
  /** Registry copy nodes — rendered server-side, see contact/page.tsx. */
  heading: React.ReactNode;
  intro: React.ReactNode;
  replyNote: React.ReactNode;
}) {
  const toast = useToast();
  const [isDone, setIsDone] = useState(false);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);

  const form = useAppForm(submitInquirySchema, {
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      subject: "",
      message: "",
      company: "",
    },
  });

  // Identity fields are prefilled browser-side for signed-in clients so the page
  // can render statically (no server cookie read). Guests get an empty form
  // immediately; a signed-in client's details fill in just after hydration.
  useEffect(() => {
    // /about sends a visitor here as ?ref=<name> when they want to be put in
    // touch with a reference whose details aren't published, so the subject
    // arrives carrying that reference's name and Cal knows who the message is
    // about. The name is the whole subject: no wording wraps it, because any
    // wrapper would be site copy nobody has approved. Read off location, not
    // useSearchParams — the latter would opt this route out of static
    // rendering. The value is a URL parameter, so cap it at the same limit the
    // field and the server schema enforce.
    const referenceName = new URLSearchParams(window.location.search).get(
      "ref",
    );
    if (referenceName) {
      form.reset({
        ...form.getValues(),
        subject: referenceName.slice(0, FIELD_LIMITS.shortText),
      });
    }

    const supabase = createClient();
    let active = true;
    // getSession() is the local cookie read (no network on HS256).
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      if (!active || !session) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email, phone")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!active) return;
      // Never clobber input the user has already started typing.
      if (form.formState.isDirty) return;
      form.reset({
        ...form.getValues(),
        name: profile?.full_name ?? "",
        email: profile?.email ?? session.user.email ?? "",
        phone: profile?.phone ?? "",
      });
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isDone) {
      successHeadingRef.current?.focus();
    }
  }, [isDone]);

  const message = form.watch("message");

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
              you can <TextLink href="/services">check availability</TextLink>.
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
      <Form
        form={form}
        onSubmit={submitAction(
          form,
          async (values) => {
            const r = await submitInquiry(values);
            return r.ok ? { ok: true } : { ok: false, message: r.error };
          },
          {
            onSuccess: () => {
              setIsDone(true);
              toast.add({
                type: "success",
                title: "Message sent",
                description: "Thanks - Cal will get back to you.",
              });
            },
          },
        )}
        className="mt-4 flex flex-col gap-4"
      >
        <FormRootError />

        <FormField
          label="Name"
          name="name"
          autoComplete="name"
          maxLength={FIELD_LIMITS.name}
        />

        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={FIELD_LIMITS.email}
        />

        <FormField
          label="Phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          maxLength={FIELD_LIMITS.phone}
        />

        <FormField
          label="Subject"
          name="subject"
          maxLength={FIELD_LIMITS.shortText}
          optional
        />

        <FormField
          label="Message"
          name="message"
          error={form.formState.errors.message?.message}
        >
          <Textarea
            {...form.register("message")}
            rows={5}
            maxLength={FIELD_LIMITS.message}
            aria-describedby="contact-message-counter"
          />
        </FormField>
        <CharCounter
          id="contact-message-counter"
          value={message}
          max={FIELD_LIMITS.message}
          className="-mt-2 text-right"
        />

        {/* Honeypot */}
        <div
          aria-hidden
          className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
        >
          <label htmlFor="company">Company</label>
          <input
            id="company"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            {...form.register("company")}
          />
        </div>

        <Button
          type="submit"
          variant="brand"
          size="default"
          disabled={form.formState.isSubmitting}
          className="mt-1 w-full self-start sm:w-auto sm:self-start"
        >
          <Send className="size-4" aria-hidden />
          {form.formState.isSubmitting ? "Sending…" : "Send message"}
        </Button>
      </Form>
    </ShimmerCard>
  );
}
