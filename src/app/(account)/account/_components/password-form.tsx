"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "@/features/accounts";

export function PasswordForm() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("idle");
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setStatus("error");
      setMessage("Passwords don't match.");
      return;
    }

    startTransition(async () => {
      const result = await changePassword(newPassword);
      if (result.kind === "success") {
        setStatus("success");
        setMessage("Password updated.");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setStatus("error");
        setMessage(result.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new_password">New password</Label>
          <Input
            id="new_password"
            name="new_password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm_password">Confirm</Label>
          <Input
            id="confirm_password"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
      </div>

      {status === "error" && message && (
        <p role="alert" className="text-destructive text-sm">
          {message}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="outline"
          disabled={isPending}
          className="self-start"
        >
          {isPending ? "Updating…" : "Update password"}
        </Button>
        {status === "success" && (
          <span
            role="status"
            className="text-status-available-foreground inline-flex items-center gap-1 text-sm font-medium"
          >
            <Check className="size-4" strokeWidth={3} aria-hidden="true" />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
