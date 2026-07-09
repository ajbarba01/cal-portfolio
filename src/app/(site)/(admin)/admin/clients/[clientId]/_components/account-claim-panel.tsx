"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/ui/surface";
import { useToast } from "@/components/feedback/toast";
import { generateClaimLink } from "@/features/admin";

export function AccountClaimPanel({
  clientId,
  invitedAt,
}: {
  clientId: string;
  invitedAt: string | null;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [url, setUrl] = useState<string | null>(null);

  function handleGenerate() {
    start(async () => {
      const result = await generateClaimLink(clientId);
      if (result.kind === "success") {
        setUrl(result.url);
      } else if (result.kind === "not_unclaimed") {
        toast.add({
          type: "error",
          title: "Already claimed",
          description: "This client has taken over their account.",
        });
      } else {
        toast.add({
          type: "error",
          title: "Couldn't generate a link",
          description: "Please try again.",
        });
      }
    });
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.add({ type: "success", title: "Link copied" });
  }

  return (
    <Surface variant="plain" className="p-4">
      <h3 className="font-medium">Account claim</h3>
      <p className="text-muted-foreground mt-1 text-sm">
        This is a Cal-created account. Generate a one-time link and send it to
        the client so they can set a password and take it over.
        {invitedAt
          ? ` Last link generated ${new Date(invitedAt).toLocaleString()}.`
          : ""}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">
        Treat this link like a password — anyone with it can take over the
        account.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={handleGenerate} disabled={pending}>
          {pending
            ? "Generating…"
            : invitedAt
              ? "Regenerate claim link"
              : "Generate claim link"}
        </Button>
      </div>
      {url ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            readOnly
            value={url}
            className="min-w-0 flex-1"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button variant="secondary" onClick={copy}>
            Copy
          </Button>
        </div>
      ) : null}
    </Surface>
  );
}
