"use client";

import { useState, useTransition } from "react";

import { useToast } from "@/components/feedback/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitInquiry } from "@/features/inquiries";

export function ContactForm({
  defaultName,
  defaultEmail,
  defaultPhone,
}: {
  defaultName: string;
  defaultEmail: string;
  defaultPhone: string;
}) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

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
      <p className="text-foreground text-sm" role="status">
        Thanks - your message is on its way. Cal will reply soon.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={defaultName} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={defaultEmail}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={defaultPhone}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject">Subject (optional)</Label>
        <Input id="subject" name="subject" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="message">Message</Label>
        <Textarea id="message" name="message" required rows={5} />
      </div>
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
        disabled={isPending}
        className="self-start"
      >
        {isPending ? "Sending..." : "Send message"}
      </Button>
    </form>
  );
}
