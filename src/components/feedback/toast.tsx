"use client";

import * as React from "react";
import { Toast } from "@base-ui/react/toast";
import type { ToastManagerAddOptions } from "@base-ui/react/toast";
import { Check, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type AddOptions = ToastManagerAddOptions<object>;

/**
 * Applies the type-based duration + ARIA-announcement policy (U7) unless the
 * caller overrides. Errors are sticky + assertive; everything else inherits the
 * provider's 5s default and announces politely. Action-bearing toasts should
 * pass `timeout: 0` explicitly (an interactive toast must persist — a11y rule).
 */
export function toastDefaults(opts: AddOptions): AddOptions {
  const isError = opts.type === "error";
  return {
    priority: isError ? "high" : "low",
    ...(isError ? { timeout: 0 } : {}),
    ...opts, // explicit caller values win
  };
}

export function useToast() {
  const manager = Toast.useToastManager();
  return React.useMemo(
    () => ({
      ...manager,
      add: (opts: AddOptions) => manager.add(toastDefaults(opts)),
    }),
    [manager],
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider>
      {children}
      <Toaster />
    </Toast.Provider>
  );
}

function Toaster() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport
        className={cn(
          "fixed z-[100] flex flex-col gap-2 outline-none",
          "inset-x-0 bottom-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
          "sm:inset-x-0 sm:top-0 sm:bottom-auto sm:mx-auto sm:w-96",
        )}
      >
        {toasts.map((toast) => {
          const isError = toast.type === "error";
          return (
            <Toast.Root
              key={toast.id}
              toast={toast}
              data-slot="toast"
              className={cn(
                "bg-card text-card-foreground border-border relative flex items-start gap-3 overflow-hidden rounded-xl border p-3 pr-2 shadow-lg",
                "w-full max-w-sm transition-all duration-300 ease-out",
                "data-starting-style:translate-y-2 data-starting-style:opacity-0",
                "data-ending-style:opacity-0 motion-reduce:transition-none",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                  isError
                    ? "bg-destructive/10 text-destructive"
                    : "bg-status-available text-status-available-foreground",
                )}
              >
                {isError ? (
                  <AlertTriangle className="size-4" />
                ) : (
                  <Check className="size-4" />
                )}
              </span>
              <div className="flex flex-1 flex-col">
                <Toast.Title className="text-sm font-semibold" />
                <Toast.Description className="text-muted-foreground text-xs" />
              </div>
              <Toast.Close
                aria-label="Dismiss"
                className="text-muted-foreground hover:text-foreground rounded-md p-1"
              >
                <X className="size-4" />
              </Toast.Close>
            </Toast.Root>
          );
        })}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
