"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type SignOutButtonProps = Omit<
  React.ComponentProps<"button">,
  "type" | "onClick" | "disabled"
> & {
  children?: React.ReactNode;
};

export function SignOutButton({
  className,
  children,
  ...props
}: SignOutButtonProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isSigningOut}
      className={cn(
        "text-left transition-colors disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {isSigningOut ? "Signing out…" : (children ?? "Sign out")}
    </button>
  );
}
